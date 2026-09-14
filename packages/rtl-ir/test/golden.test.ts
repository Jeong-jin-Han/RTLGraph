import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateComponentGraph, type ComponentGraph, type Origin } from '../src/index.ts'

// demo/acc is the D01-2 accumulator: the M0 golden case, hand-written from the
// real sources copied next to it.
const DEMO = join(import.meta.dirname, '../../../demo/acc')
const graph = JSON.parse(readFileSync(join(DEMO, 'acc_top.rtlgraph.json'), 'utf8')) as ComponentGraph

const lineAt = (origin: Origin): string => {
  const lines = readFileSync(join(DEMO, graph.source.root, origin.file), 'utf8').split('\n')
  assert.ok(origin.line >= 1 && origin.line <= lines.length, `${origin.file}:${origin.line} is out of range`)
  return lines[origin.line - 1]
}
const lastSegment = (name: string) => name.replace(/^@/, '').split('.').pop()!

test('golden graph validates without errors or warnings', () => {
  const r = validateComponentGraph(graph)
  assert.deepEqual(r.diagnostics, [])
  assert.equal(r.ok, true)
})

test('source files and library files exist', () => {
  for (const f of graph.source.files) assert.ok(existsSync(join(DEMO, graph.source.root, f)), f)
  for (const f of graph.source.libFiles ?? []) assert.ok(existsSync(join(DEMO, graph.source.root, graph.source.lib!, f)), f)
})

test('every node origin points at the line that declares it', () => {
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (!node.origin) continue
    const line = lineAt(node.origin)
    assert.match(line, new RegExp(`\\b${lastSegment(id)}\\b`), `${id} -> ${node.origin.file}:${node.origin.line}: ${line}`)
  }
})

test('every signal origin points at its declaration', () => {
  for (const [name, signal] of Object.entries(graph.signals)) {
    if (!signal.origin) continue
    const line = lineAt(signal.origin)
    assert.match(line, new RegExp(`\\b${lastSegment(name)}\\b`), `${name} -> ${signal.origin.file}:${signal.origin.line}: ${line}`)
  }
})

test('truth table origin points at the casex', () => {
  const cp = graph.nodes.control_path
  assert.equal(cp.kind, 'control')
  if (cp.kind !== 'control') return
  assert.match(lineAt(cp.truthTable!.origin!), /casex\s*\(\{RST, SHOW, MODE\}\)/)
})
