import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkSources, hierarchyEntries, loadHierarchy } from '../src/index.ts'

// demo/acc: the root acc_top.rtlgraph.json and its main component acc/.
const PROJECT = join(import.meta.dirname, '../../../demo/acc')
const read = (path: string) => {
  try {
    return readFileSync(join(PROJECT, path), 'utf8')
  } catch {
    return undefined
  }
}

test('the demo root loads its main component without problems', () => {
  const h = loadHierarchy('acc_top.rtlgraph.json', read)
  assert.deepEqual(h.diagnostics, [])
  assert.deepEqual(hierarchyEntries(h.root).map(e => [e.instance, e.path, e.graph.kind]), [
    ['', 'acc_top.rtlgraph.json', 'system'],
    ['acc', 'acc/acc.rtlgraph-schematic.json', 'component'],
  ])
})

test('every file in the demo hierarchy agrees with its sources', () => {
  for (const entry of hierarchyEntries(loadHierarchy('acc_top.rtlgraph.json', read).root)) {
    const dir = entry.path.split('/').slice(0, -1).join('/')
    const base = [dir, entry.graph.source.root].filter(p => p && p !== '.').join('/')
    assert.deepEqual(checkSources(entry.graph, path => read(base ? `${base}/${path}` : path)), [], entry.path)
  }
})
