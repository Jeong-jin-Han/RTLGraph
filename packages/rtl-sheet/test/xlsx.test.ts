import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ComponentGraph, FsmGraph } from '@rtlgraph/ir'
import { columnName, controlSheets, crc32, fsmSheets, renderXlsx, sheetName } from '../src/index.ts'

const DEMO = join(import.meta.dirname, '../../../demo')
const read = (path: string) => JSON.parse(readFileSync(join(DEMO, path), 'utf8'))
const acc = read('acc/acc/acc.rtlgraph-schematic.json') as ComponentGraph
const machine = read('pwm/pwm/pwm.rtlgraph-fsm.json') as FsmGraph

// The archive, read back the way a spreadsheet would: the directory at the end
// says what is in it and where, and every entry's checksum has to match.
function entries(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = bytes.length - 22
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--
  assert.ok(eocd >= 0, 'the archive ends with a directory')
  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  const out = new Map<string, string>()
  const decoder = new TextDecoder()
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(at, true), 0x02014b50, 'a directory entry')
    const sum = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const offset = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    assert.equal(view.getUint32(offset, true), 0x04034b50, `${name} is where the directory says`)
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    const data = bytes.subarray(start, start + size)
    assert.equal(crc32(data), sum, `${name} matches its checksum`)
    out.set(name, decoder.decode(data))
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
  }
  return out
}

test('a workbook is a zip of the parts a spreadsheet expects', () => {
  const files = entries(renderXlsx([{ name: 'one', rows: [['a', 1]] }]))
  // The parts every xlsx carries. Excel opens a file without styles or properties;
  // other readers quietly show nothing, so the file looks like the usual shape.
  assert.deepEqual([...files.keys()], [
    '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
    'xl/styles.xml', 'docProps/core.xml', 'docProps/app.xml', 'xl/worksheets/sheet1.xml',
  ])
  assert.match(files.get('xl/worksheets/sheet1.xml')!, /<dimension ref="A1:B1"\/>/, 'and says how far it goes')
  assert.match(files.get('[Content_Types].xml')!, /styles\+xml/)
  assert.match(files.get('xl/_rels/workbook.xml.rels')!, /Target="styles.xml"/)
  const sheet = files.get('xl/worksheets/sheet1.xml')!
  assert.match(sheet, /<c r="A1" t="inlineStr"><is><t xml:space="preserve">a<\/t><\/is><\/c>/)
  assert.match(sheet, /<c r="B1"><v>1<\/v><\/c>/, 'a number is a number, not text')
  assert.match(files.get('xl/workbook.xml')!, /<sheet name="one" sheetId="1"/)
})

test('cells are named the way a spreadsheet names them', () => {
  assert.deepEqual([1, 26, 27, 52, 53].map(columnName), ['A', 'Z', 'AA', 'AZ', 'BA'])
  assert.equal(sheetName('data_path.u_inc:y table'), 'data_path.u_inc_y table')
  assert.equal(sheetName('a'.repeat(40)).length, 31)
  assert.equal(sheetName(''), 'Sheet')
})

test('two tabs never share a name', () => {
  const files = entries(renderXlsx([{ name: 'same', rows: [] }, { name: 'same', rows: [] }]))
  const names = [...files.get('xl/workbook.xml')!.matchAll(/name="([^"]+)"/g)].map(m => m[1])
  assert.deepEqual(names, ['same', 'same 2'])
})

test('a machine comes out as the table it was built from', () => {
  const [about, states, moves] = fsmSheets(machine)
  assert.deepEqual(about.rows[0], ['Machine', 'STATE'])
  assert.deepEqual(about.rows[1], ['Style', 'moore'])
  assert.deepEqual(states.rows[0], ['State', 'Encoding', 'Meaning', 'LOAD_EN', 'RUN_EN', 'STOPPED'])
  assert.deepEqual(states.rows[1].slice(0, 2), ['IDLE', "2'd0"])
  assert.deepEqual(moves.rows[0], ['State', 'Encoding', 'When', 'Condition', 'Next state', 'Next encoding', 'Outputs'])
  assert.equal(moves.rows.length, machine.transitions.length + 1)
  // A Moore machine drives from the state it lands in.
  assert.deepEqual(moves.rows[1], ['IDLE', "2'd0", 'the core is activated', 'SET', 'LOAD', "2'd1", 'LOAD_EN=1, RUN_EN=0, STOPPED=0'])
})

test('a schematic comes out as its control signals and its truth table', () => {
  const [ledger, table] = controlSheets(acc)
  assert.deepEqual(ledger.rows[0], ['Signal', 'Width', 'Flow', 'Driven by', 'Read by', 'What it means'])
  const acc_sel = ledger.rows.find(row => row[0] === 'ACC_SEL')!
  assert.deepEqual(acc_sel.slice(1, 5), [1, 'control', 'control_path:ACC_SEL', 'data_path.u_mux:sel'])
  assert.ok(String(acc_sel[5]).length > 0, 'and what it means')

  assert.equal(table.name, 'acc control_path')
  assert.equal(ledger.name, 'acc signals', 'one workbook holds every level, so each tab says whose it is')
  const head = table.rows[2]
  assert.deepEqual(head, ['RST', 'SHOW', 'MODE', '', 'CNT_RST', 'ACC_RST', 'OUT_RST', 'OUT_EN', 'ACC_SEL', 'What the row means'])
  assert.deepEqual(table.rows[3].slice(0, 3), ['1', 'x', 'x'])
  assert.ok(table.rows.some(row => row[0] === 'else'), 'the default row is in it')
})

test('what the design was asked for comes out beside what carries it', () => {
  const root = read('pwm/pwm_top.rtlgraph.json') as ComponentGraph
  const sheets = controlSheets(root, 'pwm_top')
  const requirements = sheets.find(sheet => sheet.name.endsWith('requirements'))!
  assert.deepEqual(requirements.rows[0], ['Document', 'Page', 'The requirement', 'Carried by', ''])
  const rdy = requirements.rows.find(row => row[3] === 'RDY')!
  assert.deepEqual(rdy, ['spec/pwm_brief.pdf', 1, 'RDY : Active-low when the PWM core is activated', 'RDY', 'net'])
  // A design that cites nothing gets no tab at all.
  assert.ok(!controlSheets(acc).some(sheet => sheet.name.endsWith('requirements')))
})
