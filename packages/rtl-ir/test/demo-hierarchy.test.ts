import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkSources, hierarchyEntries, loadHierarchy, validateFsmGraph } from '../src/index.ts'

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
  pwm: {
    root: 'pwm_top.rtlgraph.json',
    entries: [
      ['', 'pwm_top.rtlgraph.json', 'system'],
      ['pwm', 'pwm/pwm.rtlgraph-schematic.json', 'component'],
      ['pwm/u_pulse', 'pwm/pulse/pulse.rtlgraph-schematic.json', 'component'],
      ['pwm/u_pulse/u_cnt', 'pwm/pulse/cnt/cnt.rtlgraph-schematic.json', 'component'],
      ['pwm/u_rdy', 'pwm/rdy/rdy.rtlgraph-schematic.json', 'component'],
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

test('every state machine a demo names is there and sound', () => {
  const machines: string[] = []
  for (const [project, { root }] of Object.entries(PROJECTS)) {
    const read = reader(project)
    for (const entry of hierarchyEntries(loadHierarchy(root, read).root)) {
      const dir = entry.path.split('/').slice(0, -1).join('/')
      for (const [id, node] of Object.entries(entry.graph.nodes)) {
        const ref = 'fsm' in node ? node.fsm : undefined
        if (typeof ref !== 'string') continue
        const path = [dir, ref].filter(Boolean).join('/')
        const text = read(path)
        assert.ok(text !== undefined, `${project}/${path} (named by ${id})`)
        const result = validateFsmGraph(JSON.parse(text!))
        assert.deepEqual(result.diagnostics, [], `${project}/${path}`)
        machines.push(`${project}/${path}`)
      }
    }
  }
  // demo/pwm is the case with several machines at different depths.
  assert.deepEqual(machines.sort(), [
    'pwm/pwm/pulse/pulse.rtlgraph-fsm.json',
    'pwm/pwm/pwm.rtlgraph-fsm.json',
    'pwm/pwm/rdy/rdy.rtlgraph-fsm.json',
  ])
})

test('a component box is reused wherever the same schematic is referred to', () => {
  // Instance paths stay unique even when two boxes point at one file.
  const instances = hierarchyEntries(loadHierarchy(PROJECTS.sys.root, reader('sys')).root).map(e => e.instance)
  assert.equal(new Set(instances).size, instances.length)
})
