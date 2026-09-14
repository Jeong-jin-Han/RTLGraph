import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEndpoint, type ComponentGraph } from '@rtlgraph/ir'
import { layoutComponent, onSegment, PORT_PIN, type NodeBox, type Segment } from '../src/index.ts'

const graph = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../demo/acc/acc/acc.rtlgraph-schematic.json'), 'utf8'),
) as ComponentGraph
const layout = layoutComponent(graph)
const box = (id: string) => layout.nodes[id]
const pinOf = (ref: string) => {
  const { node, port } = parseEndpoint(ref)
  return layout.nodes[node].pins[port ?? PORT_PIN]
}

test('layout is deterministic', () => {
  assert.deepEqual(layoutComponent(graph), layout)
})

test('rows follow slide p.31: MUX over +1/ADD/SUB over the registers, ACC under OUT_FF', () => {
  const [inc, add, sub, mux] = ['u_inc', 'u_add', 'u_sub', 'u_mux'].map(n => box(`data_path.${n}`))
  const regs = ['CNT_FF', 'ACC_FF', 'OUT_FF'].map(box)
  assert.ok(regs.every(r => r.y === regs[0].y && r.row === regs[0].row))
  assert.ok(inc.row === add.row && add.row === sub.row)
  assert.ok(mux.row < add.row && add.row < regs[0].row)
  assert.ok(mux.y + mux.h < add.y && add.y + add.h < regs[0].y)
  assert.equal(box('control_path').row, mux.row)
  assert.ok(box('@ACC').y > box('OUT_FF').y + box('OUT_FF').h)
})

test('left-to-right order matches the slide', () => {
  const left = (id: string) => box(id).x
  assert.ok(left('CNT_FF') < left('ACC_FF') && left('ACC_FF') < left('OUT_FF'))
  assert.ok(left('data_path.u_inc') < left('data_path.u_add') && left('data_path.u_add') < left('data_path.u_sub'))
  for (const id of Object.keys(layout.nodes)) {
    if (graph.nodes[id].kind !== 'port' && id !== 'control_path') assert.ok(left('control_path') < left(id), id)
  }
  assert.equal(pinOf('@ACC').x, pinOf('OUT_FF:Q').x)
})

test('no two boxes overlap', () => {
  const boxes = Object.entries(layout.nodes)
  for (const [i, [a, p]] of boxes.entries()) {
    for (const [b, q] of boxes.slice(i + 1)) {
      const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y
      assert.ok(apart, `${a} overlaps ${b}`)
    }
  }
})

test('hidden nets are not routed; every other net is', () => {
  const routed = Object.keys(graph.signals).filter(n => !graph.signals[n].hidden).sort()
  assert.deepEqual(Object.keys(layout.wires).sort(), routed)
  assert.equal(layout.nodes['@CLK'], undefined)
})

test('every segment is horizontal or vertical', () => {
  for (const [name, wire] of Object.entries(layout.wires)) {
    for (const s of wire.segments) assert.ok(s.x1 === s.x2 || s.y1 === s.y2, `${name}: ${JSON.stringify(s)}`)
  }
})

const crossesInterior = (s: Segment, b: NodeBox) => {
  const [x1, x2] = [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)]
  const [y1, y2] = [Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)]
  return x1 < b.x + b.w - 1 && x2 > b.x + 1 && y1 < b.y + b.h - 1 && y2 > b.y + 1
}

test('no wire runs through a box', () => {
  for (const [name, wire] of Object.entries(layout.wires)) {
    for (const s of wire.segments) {
      for (const [id, b] of Object.entries(layout.nodes)) assert.ok(!crossesInterior(s, b), `${name} crosses ${id}: ${JSON.stringify(s)}`)
    }
  }
})

test('wires of different nets never overlap', () => {
  const all = Object.entries(layout.wires).flatMap(([name, w]) => w.segments.map(s => ({ name, s })))
  for (const [i, a] of all.entries()) {
    for (const b of all.slice(i + 1)) {
      if (a.name === b.name) continue
      const bothV = a.s.x1 === a.s.x2 && b.s.x1 === b.s.x2 && a.s.x1 === b.s.x1
      const bothH = a.s.y1 === a.s.y2 && b.s.y1 === b.s.y2 && a.s.y1 === b.s.y1
      if (!bothV && !bothH) continue
      const [p1, p2, q1, q2] = bothV
        ? [Math.min(a.s.y1, a.s.y2), Math.max(a.s.y1, a.s.y2), Math.min(b.s.y1, b.s.y2), Math.max(b.s.y1, b.s.y2)]
        : [Math.min(a.s.x1, a.s.x2), Math.max(a.s.x1, a.s.x2), Math.min(b.s.x1, b.s.x2), Math.max(b.s.x1, b.s.x2)]
      assert.ok(Math.min(p2, q2) - Math.max(p1, q1) <= 0, `${a.name} overlaps ${b.name}: ${JSON.stringify(a.s)} ${JSON.stringify(b.s)}`)
    }
  }
})

test('each wire connects its driver pin to all of its sink pins', () => {
  for (const [name, wire] of Object.entries(layout.wires)) {
    const segs = wire.segments
    const parent = segs.map((_, i) => i)
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
    const touches = (a: Segment, b: Segment) =>
      [{ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }].some(p => onSegment(p, b)) ||
      [{ x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }].some(p => onSegment(p, a))
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (touches(segs[i], segs[j])) parent[find(i)] = find(j)
    const s = graph.signals[name]
    const component = (ref: string) => {
      const i = segs.findIndex(seg => onSegment(pinOf(ref), seg))
      assert.ok(i >= 0, `${name}: no segment reaches ${ref}`)
      return find(i)
    }
    const root = component(s.driver)
    for (const ref of s.sinks) assert.equal(component(ref), root, `${name}: ${ref} is disconnected`)
  }
})

test('fan-out taps get junction dots', () => {
  assert.ok(layout.wires.CNT_Q.junctions.length >= 1)
  assert.equal(layout.wires['data_path.ADD_OUT'].junctions.length, 0)
})
