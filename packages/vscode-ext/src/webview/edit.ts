import { facing, type ComponentGraph, type Layout } from '@rtlgraph/ir'

// The arrangement the reader makes by hand, as plain functions on a Layout so the
// DOM code stays about pointers and the rules stay testable.
//
// Only what the opened file itself draws can be arranged here: an id carrying an
// instance path (acc/CNT_FF) belongs to a component's own file, and is arranged
// by opening that file. The editor says so rather than writing someone else's.

export const belongsToThisFile = (id: string): boolean => !id.includes('/')

const pruned = (layout: Layout): Layout => {
  const out: Layout = { nodes: layout.nodes }
  if (layout.grid !== undefined) out.grid = layout.grid
  if (layout.sizes && Object.keys(layout.sizes).length > 0) out.sizes = layout.sizes
  if (layout.wires && Object.keys(layout.wires).length > 0) out.wires = layout.wires
  if (layout.cut && layout.cut.length > 0) out.cut = [...layout.cut].sort()
  if (layout.links && layout.links.length > 0) {
    out.links = [...layout.links].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
  }
  if (layout.collapsed && layout.collapsed.length > 0) out.collapsed = layout.collapsed
  return out
}

export const emptyLayout = (): Layout => ({ nodes: {} })

export function movedTo(layout: Layout, id: string, x: number, y: number): Layout {
  return pruned({ ...layout, nodes: { ...layout.nodes, [id]: { x: Math.round(x), y: Math.round(y) } } })
}

// A frame only ever grows: the layout engine keeps it at least as big as what is
// inside, so asking for less than that does nothing.
export function resizedTo(layout: Layout, id: string, w: number, h: number): Layout {
  const sizes = { ...layout.sizes, [id]: { w: Math.round(w), h: Math.round(h) } }
  return pruned({ ...layout, sizes })
}

const rounded = (path: readonly { x: number; y: number }[]) => path.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }))

export function shapedTo(layout: Layout, name: string, paths: readonly (readonly { x: number; y: number }[])[]): Layout {
  const drawn = paths.filter(path => path.length >= 2).map(rounded)
  if (drawn.length === 0) return layout
  const wires = { ...layout.wires, [name]: drawn.length === 1 ? { points: drawn[0] } : { paths: drawn } }
  return pruned({ ...layout, wires })
}

export const isCut = (layout: Layout, name: string): boolean => (layout.cut ?? []).includes(name)

export function withCut(layout: Layout, name: string): Layout {
  if (isCut(layout, name)) return layout
  // A wire the reader shaped and then cut keeps no shape: it is not drawn at all.
  const wires = { ...layout.wires }
  delete wires[name]
  return pruned({ ...layout, wires, cut: [...(layout.cut ?? []), name] })
}

export function withoutCut(layout: Layout, name: string): Layout {
  if (!isCut(layout, name)) return layout
  return pruned({ ...layout, cut: (layout.cut ?? []).filter(other => other !== name) })
}

// ── links the reader drew ──
// Drawing one is how a cut is undone, and how a connection the RTL does not have
// yet is proposed. The two are told apart by what the file already says: if a net
// carries this pair, the cut goes; if not, the link is the reader's own.

export const linkedPair = (layout: Layout, from: string, to: string): boolean =>
  (layout.links ?? []).some(link => link.from === from && link.to === to)

export function withLink(layout: Layout, from: string, to: string): Layout {
  if (from === to || linkedPair(layout, from, to)) return layout
  return pruned({ ...layout, links: [...(layout.links ?? []), { from, to }] })
}

export function withoutLink(layout: Layout, from: string, to: string): Layout {
  const links = (layout.links ?? []).filter(link => !(link.from === from && link.to === to))
  if (links.length === (layout.links ?? []).length) return layout
  const wires = { ...layout.wires }
  delete wires[`${from}->${to}`] // its shape goes with it
  return pruned({ ...layout, links, wires })
}

// Anything the reader changed by hand, undone in one go.
export function cleared(layout: Layout): Layout {
  return { nodes: {}, ...(layout.grid !== undefined ? { grid: layout.grid } : {}), ...(layout.collapsed ? { collapsed: layout.collapsed } : {}) }
}

export const isArranged = (layout: Layout | undefined): boolean =>
  !!layout &&
  (Object.keys(layout.nodes ?? {}).length > 0 ||
    Object.keys(layout.sizes ?? {}).length > 0 ||
    Object.keys(layout.wires ?? {}).length > 0 ||
    (layout.cut ?? []).length > 0 ||
    (layout.links ?? []).length > 0)

