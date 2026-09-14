import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FILTER_PRESETS, componentRefs, graphFileKind, graphName, hierarchyEntries, loadHierarchy, resolveRef,
  validateComponentGraph, visibleElements, type ComponentGraph,
} from '../src/index.ts'

// root (system) -> top component -> sub component -> leaf logic
const base = (kind: 'system' | 'component', top: string) => ({
  version: '0.1.0', kind, title: top, created: 'c', modified: 'm', source: { root: '.', files: [`${top}.v`], top },
})
const passThrough = (kind: 'system' | 'component', top: string, box: { id: string; name: string; module: string; ref: string }): ComponentGraph => ({
  ...base(kind, top),
  nodes: {
    '@I': { kind: 'port', dir: 'in', flow: 'data' },
    '@O': { kind: 'port', dir: 'out', flow: 'data' },
    [box.id]: { kind: 'component', name: box.name, module: box.module, ref: box.ref, ports: { I: 'in', O: 'out' } },
  },
  signals: {
    I: { width: 4, flow: 'data', driver: '@I', sinks: [`${box.id}:I`] },
    O: { width: 4, flow: 'data', driver: `${box.id}:O`, sinks: ['@O'] },
  },
})
const leaf = (): ComponentGraph => ({
  ...base('component', 'sub_top'),
  nodes: {
    '@I': { kind: 'port', dir: 'in', flow: 'data' },
    '@O': { kind: 'port', dir: 'out', flow: 'data' },
    u_inc: { kind: 'op', flow: 'data', time: 'comb', module: 'INC', params: { BW: 3 }, ports: { a: 'in', y: 'out' } },
  },
  signals: {
    I: { width: 4, flow: 'data', driver: '@I', sinks: ['u_inc:a'] },
    O: { width: 4, flow: 'data', driver: 'u_inc:y', sinks: ['@O'] },
  },
})

function project(edit: (files: Record<string, any>) => void = () => {}) {
  const files: Record<string, any> = {
    'sys_top.rtlgraph.json': passThrough('system', 'sys_top', { id: 'u_top', name: 'top', module: 'top_top', ref: 'top/top.rtlgraph-schematic.json' }),
    'top/top.rtlgraph-schematic.json': passThrough('component', 'top_top', { id: 'u_sub', name: 'sub', module: 'sub_top', ref: 'sub/sub.rtlgraph-schematic.json' }),
    'top/sub/sub.rtlgraph-schematic.json': leaf(),
  }
  edit(files)
  return (path: string) => (files[path] === undefined ? undefined : JSON.stringify(files[path]))
}

test('file names and kinds', () => {
  assert.equal(graphFileKind('a/sys_top.rtlgraph.json'), 'system')
  assert.equal(graphFileKind('host/host.rtlgraph-schematic.json'), 'schematic')
  assert.equal(graphFileKind('host/host.rtlgraph-fsm.json'), 'fsm')
  assert.equal(graphFileKind('x.json'), undefined)
  assert.equal(graphName('host/host.rtlgraph-schematic.json'), 'host')
  assert.equal(graphName('C:\\p\\sys_top.rtlgraph.json'), 'sys_top')
})

test('refs resolve relative to the file that names them', () => {
  assert.equal(resolveRef('sys_top.rtlgraph.json', 'host/host.rtlgraph-schematic.json'), 'host/host.rtlgraph-schematic.json')
  assert.equal(resolveRef('host/host.rtlgraph-schematic.json', 'dma/dma.rtlgraph-schematic.json'), 'host/dma/dma.rtlgraph-schematic.json')
  assert.equal(resolveRef('host/dma/dma.rtlgraph-schematic.json', '../../device/./device.rtlgraph-schematic.json'), 'device/device.rtlgraph-schematic.json')
  assert.equal(resolveRef('a.json', '../x/b.json'), '../x/b.json')
  assert.deepEqual(componentRefs('top/top.rtlgraph-schematic.json', { nodes: { u: { kind: 'component', ref: 'sub/sub.rtlgraph-schematic.json' } } }), ['top/sub/sub.rtlgraph-schematic.json'])
  assert.deepEqual(componentRefs('x', 'not a graph'), [])
})

