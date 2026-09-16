import type { FsmGraph, FsmTransition } from '@rtlgraph/ir'
import type { Point, Segment } from './index.ts'

// Placing a state diagram. The schematic router puts logic in rows by depth;
// a machine has no depth, so states go in columns by how far they are from
// reset — the way the D02 diagrams read, left to right from the reset state.
//
// Everything is orthogonal, like the schematic: the same segments, the same
// round joins, and both exporters already know how to draw them. Curves would
// have meant a new item kind in the scene and bezier support in the PDF writer
// for no gain in what the picture says.

const STATE_H = 44
const STATE_MIN_W = 96
const CHAR_W = 7
const COL_GAP = 110 // room for a transition label between two columns
const ROW_GAP = 34
const MARGIN = 28
const PITCH = 12 // spacing between the lanes back edges run in
const LOOP_H = 26
const ARROW = 7
const RESET_STUB = 26

export interface FsmStateBox {
  id: string
  label: string
  encoding?: string
  x: number
  y: number
  w: number
  h: number
  reset: boolean
}

export interface FsmEdge {
  index: number // its place in graph.transitions, so the editor can point back
  from: string
  to: string
  label: string
  segments: Segment[]
  arrow: [number, number][] // the head, as a triangle
  labelAt: Point
  labelAnchor: 'start' | 'middle' | 'end'
}

export interface FsmLayout {
  states: FsmStateBox[]
  edges: FsmEdge[]
  width: number
  height: number
}

const widthOf = (label: string, encoding: string | undefined) =>
  Math.max(STATE_MIN_W, 20 + CHAR_W * Math.max(label.length, (encoding ?? '').length))

// How far each state is from reset, following transitions. A state nothing
// reaches (a mistake worth seeing, not hiding) is put after the ones that are
// reachable rather than dropped.
function columns(graph: FsmGraph): Map<string, number> {
  const out = new Map<string, string[]>()
  for (const id of Object.keys(graph.states)) out.set(id, [])
  for (const t of graph.transitions) if (out.has(t.from) && graph.states[t.to]) out.get(t.from)!.push(t.to)

  const depth = new Map<string, number>()
  const start = graph.states[graph.machine.reset] ? graph.machine.reset : Object.keys(graph.states)[0]
  let front = start === undefined ? [] : [start]
  if (start !== undefined) depth.set(start, 0)
  for (let d = 1; front.length > 0; d++) {
    const next: string[] = []
    for (const id of front) {
      for (const to of out.get(id) ?? []) {
        if (depth.has(to)) continue
        depth.set(to, d)
        next.push(to)
      }
    }
    front = next
  }
  const unreached = Math.max(0, ...[...depth.values()].map(d => d + 1))
  for (const id of Object.keys(graph.states)) if (!depth.has(id)) depth.set(id, unreached)
  return depth
}

const head = (x: number, y: number, dir: 'right' | 'left' | 'up' | 'down'): [number, number][] => {
  const along = dir === 'right' ? [1, 0] : dir === 'left' ? [-1, 0] : dir === 'down' ? [0, 1] : [0, -1]
  const side = [along[1], along[0]]
  return [
    [x, y],
    [x - along[0] * ARROW + side[0] * ARROW * 0.5, y - along[1] * ARROW + side[1] * ARROW * 0.5],
    [x - along[0] * ARROW - side[0] * ARROW * 0.5, y - along[1] * ARROW - side[1] * ARROW * 0.5],
  ]
}

const seg = (x1: number, y1: number, x2: number, y2: number): Segment => ({ x1, y1, x2, y2 })

// Transition labels are set two sizes down; 6px a character is close enough to
// keep them on the page.
const labelWidth = (e: FsmEdge) => e.label.length * 6