// ── shaping a wire by hand ──
// A net drawn as one path can be reshaped: drag a segment sideways, or take a
// corner out. Everything stays orthogonal, and the two ends stay on their pins.

export interface Point {
  x: number
  y: number
}

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y

// The vertices of a wire, in order, when its segments form a single path.
// Undefined for a net that forks — a fan-out is a tree, and there is no one path
// through it to drag.
export function polylineOf(segments: readonly Segment[]): Point[] | undefined {
  if (segments.length === 0) return undefined
  const ends = new Map<string, Point[]>()
  const key = (p: Point) => `${p.x},${p.y}`
  for (const s of segments) {
    for (const p of [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]) {
      ends.set(key(p), [...(ends.get(key(p)) ?? []), p])
    }
  }
  const tips = [...ends.values()].filter(list => list.length === 1).map(list => list[0])
  if (tips.length !== 2) return undefined // a loop, or a fork

  const left = [...segments]
  const points: Point[] = [tips[0]]
  while (left.length > 0) {
    const here = points[points.length - 1]
    const i = left.findIndex(s => same(here, { x: s.x1, y: s.y1 }) || same(here, { x: s.x2, y: s.y2 }))
    if (i < 0) return undefined
    const s = left.splice(i, 1)[0]
    points.push(same(here, { x: s.x1, y: s.y1 }) ? { x: s.x2, y: s.y2 } : { x: s.x1, y: s.y1 })
  }
  return points
}

// Drops points that repeat or sit on the straight line between their neighbours.
export function tidied(points: readonly Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && same(last, p)) continue
    const before = out[out.length - 2]
    if (before && last && ((before.x === last.x && p.x === last.x) || (before.y === last.y && p.y === last.y))) out.pop()
    out.push(p)
  }
  return out
}

// Moves one segment sideways: a vertical one left or right, a horizontal one up
// or down. The pins do not move, so pushing an end segment grows a new corner
// beside the pin instead of dragging the pin along.
export function movedSegment(points: readonly Point[], index: number, dx: number, dy: number): Point[] {
  if (index < 0 || index + 1 >= points.length) return [...points]
  const a = points[index]
  const b = points[index + 1]
  const vertical = a.x === b.x
  const shifted = vertical ? { x: Math.round(a.x + dx), y: 0 } : { x: 0, y: Math.round(a.y + dy) }
  const move = (p: Point) => (vertical ? { x: shifted.x, y: p.y } : { x: p.x, y: shifted.y })

  const out = [...points]
  out[index] = move(a)
  out[index + 1] = move(b)
  // An end of the wire is a pin: keep it, and let the corner appear next to it.
  if (index === 0) out.unshift(points[0])
  if (index + 1 === points.length - 1) out.push(points[points.length - 1])
  return tidied(out)
}

// Takes a corner out and rejoins the two sides at right angles.
export function removedVertex(points: readonly Point[], index: number): Point[] {
  if (index <= 0 || index >= points.length - 1) return [...points] // the pins stay
  const before = points[index - 1]
  const after = points[index + 1]
  const rest = [...points.slice(0, index), ...points.slice(index + 1)]
  if (before.x === after.x || before.y === after.y) return tidied(rest)
  // They do not line up, so a corner is still needed — the other one, or the wire
  // would keep the very corner that was asked to go.
  const corner = { x: before.x, y: after.y }
  return tidied([...points.slice(0, index), corner, ...points.slice(index + 1)])
}

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

// Every branch of a net: the path from the driver pin to each sink pin. A net
// with one sink has one; a fan-out has one per sink, sharing their early part.
export function branchesOf(segments: readonly Segment[], from: Point, to: readonly Point[]): Point[][] {
  const key = (p: Point) => `${p.x},${p.y}`
  const next = new Map<string, Point[]>()
  const note = (a: Point, b: Point) => next.set(key(a), [...(next.get(key(a)) ?? []), b])
  for (const s of segments) {
    const [a, b] = [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]
    note(a, b)
    note(b, a)
  }

  const out: Point[][] = []
  for (const target of to) {
    // Breadth first: the fewest corners between the two pins.
    const came = new Map<string, Point | undefined>([[key(from), undefined]])
    const queue: Point[] = [from]
    while (queue.length > 0) {
      const here = queue.shift()!
      if (key(here) === key(target)) break
      for (const step of next.get(key(here)) ?? []) {
        if (came.has(key(step))) continue
        came.set(key(step), here)
        queue.push(step)
      }
    }
    if (!came.has(key(target))) continue
    const path: Point[] = []
    for (let at: Point | undefined = target; at; at = came.get(key(at))) path.unshift(at)
    out.push(tidied(path))
  }
  return out
}

