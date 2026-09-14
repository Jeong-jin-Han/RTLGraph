import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkSources, originTokens, type ComponentGraph } from '../src/index.ts'

const DEMO = join(import.meta.dirname, '../../../demo/acc')
const graph = JSON.parse(readFileSync(join(DEMO, 'acc_top.rtlgraph.json'), 'utf8')) as ComponentGraph
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

test('inferred node names point at the net they drive', () => {
  assert.deepEqual(originTokens('data_path.op_CNT_D'), ['op_CNT_D', 'CNT_D'])
  assert.deepEqual(originTokens('ACC_Q_reg'), ['ACC_Q_reg', 'ACC_Q'])
  assert.deepEqual(originTokens('@ACC'), ['ACC'])
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
