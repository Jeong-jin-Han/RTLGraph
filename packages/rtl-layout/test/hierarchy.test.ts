import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadHierarchy, parseEndpoint, type ComponentGraph, type HierarchyEntry } from '@rtlgraph/ir'
import { FRAME_TITLE_H, layoutComponent, layoutHierarchy, PORT_PIN, type NestedLayout } from '../src/index.ts'
import { assertCleanWires, assertConnects, assertNoOverlap } from './invariants.ts'

const PROJECT = join(import.meta.dirname, '../../../demo/acc')
const fromDisk = (path: string) => {
  try {
    return readFileSync(join(PROJECT, path), 'utf8')
  } catch {
    return undefined
  }
}
const demo = () => loadHierarchy('acc_top.rtlgraph.json', fromDisk).root!

// Three levels: root -> u_top (a register fed by u_sub) -> u_sub (an incrementer).
function synthetic(): HierarchyEntry {
  const g = (kind: 'system' | 'component', top: string, nodes: object, signals: object) =>
    ({ version: '0.1.0', kind, title: top, created: '', modified: '', source: { root: '.', files: [], top }, nodes, signals }) as ComponentGraph
  const ports = { '@I': { kind: 'port', dir: 'in', flow: 'data' }, '@O': { kind: 'port', dir: 'out', flow: 'data' } }
  const files: Record<string, ComponentGraph> = {
    'root.rtlgraph.json': g('system', 'root_top', {
      ...ports,
      u_top: { kind: 'component', name: 'top', module: 'top_top', ref: 'top/top.rtlgraph-schematic.json', ports: { I: 'in', O: 'out' } },
    }, {
      I: { width: 4, flow: 'data', driver: '@I', sinks: ['u_top:I'] },
      O: { width: 4, flow: 'data', driver: 'u_top:O', sinks: ['@O'] },
    }),
    'top/top.rtlgraph-schematic.json': g('component', 'top_top', {
      ...ports,
      u_sub: { kind: 'component', name: 'sub', module: 'sub_top', ref: 'sub/sub.rtlgraph-schematic.json', ports: { I: 'in', O: 'out' } },
      R_FF: { kind: 'reg', flow: 'data', time: 'seq', module: 'DFF', params: { BW: 3 }, ports: { CLK: 'in', RST: 'in', EN: 'in', D: 'in', Q: 'out' }, consts: { CLK: "1'b0", RST: "1'b0", EN: "1'b1" } },
    }, {
      I: { width: 4, flow: 'data', driver: '@I', sinks: ['u_sub:I'] },
      M: { width: 4, flow: 'data', driver: 'u_sub:O', sinks: ['R_FF:D'] },
      O: { width: 4, flow: 'data', driver: 'R_FF:Q', sinks: ['@O'] },
    }),
    'top/sub/sub.rtlgraph-schematic.json': g('component', 'sub_top', {
      ...ports,
      u_inc: { kind: 'op', flow: 'data', time: 'comb', module: 'INC', params: { BW: 3 }, ports: { a: 'in', y: 'out' } },
    }, {
      I: { width: 4, flow: 'data', driver: '@I', sinks: ['u_inc:a'] },
      O: { width: 4, flow: 'data', driver: 'u_inc:y', sinks: ['@O'] },
    }),
  }
  const h = loadHierarchy('root.rtlgraph.json', path => (files[path] ? JSON.stringify(files[path]) : undefined))
  assert.deepEqual(h.diagnostics, [])
  return h.root!
}

// Every level of a nested layout, with boxes translated to absolute coordinates.
function flatten(layout: NestedLayout, dx = 0, dy = 0, prefix = ''): { id: string; box: { x: number; y: number; w: number; h: number }; frame: boolean }[] {
  return Object.entries(layout.nodes).flatMap(([id, b]) => {
    const here = { id: prefix + id, box: { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }, frame: id in layout.children }
    const child = layout.children[id]
    return child ? [here, ...flatten(child.layout, dx + child.x, dy + child.y, `${prefix}${id}/`)] : [here]
  })
}

