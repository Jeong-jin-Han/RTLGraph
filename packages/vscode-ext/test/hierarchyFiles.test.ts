import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadHierarchy } from '@rtlgraph/ir'
import { collectHierarchyFiles } from '../src/hierarchyFiles.ts'

const PROJECT = join(import.meta.dirname, '../../../demo/acc')
const fromDisk = async (path: string) => {
  try {
    return await readFile(join(PROJECT, path), 'utf8')
  } catch {
    return undefined
  }
}

test('collects the root and every schematic it reaches, ready for loadHierarchy', async () => {
  const rootText = (await fromDisk('acc_top.rtlgraph.json'))!
  const { files, requested } = await collectHierarchyFiles('acc_top.rtlgraph.json', rootText, fromDisk)
  assert.deepEqual(Object.keys(files), ['acc_top.rtlgraph.json', 'acc/acc.rtlgraph-schematic.json'])
  assert.deepEqual(requested, ['acc/acc.rtlgraph-schematic.json'])
  const { root, diagnostics } = loadHierarchy('acc_top.rtlgraph.json', path => files[path])
  assert.deepEqual(diagnostics.filter(d => d.severity === 'error'), [])
  assert.deepEqual(Object.keys(root!.children), ['acc'])
})

test('missing files are still requested (so they are watched), and cycles end', async () => {
  const box = (ref: string) => ({ kind: 'component', name: 'x', module: 'x', ref, ports: {} })
  const texts: Record<string, string> = {
    'a/a.rtlgraph-schematic.json': JSON.stringify({ nodes: { u_b: box('../b/b.rtlgraph-schematic.json'), u_gone: box('gone.rtlgraph-schematic.json') } }),
    'b/b.rtlgraph-schematic.json': JSON.stringify({ nodes: { u_a: box('../a/a.rtlgraph-schematic.json') } }),
  }
  const read = async (path: string) => texts[path]
  const root = JSON.stringify({ nodes: { u_a: box('a/a.rtlgraph-schematic.json') } })
  const { files, requested } = await collectHierarchyFiles('top.rtlgraph.json', root, read)
  assert.deepEqual(requested, ['a/a.rtlgraph-schematic.json', 'b/b.rtlgraph-schematic.json', 'a/gone.rtlgraph-schematic.json'])
  assert.deepEqual(Object.keys(files), ['top.rtlgraph.json', 'a/a.rtlgraph-schematic.json', 'b/b.rtlgraph-schematic.json'])
})

test('an unreadable root still yields itself', async () => {
  const { files, requested } = await collectHierarchyFiles('top.rtlgraph.json', '{ not json', async () => 'x')
  assert.deepEqual(files, { 'top.rtlgraph.json': '{ not json' })
  assert.deepEqual(requested, [])
})
