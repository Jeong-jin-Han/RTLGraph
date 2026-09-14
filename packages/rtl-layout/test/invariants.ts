import assert from 'node:assert/strict'
import { onSegment, type NestedLayout, type NodeBox, type Segment } from '../src/index.ts'

// Geometry checks shared by the layout tests.

export const orthogonal = (s: Segment) => s.x1 === s.x2 || s.y1 === s.y2

export function crossesInterior(s: Segment, b: { x: number; y: number; w: number; h: number }) {
  const [x1, x2] = [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)]
  const [y1, y2] = [Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)]
  return x1 < b.x + b.w - 1 && x2 > b.x + 1 && y1 < b.y + b.h - 1 && y2 > b.y + 1
}

export function assertNoOverlap(boxes: [string, NodeBox][]) {
  for (const [i, [a, p]] of boxes.entries()) {
    for (const [b, q] of boxes.slice(i + 1)) {
      const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y
      assert.ok(apart, `${a} overlaps ${b}`)
    }
  }
}

// Every wire is orthogonal, avoids other boxes' interiors (frames excepted: wires
// inside a frame belong to it) and never runs along another net.
export function assertCleanWires(layout: NestedLayout) {
  const all = Object.entries(layout.wires).flatMap(([name, w]) => w.segments.map(s => ({ name, s })))
  for (const { name, s } of all) {
    assert.ok(orthogonal(s), `${name}: ${JSON.stringify(s)}`)
    for (const [id, b] of Object.entries(layout.nodes)) {
      assert.ok(!crossesInterior(s, b), `${name} crosses ${id}: ${JSON.stringify(s)}`)
    }
  }
  for (const [i, a] of all.entries()) {
    for (const b of all.slice(i + 1)) {
      if (a.name === b.name) continue
      const vertical = a.s.x1 === a.s.x2 && b.s.x1 === b.s.x2 && a.s.x1 === b.s.x1
      const horizontal = a.s.y1 === a.s.y2 && b.s.y1 === b.s.y2 && a.s.y1 === b.s.y1
      if (!vertical && !horizontal) continue
      const [p1, p2, q1, q2] = vertical
        ? [Math.min(a.s.y1, a.s.y2), Math.max(a.s.y1, a.s.y2), Math.min(b.s.y1, b.s.y2), Math.max(b.s.y1, b.s.y2)]
        : [Math.min(a.s.x1, a.s.x2), Math.max(a.s.x1, a.s.x2), Math.min(b.s.x1, b.s.x2), Math.max(b.s.x1, b.s.x2)]
      assert.ok(Math.min(p2, q2) - Math.max(p1, q1) <= 0, `${a.name} overlaps ${b.name}`)
    }
  }
}

// The segments of one wire form a single connected piece reaching every point.
export function assertConnects(name: string, segments: Segment[], points: { x: number; y: number }[]) {
  const parent = segments.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const touches = (a: Segment, b: Segment) =>
    [{ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }].some(p => onSegment(p, b)) ||
    [{ x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }].some(p => onSegment(p, a))
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) if (touches(segments[i], segments[j])) parent[find(i)] = find(j)
  const roots = points.map(p => {
    const i = segments.findIndex(s => onSegment(p, s))
    assert.ok(i >= 0, `${name}: nothing reaches ${JSON.stringify(p)}`)
    return find(i)
  })
  assert.ok(roots.every(r => r === roots[0]), `${name} is disconnected`)
}