export function layoutFsm(graph: FsmGraph): FsmLayout {
  const depth = columns(graph)
  const ids = Object.keys(graph.states)
  const byColumn = new Map<number, string[]>()
  for (const id of ids) {
    const c = depth.get(id) ?? 0
    byColumn.set(c, [...(byColumn.get(c) ?? []), id])
  }
  const order = [...byColumn.keys()].sort((a, b) => a - b)

  // A column is as wide as its widest state, so the lanes between columns are
  // straight and every label in a lane starts at the same x.
  const label = (id: string) => graph.states[id].label ?? id
  const colWidth = new Map<number, number>()
  for (const [c, members] of byColumn) colWidth.set(c, Math.max(...members.map(id => widthOf(label(id), graph.states[id].encoding))))

  const rows = Math.max(...[...byColumn.values()].map(m => m.length))
  const contentH = rows * STATE_H + (rows - 1) * ROW_GAP
  // Self-loops stand above their state and carry a label above that, so the top
  // row needs room for them before anything is placed.
  const top = MARGIN + (graph.transitions.some(t => t.from === t.to) ? LOOP_H + 14 : 0)
  const boxes = new Map<string, FsmStateBox>()
  let x = MARGIN + RESET_STUB
  for (const c of order) {
    const members = byColumn.get(c)!
    const w = colWidth.get(c)!
    const colH = members.length * STATE_H + (members.length - 1) * ROW_GAP
    let y = top + (contentH - colH) / 2
    for (const id of members) {
      boxes.set(id, { id, label: label(id), encoding: graph.states[id].encoding, x, y, w, h: STATE_H, reset: id === graph.machine.reset })
      y += STATE_H + ROW_GAP
    }
    x += w + COL_GAP
  }
  const bottom = top + contentH

  // Back edges share the space under the diagram; each gets a lane of its own so
  // two of them never sit on top of each other, and they leave and arrive at
  // points spread along the box edge — two arrows into the same spot read as one.
  const isBack = (t: FsmTransition) =>
    t.from !== t.to && boxes.has(t.from) && boxes.has(t.to) && (depth.get(t.from) ?? 0) >= (depth.get(t.to) ?? 0)
  const backs = graph.transitions.filter(isBack)
  const slot = (id: string, end: 'from' | 'to', nth: number) => {
    const box = boxes.get(id)!
    const total = backs.filter(t => t[end] === id).length
    return box.x + (box.w * (nth + 1)) / (total + 1)
  }
  const seen = { from: new Map<string, number>(), to: new Map<string, number>() }
  const next = (id: string, end: 'from' | 'to') => {
    const nth = seen[end].get(id) ?? 0
    seen[end].set(id, nth + 1)
    return slot(id, end, nth)
  }

  let lanes = 0
  const edges: FsmEdge[] = []
  graph.transitions.forEach((t, index) => {
    const back = isBack(t) ? { out: next(t.from, 'from'), in: next(t.to, 'to'), y: bottom + PITCH * ++lanes } : undefined
    const edge = route(t, index, boxes, back)
    if (edge) edges.push(edge)
  })

  // A label is wider than the lane it sits in; the page grows to hold it rather
  // than letting the text run off the edge of an exported figure.
  const right = Math.max(x - COL_GAP, ...edges.map(e => e.labelAt.x + labelWidth(e) / 2))
  const height = (lanes > 0 ? bottom + PITCH * lanes + ARROW : bottom) + MARGIN
  return { states: [...boxes.values()], edges, width: right + MARGIN, height }
}

function route(
  t: FsmTransition,
  index: number,
  boxes: Map<string, FsmStateBox>,
  back: { out: number; in: number; y: number } | undefined,
): FsmEdge | undefined {
  const a = boxes.get(t.from)
  const b = boxes.get(t.to)
  if (!a || !b) return undefined // the validator reports it; there is nothing to draw
  const common = { index, from: t.from, to: t.to, label: t.when }

  if (a === b) {
    // A self-loop stands above its state, where nothing else runs.
    const top = a.y - LOOP_H
    const [l, r] = [a.x + a.w * 0.3, a.x + a.w * 0.7]
    return {
      ...common,
      segments: [seg(r, a.y, r, top), seg(r, top, l, top), seg(l, top, l, a.y - ARROW)],
      arrow: head(l, a.y, 'down'),
      labelAt: { x: (l + r) / 2, y: top - 6 },
      labelAnchor: 'middle',
    }
  }

  const midY = (y: FsmStateBox) => y.y + y.h / 2
  if (!back) {
    // Left to right through the lane between the two columns, with one jog when
    // the states are not on the same row.
    const x1 = a.x + a.w
    const x2 = b.x
    const turn = (x1 + x2) / 2
    const [y1, y2] = [midY(a), midY(b)]
    const segments = y1 === y2
      ? [seg(x1, y1, x2 - ARROW, y2)]
      : [seg(x1, y1, turn, y1), seg(turn, y1, turn, y2), seg(turn, y2, x2 - ARROW, y2)]
    return { ...common, segments, arrow: head(x2, y2, 'right'), labelAt: { x: turn, y: Math.min(y1, y2) - 6 }, labelAnchor: 'middle' }
  }

  // Backwards (or sideways): down into a lane under the diagram, along, and up
  // into the bottom of the target. Always the same shape, so a reader can tell a
  // return path at a glance.
  const { y, out: x1, in: x2 } = back
  return {
    ...common,
    segments: [seg(x1, a.y + a.h, x1, y), seg(x1, y, x2, y), seg(x2, y, x2, b.y + b.h + ARROW)],
    arrow: head(x2, b.y + b.h, 'up'),
    labelAt: { x: (x1 + x2) / 2, y: y - 4 },
    labelAnchor: 'middle',
  }
}

// The little arrow that says where the machine starts.
export function resetStub(state: FsmStateBox): { segments: Segment[]; arrow: [number, number][] } {
  const y = state.y + state.h / 2
  return { segments: [seg(state.x - RESET_STUB, y, state.x - ARROW, y)], arrow: head(state.x, y, 'right') }
}