test('loads a root, its component and the component inside it', () => {
  const h = loadHierarchy('sys_top.rtlgraph.json', project())
  assert.deepEqual(h.diagnostics, [])
  assert.deepEqual(hierarchyEntries(h.root).map(e => [e.instance, e.path]), [
    ['', 'sys_top.rtlgraph.json'],
    ['u_top', 'top/top.rtlgraph-schematic.json'],
    ['u_top/u_sub', 'top/sub/sub.rtlgraph-schematic.json'],
  ])
})

test('a missing child is reported against its box, siblings still load', () => {
  const h = loadHierarchy('sys_top.rtlgraph.json', project(f => delete f['top/sub/sub.rtlgraph-schematic.json']))
  assert.deepEqual(h.diagnostics.map(d => [d.code, d.node]), [['hierarchy-missing', 'u_top/u_sub']])
  assert.deepEqual(Object.keys(h.root!.children), ['u_top'])
})

test('the box must match the child file ports and module', () => {
  // The child renames its output O to Q; the box in the parent still says O.
  const h = loadHierarchy('sys_top.rtlgraph.json', project(f => {
    const sub = f['top/sub/sub.rtlgraph-schematic.json']
    sub.nodes['@Q'] = sub.nodes['@O']
    delete sub.nodes['@O']
    sub.signals.O.sinks = ['@Q']
    f['top/top.rtlgraph-schematic.json'].nodes.u_sub.module = 'other'
  }))
  const found = h.diagnostics.map(d => `${d.severity}:${d.code}:${d.node}`).sort()
  assert.deepEqual(found, ['error:hierarchy-ports:u_top/u_sub', 'error:hierarchy-ports:u_top/u_sub', 'warn:hierarchy-module:u_top/u_sub'])
})

test('cycles are cut and reported', () => {
  const h = loadHierarchy('sys_top.rtlgraph.json', project(f => {
    f['top/sub/sub.rtlgraph-schematic.json'] = passThrough('component', 'sub_top', { id: 'u_back', name: 'top', module: 'top_top', ref: '../top.rtlgraph-schematic.json' })
  }))
  assert.deepEqual(h.diagnostics.map(d => [d.code, d.node]), [['hierarchy-cycle', 'u_top/u_sub/u_back']])
})

test('child file problems carry the child path and instance', () => {
  const h = loadHierarchy('sys_top.rtlgraph.json', project(f => { f['top/sub/sub.rtlgraph-schematic.json'].signals.I.sinks = ['nope:a'] }))
  const endpoint = h.diagnostics.find(d => d.code === 'endpoint')!
  assert.equal(endpoint.node, 'u_top/u_sub')
  assert.match(endpoint.msg, /^top\/sub\/sub\.rtlgraph-schematic\.json: /)
})

test('root files hold only ports and components', () => {
  const root = passThrough('system', 'sys_top', { id: 'u_top', name: 'top', module: 'top_top', ref: 'top/top.rtlgraph-schematic.json' })
  assert.equal(validateComponentGraph(root).ok, true)
  const withLogic = structuredClone(root) as any
  withLogic.nodes.u_inc = leaf().nodes.u_inc
  assert.ok(validateComponentGraph(withLogic).diagnostics.some(d => d.code === 'system-logic'))
  const badRef = structuredClone(root) as any
  badRef.nodes.u_top.ref = 'top/top.rtlgraph.json'
  assert.ok(validateComponentGraph(badRef).diagnostics.some(d => d.code === 'schema' && d.node === 'u_top'))
})

test('component boxes are never hidden by the filter', () => {
  const root = passThrough('system', 'sys_top', { id: 'u_top', name: 'top', module: 'top_top', ref: 'top/top.rtlgraph-schematic.json' })
  const v = visibleElements(root, FILTER_PRESETS.controlpath)
  assert.ok(v.nodes.has('u_top'))
  assert.deepEqual([...visibleElements(root, FILTER_PRESETS.datapath).signals].sort(), ['I', 'O'])
})