function checkLevel(layout: NestedLayout, graph: ComponentGraph) {
  assertNoOverlap(Object.entries(layout.nodes))
  assertCleanWires(layout)
  for (const [name, wire] of Object.entries(layout.wires)) {
    const s = graph.signals[name]
    const points = [s.driver, ...s.sinks].map(ref => {
      const { node, port } = parseEndpoint(ref)
      return layout.nodes[node].pins[port ?? PORT_PIN]
    })
    assertConnects(name, wire.segments, points)
  }
}

test('folded: component boxes only, laid out like any schematic', () => {
  const root = demo()
  const layout = layoutHierarchy(root, () => false)
  assert.deepEqual(layout.children, {})
  assert.deepEqual(layout, { ...layoutComponent(root.graph), children: {} })
  checkLevel(layout, root.graph)
})

test('unfolded: the frame is sized to the child and its pins meet the child ports', () => {
  const root = demo()
  const layout = layoutHierarchy(root, () => true)
  const frame = layout.nodes.acc
  const child = layout.children.acc
  assert.equal(frame.w, child.layout.width)
  assert.equal(frame.h, child.layout.height + FRAME_TITLE_H)
  assert.deepEqual([child.x, child.y], [frame.x, frame.y + FRAME_TITLE_H])

  for (const port of ['RST', 'SHOW', 'MODE', 'ACC']) {
    const pin = frame.pins[port]
    const c = child.connectors[port]
    assert.ok(c, `connector for ${port}`)
    assert.equal(c.y1, pin.y)
    assert.equal(c.y2, pin.y)
    assert.ok(pin.side === 'left' ? c.x1 === frame.x : c.x2 === frame.x + frame.w, port)
  }
  checkLevel(layout, root.graph)
  checkLevel(child.layout, root.children.acc.graph)
})

test('inside a frame, inputs sit leftmost and outputs rightmost in their row', () => {
  const { layout } = layoutHierarchy(demo(), () => true).children.acc
  for (const [id, box] of Object.entries(layout.nodes)) {
    if (!id.startsWith('@')) continue
    const sameRow = Object.entries(layout.nodes).filter(([other, b]) => b.row === box.row && !other.startsWith('@')).map(([, b]) => b)
    const input = box.pins[PORT_PIN].side === 'right'
    for (const other of sameRow) assert.ok(input ? box.x < other.x : box.x > other.x, `${id} is not at the edge of its row`)
  }
})

test('nests recursively: every box of a child stays inside its frame', () => {
  const root = synthetic()
  const layout = layoutHierarchy(root, () => true)
  assert.deepEqual(Object.keys(layout.children), ['u_top'])
  assert.deepEqual(Object.keys(layout.children.u_top.layout.children), ['u_sub'])

  const boxes = flatten(layout)
  for (const { id, box } of boxes) {
    const parents = boxes.filter(b => b.frame && id.startsWith(`${b.id}/`))
    for (const p of parents) {
      assert.ok(box.x >= p.box.x && box.y >= p.box.y && box.x + box.w <= p.box.x + p.box.w && box.y + box.h <= p.box.y + p.box.h, `${id} leaves ${p.id}`)
    }
  }
  checkLevel(layout, root.graph)
  checkLevel(layout.children.u_top.layout, root.children.u_top.graph)
  checkLevel(layout.children.u_top.layout.children.u_sub.layout, root.children.u_top.children.u_sub.graph)
})

test('fold state is per instance, and layout is deterministic', () => {
  const root = synthetic()
  const onlyTop = layoutHierarchy(root, instance => instance === 'u_top')
  assert.deepEqual(Object.keys(onlyTop.children.u_top.layout.children), [])
  assert.ok(onlyTop.nodes.u_top.w < layoutHierarchy(root, () => true).nodes.u_top.w)
  assert.deepEqual(layoutHierarchy(root, () => true), layoutHierarchy(root, () => true))
})