// How far a point is from a segment, and which segment of a path is nearest: the
// reader grabs the straight run itself, not a small handle sitting on it.
const distanceToSegment = (at: Point, a: Point, b: Point) => {
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / length))
  return Math.hypot(at.x - (a.x + t * dx), at.y - (a.y + t * dy))
}

export function segmentAt(points: readonly Point[], at: Point): number {
  let best = 0
  let closest = Infinity
  for (let i = 1; i < points.length; i++) {
    const d = distanceToSegment(at, points[i - 1], points[i])
    if (d < closest) {
      closest = d
      best = i - 1
    }
  }
  return best
}

// The branch a click landed on: the one whose segments pass closest to it.
export function branchAt(paths: readonly Point[][], at: Point): number {
  let best = 0
  let closest = Infinity
  paths.forEach((path, i) => {
    for (let k = 1; k < path.length; k++) {
      const d = distanceToSegment(at, path[k - 1], path[k])
      if (d < closest) {
        closest = d
        best = i
      }
    }
  })
  return best
}

// Which corner the hand is nearest, if it is near one at all. A corner is a
// point the reader can act on; the pins at the two ends are not.
export function vertexAt(points: readonly Point[], at: Point, within: number): number | undefined {
  let best: number | undefined
  let closest = within
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.hypot(at.x - points[i].x, at.y - points[i].y)
    if (d <= closest) {
      closest = d
      best = i
    }
  }
  return best
}

// Turns a corner a quarter turn: a run that went along and then down goes down
// and then along instead. There are only two ways round a corner, so doing it
// twice brings the wire back — which is what makes it a good right-click.
export function turnedCorner(points: readonly Point[], index: number): Point[] {
  if (index <= 0 || index >= points.length - 1) return [...points]
  const [before, corner, after] = [points[index - 1], points[index], points[index + 1]]
  // The corner is where the two runs meet; the other way round is the opposite
  // meeting point of the same rectangle.
  const turned = { x: corner.x === before.x ? after.x : before.x, y: corner.y === before.y ? after.y : before.y }
  if (turned.x === corner.x && turned.y === corner.y) return [...points] // nothing to turn
  return tidied([...points.slice(0, index), turned, ...points.slice(index + 1)])
}

// The right-click: turn the corner under the hand, else the first corner of the
// run — "bend it the other way, from the start".
// The corner a right-click means: the one under the hand, or — when the click
// landed on a straight run between corners — the nearest one. Turning the first
// corner of the wire instead, as this used to, moved a bend at the far end of
// the picture and read as the editor doing something at random.
export function cornerFor(points: readonly Point[], at: Point, within: number): number | undefined {
  const under = vertexAt(points, at, within)
  if (under !== undefined) return under
  return vertexAt(points, at, Infinity)
}

export function turnedAt(points: readonly Point[], at: Point, within: number): Point[] {
  const corner = cornerFor(points, at, within)
  return corner === undefined ? [...points] : turnedCorner(points, corner)
}

// ── what drawing from one pin to another means ──
// Kept here, out of the pointer code, because it is a rule about the file rather
// than about the hand: the same pair means "undo the cut" or "this is new",
// depending on what the RTL already says.

export type LinkDecision =
  | { kind: 'uncut'; net: string } // the RTL carries it and the reader had cut it
  | { kind: 'link'; from: string; to: string } // the reader's own, the RTL has no net
  | { kind: 'none'; why: string } // and why nothing happened

export function linkDecision(graph: ComponentGraph, layout: Layout, a: string, b: string): LinkDecision {
  if (a === b) return { kind: 'none', why: 'a pin cannot be linked to itself' }
  const [fa, fb] = [facing(graph, a), facing(graph, b)]
  if (fa === undefined || fb === undefined) return { kind: 'none', why: 'one of those pins is not in this file' }
  if (fa === fb) {
    const what = fa === 'source' ? 'drive' : 'read'
    return { kind: 'none', why: `both of those pins ${what}; a link runs from one that drives to one that reads` }
  }
  const [from, to] = fa === 'source' ? [a, b] : [b, a]
  const net = Object.entries(graph.signals).find(([, s]) => s.driver === from && s.sinks.includes(to))
  if (net) {
    return isCut(layout, net[0])
      ? { kind: 'uncut', net: net[0] }
      : { kind: 'none', why: `${net[0]} already carries ${from} to ${to}` }
  }
  if (linkedPair(layout, from, to)) return { kind: 'none', why: 'that link is already drawn' }
  return { kind: 'link', from, to }
}
