import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checkSources, hierarchyEntries, loadHierarchy, originOf, validateComponentGraph, validateFsmGraph,
} from '../src/index.ts'

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
  // The third placement: the code is untouched in src/ and every RTLGraph file is
  // kept together in rtlgraph/, so source.root climbs out of that folder.
  'lab/rtlgraph': {
    root: 'lab_top.rtlgraph.json',
    entries: [
      ['', 'lab_top.rtlgraph.json', 'system'],
      ['lab', 'lab.rtlgraph-schematic.json', 'component'],
      ['lab/u_shift', 'shift_reg.rtlgraph-schematic.json', 'component'],
    ],
  },
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
  // The assignment case: the skeleton's own flat folder, JSON beside the code.
  hw: {
    root: 'hw_top.rtlgraph.json',
    entries: [
      ['', 'hw_top.rtlgraph.json', 'system'],
      ['hw', 'hw.rtlgraph-schematic.json', 'component'],
      ['hw/u_counter', 'counter.rtlgraph-schematic.json', 'component'],
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

test('every drawn element says which line of the code it came from', () => {
  const root = loadHierarchy(PROJECTS.sys.root, reader('sys')).root!
  // Three levels down, through a schematic whose sources sit in its own folder.
  assert.deepEqual(originOf(root, { node: 'sys/u_dev/u_inbuf/BUF_FF' }), { path: 'sys/dev/inbuf/seq/inbuf_top.v', line: 15 })
  assert.deepEqual(originOf(root, { signal: 'sys/u_dev/BUF_EN' }), { path: 'sys/dev/seq/dev_top.v', line: 17 })
  assert.deepEqual(originOf(root, { node: 'sys' }), { path: 'sys/seq/sys_top.v', line: 8 }, 'the box in the root')

  // Files kept in a folder of their own: the path climbs out of it to the code.
  const lab = loadHierarchy('lab_top.rtlgraph.json', reader('lab/rtlgraph')).root!
  assert.deepEqual(originOf(lab, { node: 'lab/u_shift/q_reg' }), { path: '../src/shift_reg.v', line: 11 })
  assert.equal(originOf(root, { node: 'sys/u_dev/nobody' }), undefined)
  assert.equal(originOf(root, { node: 'nowhere/u_x' }), undefined)

  // Every origin a demo names is a file that is really there, at a real line.
  for (const [project, { root: file }] of Object.entries(PROJECTS)) {
    const read = reader(project)
    const tree = loadHierarchy(file, read).root!
    for (const entry of hierarchyEntries(tree)) {
      const ids = [
        ...Object.keys(entry.graph.nodes).map(id => ({ node: [entry.instance, id].filter(Boolean).join('/') })),
        ...Object.keys(entry.graph.signals).map(name => ({ signal: [entry.instance, name].filter(Boolean).join('/') })),
      ]
      for (const of of ids) {
        const at = originOf(tree, of)
        if (!at) continue // an element without an origin is the validator's business
        const text = read(at.path)
        assert.ok(text !== undefined, `${project}: ${at.path} (${JSON.stringify(of)})`)
        assert.ok(at.line >= 1 && at.line <= text!.split('\n').length, `${project}: ${at.path}:${at.line}`)
      }
    }
  }
})

test('every demo passes the validator clean: no errors and no warnings', () => {
  for (const [project, { root }] of Object.entries(PROJECTS)) {
    const read = reader(project)
    const loaded = loadHierarchy(root, read)
    assert.deepEqual(loaded.diagnostics, [], project)
    for (const entry of hierarchyEntries(loaded.root)) {
      const found = validateComponentGraph(entry.graph).diagnostics
      assert.deepEqual(found, [], `${project}/${entry.path}: ${found.map(d => `${d.code} ${d.signal ?? d.node ?? ''}`).join(', ')}`)
    }
  }
})

test('every requirement a demo quotes is really in the document it names', () => {
  // The link is only worth having if the sentence is there: the quote is checked
  // against the document itself. (demo/pwm's brief is uncompressed, so the text
  // is in the bytes — no PDF library to read it back.)
  let checked = 0
  for (const [project, { root }] of Object.entries(PROJECTS)) {
    const read = reader(project)
    for (const entry of hierarchyEntries(loadHierarchy(root, read).root)) {
      const dir = entry.path.split('/').slice(0, -1).join('/')
      const base = [dir, entry.graph.source.root].filter(p => p && p !== '.').join('/')
      const refs = [
        ...Object.entries(entry.graph.nodes).map(([id, n]) => [id, n.spec] as const),
        ...Object.entries(entry.graph.signals).map(([name, s]) => [name, s.spec] as const),
      ].filter((pair): pair is [string, NonNullable<(typeof pair)[1]>] => pair[1] !== undefined)

      for (const [what, spec] of refs) {
        const file = spec.file ?? entry.graph.source.spec
        assert.ok(file, `${project}: ${what} names no document`)
        const path = [base, file].filter(Boolean).join('/').replace(/[^/]+\/\.\.\//g, '')
        const document = read(path)
        assert.ok(document !== undefined, `${project}: ${path} (quoted by ${what}) is not there`)
        // A PDF escapes its brackets; the sentence is the same sentence.
        const text = document!.replace(/\\([()\\])/g, '$1')
        assert.ok(text.includes(spec.quote), `${project}: ${path} does not say "${spec.quote}"`)
        checked++
      }
    }
  }
  assert.ok(checked >= 6, `only ${checked} requirements are linked`)
})
