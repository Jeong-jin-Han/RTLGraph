import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkSources, hierarchyEntries, loadHierarchy } from '../src/index.ts'

// Every demo project that has RTLGraph files: the root, and each component
// schematic it reaches. demo/sys is the deep one (a component inside a component).
const DEMO = join(import.meta.dirname, '../../../demo')
const reader = (project: string) => (path: string) => {
  try {
    return readFileSync(join(DEMO, project, path), 'utf8')
  } catch {
    return undefined
  }
}

const PROJECTS: Record<string, { root: string; entries: [string, string, string][] }> = {
  acc: {
    root: 'acc_top.rtlgraph.json',
    entries: [
      ['', 'acc_top.rtlgraph.json', 'system'],
      ['acc', 'acc/acc.rtlgraph-schematic.json', 'component'],
    ],
  },
  updown: {
    root: 'updown.rtlgraph.json',
    entries: [
      ['', 'updown.rtlgraph.json', 'system'],
      ['updown', 'updown/updown.rtlgraph-schematic.json', 'component'],
    ],
  },
  sys: {
    root: 'sys_top.rtlgraph.json',
    entries: [
      ['', 'sys_top.rtlgraph.json', 'system'],
      ['sys', 'sys/sys.rtlgraph-schematic.json', 'component'],
      ['sys/u_host', 'sys/host/host.rtlgraph-schematic.json', 'component'],
      ['sys/u_dev', 'sys/dev/dev.rtlgraph-schematic.json', 'component'],
      ['sys/u_dev/u_inbuf', 'sys/dev/inbuf/inbuf.rtlgraph-schematic.json', 'component'],
    ],
  },
}

for (const [project, { root, entries }] of Object.entries(PROJECTS)) {
  const read = reader(project)

  test(`demo/${project} loads every component it refers to`, () => {
    const h = loadHierarchy(root, read)
    assert.deepEqual(h.diagnostics, [])
    assert.deepEqual(hierarchyEntries(h.root).map(e => [e.instance, e.path, e.graph.kind]), entries)
  })

  test(`demo/${project} agrees with its sources`, () => {
    for (const entry of hierarchyEntries(loadHierarchy(root, read).root)) {
      const dir = entry.path.split('/').slice(0, -1).join('/')
      const base = [dir, entry.graph.source.root].filter(p => p && p !== '.').join('/')
      assert.deepEqual(checkSources(entry.graph, path => read(base ? `${base}/${path}` : path)), [], entry.path)
    }
  })
}

test('a component box is reused wherever the same schematic is referred to', () => {
  // Instance paths stay unique even when two boxes point at one file.
  const instances = hierarchyEntries(loadHierarchy(PROJECTS.sys.root, reader('sys')).root).map(e => e.instance)
  assert.equal(new Set(instances).size, instances.length)
})
