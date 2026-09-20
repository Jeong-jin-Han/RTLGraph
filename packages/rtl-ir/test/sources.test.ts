import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkSources, originTokens, type ComponentGraph } from '../src/index.ts'

const DEMO = join(import.meta.dirname, '../../../demo/acc/acc')
const graph = JSON.parse(readFileSync(join(DEMO, 'acc.rtlgraph-schematic.json'), 'utf8')) as ComponentGraph
const read = (path: string) => {
  try {
    return readFileSync(join(DEMO, path), 'utf8')
  } catch {
    return undefined
  }
}

test('the golden graph agrees with its sources', () => {
  assert.deepEqual(checkSources(graph, read), [])
})

test('inferred node names point at the net they drive, all the way back', () => {
  // The names are chained, so the chain is followed to the one the code uses:
  // op_Q_D__t1 is a step of Q_D, which is the value going into Q.
  assert.deepEqual(originTokens('data_path.op_CNT_D'), ['op_CNT_D', 'CNT_D', 'CNT'])
  assert.deepEqual(originTokens('ACC_Q_reg'), ['ACC_Q_reg', 'ACC_Q', 'ACC'])
  assert.deepEqual(originTokens('op_Q_D__t1'), ['op_Q_D__t1', 'Q_D__t1', 'Q_D', 'Q'])
  assert.deepEqual(originTokens('@ACC'), ['ACC'])
  assert.deepEqual(originTokens('u_counter'), ['u_counter'], 'a name the code uses is checked as it is')
})

test('reports missing files and wrong or out-of-range lines', () => {
  const g = structuredClone(graph)
  g.source.files.push('seq/missing.v')
  g.nodes.CNT_FF.origin = { file: 'seq/acc_top.v', line: 62 } // that line declares ACC_FF
  g.nodes.ACC_FF.origin = { file: 'seq/acc_top.v', line: 999 }
  g.signals.CNT_Q.origin = { file: 'nope.v', line: 1 }
  const found = checkSources(g, read).map(d => `${d.severity}:${d.code}:${d.node ?? d.signal ?? d.file}`)
  assert.deepEqual(found.sort(), [
    'error:origin:ACC_FF',
    'error:origin:CNT_Q',
    'error:source-missing:seq/missing.v',
    'warn:origin-mismatch:CNT_FF',
  ])
})

test('a name must match as a whole identifier', () => {
  const g = structuredClone(graph)
  g.signals.CNT_D.origin = { file: 'seq/acc_top.v', line: 18 } // "wire [5:0] CNT_Q;" — not CNT_D
  g.signals.ACC_Q.origin = { file: 'seq/acc_top.v', line: 21 } // "wire [5:0] ACC_D;"
  assert.deepEqual(checkSources(g, read).map(d => d.signal).sort(), ['ACC_Q', 'CNT_D'])
})

test('a name the extractor had to invent may sit on a line that names what it is wired to', () => {
  // Non-conforming code: a comparison used twice and an enable condition, neither
  // of which the RTL ever names.
  const code = [
    'module d (input clk, input rst_n, input clr, input inc, output reg [3:0] q);',
    '    always @(posedge clk or negedge rst_n) begin',
    "        if (!rst_n)   q <= 4'd0;",
    "        else if (clr) q <= 4'd0;",
    "        else if (inc) q <= (q == 4'd9) ? 4'd0 : q + 4'd1;",
    '    end',
    'endmodule',
  ].join('\n')
  const graph = {
    version: '0.1.0', kind: 'component', title: 'd', created: '', modified: '',
    source: { root: '.', files: ['d.v'], top: 'd' },
    signals: {
      q: { width: 4, flow: 'data', driver: 'q_reg:Q', sinks: ['op_q9:a'], origin: { file: 'd.v', line: 1 } },
      // invented: the code never writes "q9" or "q_EN"
      q9: { width: 1, flow: 'control', driver: 'op_q9:y', sinks: ['q_reg:EN'], meaning: '1=at nine', origin: { file: 'd.v', line: 5 } },
    },
    nodes: {
      op_q9: { kind: 'op', flow: 'control', time: 'comb', module: 'CMP_EQ', ports: { a: 'in', b: 'in', y: 'out' }, consts: { b: "4'd9" }, origin: { file: 'd.v', line: 5 } },
      q_reg: { kind: 'reg', flow: 'data', time: 'seq', module: 'DFF', ports: { CLK: 'in', EN: 'in', D: 'in', Q: 'out' }, origin: { file: 'd.v', line: 2 } },
    },
  } as unknown as ComponentGraph

  const found = checkSources(graph, path => (path === 'd.v' ? code : undefined))
  assert.deepEqual(found, [], 'line 5 names q, which op_q9 reads; line 2 is the always block')

  // The relaxation is not a free pass: the line still has to name something the
  // element is wired to, and "endmodule" names nothing.
  const moved = structuredClone(graph)
  moved.nodes.op_q9.origin = { file: 'd.v', line: 7 }
  const strict = checkSources(moved, path => (path === 'd.v' ? code : undefined))
  assert.deepEqual(strict.map(d => d.code), ['origin-mismatch'])
  assert.equal(strict[0].node, 'op_q9')
})

// Moving the JSON into a folder of its own — the assignment layout where the
// code may not be touched — and leaving `source.root` behind is the easiest
// mistake to make, and the loudest: every element's origin then points at a
// file that is not there.
test('a root pointing at the wrong folder is reported once, with the fix', () => {
  const moved = (path: string) => (path.startsWith('../') ? read(path.slice(3)) : undefined)
  const found = checkSources(graph, moved)
  // One per root that is wrong — the code's and the shared library's — and
  // nothing per element.
  assert.deepEqual(found.map(d => d.code), ['source-root', 'source-lib'],
    `one fault per root: ${found.map(d => d.msg).join(' | ')}`)
  assert.match(found[0].msg, /source\.root should be "\.\."/)
  assert.match(found[0].msg, /none of the \d+ source files/)
})

test('a single missing file is still named on its own', () => {
  const short = { ...graph, source: { ...graph.source, files: [...graph.source.files, 'gone.v'] } }
  const found = checkSources(short as ComponentGraph, read).filter(d => d.code.startsWith('source'))
  assert.deepEqual(found.map(d => `${d.code}:${d.file}`), ['source-missing:gone.v'],
    'the rest are where they should be, so only the one is reported')
})

test('nothing is guessed when the files are nowhere to be found', () => {
  const nowhere = checkSources(graph, () => undefined)
  assert.equal(nowhere[0].code, 'source-root')
  assert.doesNotMatch(nowhere[0].msg, /should be/, 'no folder to point at, so no advice')
})

test('a library that moved is pointed at too', () => {
  const moved = (path: string) => (path.startsWith('../') ? read(path.slice(3)) : undefined)
  const lib = checkSources(graph, moved).find(d => d.code === 'source-lib')
  assert.match(lib!.msg, /source\.lib should be/)
})
