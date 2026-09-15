import type { ComponentGraph, HierarchyEntry, PortNode, RtlNode } from '@rtlgraph/ir'
import { parseEndpoint } from '@rtlgraph/ir'
import { lookupSymbol, type Side } from '@rtlgraph/registry'

// Automatic schematic layout, following the slide p.31 convention:
//
//   channel 0      ── wire tracks ──
//   row 0          control block · deepest combinational logic (e.g. MUX)
//   channel 1      ── wire tracks ──
//   row 1          combinational depth 1 (+1, ADD, SUB)
//   channel 2      ── wire tracks ──
//   row 2          registers
//   channel 3      ── wire tracks ──
//   row 3          output ports
//
// Every wire is orthogonal: a pin reaches a horizontal track in the channel next
// to it, and a net spanning several channels climbs a vertical riser placed in a
// gap that no box, pin stub or other riser occupies. The layout always places
// every node, so toggling the view filter never moves a box.

export interface Point {
  x: number
  y: number
}

export interface Pin extends Point {
  side: Side
}

export interface NodeBox {
  x: number
  y: number
  w: number
  h: number
  row: number
  pins: Record<string, Pin>
}

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Wire {
  segments: Segment[]
  junctions: Point[]
}

export interface LayoutResult {
  width: number
  height: number
  nodes: Record<string, NodeBox>
  wires: Record<string, Wire>
}

// A port node has a single pin, stored under this key.
export const PORT_PIN = ''
export const TITLE_H = 24
export const PIN_STEP = 20

const MARGIN = 24
const NODE_GAP = 40
const PITCH = 10 // spacing between parallel tracks, drops and risers
const CHANNEL_PAD = 14
const PORT_GAP = 36
const CHAR_W = 7
const BOX_PAD = 6
const MIN_TRACK_SEP = 6
const PORT_H = 18
const STACK_GAP = 6

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

type Interval = [number, number]

interface Shape {
  w: number
  h: number
  titled: boolean // generic boxes list their pins under a title
  sides: Map<string, Side> // pin -> side, in drawing order
  pinOffsets?: Map<string, number> // side pins at a fixed distance from the top (frames)
}

// An unfolded component is drawn as a frame around its own schematic. The parent
// layout only needs the frame size and where each child port meets its edge.
export const FRAME_TITLE_H = 22

export interface Frame {
  w: number
  h: number
  pins: Record<string, { side: 'left' | 'right'; offset: number }> // offset from the frame top
}

export interface LayoutOptions {
  frames?: Record<string, Frame> // component node id -> frame, for unfolded components
  // Keep the component's own ports on its left (inputs) and right (outputs)
  // edges, for a schematic drawn inside a frame.
  boundaryPorts?: boolean
}

export interface ChildPlacement {
  layout: NestedLayout
  x: number // origin of the child layout in the parent's coordinates
  y: number
  connectors: Record<string, Segment> // child port name -> segment from the frame edge to that port
}

export interface NestedLayout extends LayoutResult {
  children: Record<string, ChildPlacement> // unfolded component node id -> placement
}

// Lays out a hierarchy bottom-up: every unfolded child first, then its parent
// with that child as a frame of the right size. `isUnfolded` receives the
// child's instance path ("u_host", "u_host/u_dma").
export function layoutHierarchy(
  entry: HierarchyEntry,
  isUnfolded: (instance: string) => boolean,
  insideFrame = false,
): NestedLayout {
  const frames: Record<string, Frame> = {}
  const inner = new Map<string, NestedLayout>()
  for (const [id, child] of Object.entries(entry.children)) {
    if (!isUnfolded(child.instance)) continue
    const childLayout = layoutHierarchy(child, isUnfolded, true)
    const asked = entry.graph.layout?.sizes?.[id] // a frame the reader resized
    const pins: Frame['pins'] = {}
    for (const [portId, box] of Object.entries(childLayout.nodes)) {
      const pin = box.pins[PORT_PIN]
      if (!portId.startsWith('@') || !pin) continue
      pins[portId.slice(1)] = { side: pin.side === 'right' ? 'left' : 'right', offset: FRAME_TITLE_H + pin.y }
    }
    frames[id] = {
      w: Math.max(childLayout.width, asked?.w ?? 0),
      h: Math.max(childLayout.height + FRAME_TITLE_H, asked?.h ?? 0),
      pins,
    }
    inner.set(id, childLayout)
  }

  const layout = layoutComponent(entry.graph, { frames, boundaryPorts: insideFrame })
  const children: Record<string, ChildPlacement> = {}
  for (const [id, childLayout] of inner) {
    const frame = layout.nodes[id]
    const ox = frame.x
    const oy = frame.y + FRAME_TITLE_H
    const connectors: Record<string, Segment> = {}
    for (const [portId, box] of Object.entries(childLayout.nodes)) {
      const pin = box.pins[PORT_PIN]
      if (!portId.startsWith('@') || !pin) continue
      const y = oy + pin.y
      connectors[portId.slice(1)] = pin.side === 'right'
        ? { x1: frame.x, y1: y, x2: ox + box.x, y2: y } // input: frame's left edge -> port box
        : { x1: ox + box.x + box.w, y1: y, x2: frame.x + frame.w, y2: y } // output: port box -> right edge
    }
    children[id] = { layout: childLayout, x: ox, y: oy, connectors }
  }
  return { ...layout, children }
}

export const displayName = (id: string): string => id.replace(/^@/, '').split('.').pop()!
const textWidth = (s: string) => s.length * CHAR_W

function shapeOf(id: string, node: RtlNode, portSide: Side, frame?: Frame): Shape {
  if (node.kind === 'port') {
    return { w: Math.max(28, textWidth(displayName(id)) + 14), h: PORT_H, titled: false, sides: new Map([[PORT_PIN, portSide]]) }
  }
  const sides = new Map<string, Side>()
  if (node.kind === 'component' && frame) {
    const pinOffsets = new Map<string, number>()
    let unplaced = 0 // ports the child never draws (hidden nets) stack up from the bottom
    for (const [name, dir] of Object.entries(node.ports)) {
      const at = frame.pins[name]
      sides.set(name, at?.side ?? (dir === 'out' ? 'right' : 'left'))
      pinOffsets.set(name, at?.offset ?? frame.h - PIN_STEP / 2 - PIN_STEP * unplaced++)
    }
    // Drops are handed out in pin order, which must run top to bottom.
    const ordered = new Map([...sides].sort(([a], [b]) => pinOffsets.get(a)! - pinOffsets.get(b)!))
    return { w: frame.w, h: frame.h, titled: false, sides: ordered, pinOffsets }
  }
  const def = node.kind === 'control' || node.kind === 'component' ? undefined : lookupSymbol(node.module)
  if (def) {
    for (const p of def.ports) if (Object.hasOwn(node.ports, p.name)) sides.set(p.name, p.side)
    for (const [name, dir] of Object.entries(node.ports)) if (!sides.has(name)) sides.set(name, dir === 'out' ? 'right' : 'left')
    const bottom = [...sides.values()].filter(s => s === 'bottom').length
    if (def.symbol === 'register') return { w: Math.max(100, textWidth(displayName(id)) + 28), h: 26, titled: false, sides }
    if (def.symbol === 'mux') return { w: Math.max(56, (bottom + 1) * 18), h: 20, titled: false, sides }
    return { w: Math.max(48, (bottom + 1) * 16, textWidth(def.label ?? def.module) + 20), h: 34, titled: false, sides }
  }
  for (const [name, dir] of Object.entries(node.ports)) sides.set(name, dir === 'out' ? 'right' : 'left')
  const left = [...sides.values()].filter(s => s === 'left').length
  const longest = Math.max(0, ...Object.keys(node.ports).map(textWidth))
  return {
    w: Math.max(110, textWidth(node.kind === 'component' ? node.label ?? node.name : node.module) + 24 + (node.kind === 'component' ? 20 : 0), longest * 2 + 30),
    h: TITLE_H + Math.max(left, sides.size - left, 1) * PIN_STEP + 6,
    titled: true,
    sides,
  }
}

function pinsOf(x: number, y: number, shape: Shape): Record<string, Pin> {
  const bySide = new Map<Side, string[]>()
  for (const [name, side] of shape.sides) bySide.set(side, [...(bySide.get(side) ?? []), name])
  const pins: Record<string, Pin> = {}
  for (const [side, names] of bySide) {
    names.forEach((name, k) => {
      const n = names.length
      if (side === 'top' || side === 'bottom') {
        pins[name] = { side, x: x + Math.round((shape.w * (k + 1)) / (n + 1)), y: side === 'top' ? y : y + shape.h }
      } else {
        const offset = shape.pinOffsets?.get(name)
        const py = offset !== undefined ? y + offset
          : shape.titled ? y + TITLE_H + k * PIN_STEP + PIN_STEP / 2
          : y + Math.round((shape.h * (k + 1)) / (n + 1))
        pins[name] = { side, x: side === 'left' ? x : x + shape.w, y: py }
      }
    })
  }
  return pins
}

export function layoutComponent(graph: ComponentGraph, options: LayoutOptions = {}): LayoutResult {
  const { nodes, signals } = graph
  const boundary = options.boundaryPorts === true
  // What the reader arranged by hand (graph.layout, which no extractor writes):
  // where a box sits, the shape of a wire, and the links they cut in the sketch.
  const pinned = graph.layout?.nodes ?? {}
  const drawn = graph.layout?.wires ?? {}
  const cut = new Set(graph.layout?.cut ?? [])
  const ids = Object.keys(nodes)
  const signalNames = Object.keys(signals)
  const signalIndex = new Map(signalNames.map((name, i) => [name, i]))

  const netAt = new Map<string, string>() // endpoint ref -> signal
  for (const [name, s] of Object.entries(signals)) for (const ref of [s.driver, ...s.sinks]) netAt.set(ref, name)
  const refOf = (id: string, pin: string) => (pin === PORT_PIN ? id : `${id}:${pin}`)
  const nodeOf = (ref: string) => parseEndpoint(ref).node
  const pinOf = (ref: string) => parseEndpoint(ref).port ?? PORT_PIN
  const routedNet = (name: string) => !signals[name].hidden && !cut.has(name)

  // ── shapes of instances, then port nodes facing the pin they connect to ──
  const shapes = new Map<string, Shape>()
  for (const id of ids) if (nodes[id].kind !== 'port') shapes.set(id, shapeOf(id, nodes[id], 'left', options.frames?.[id]))
  const sideAt = (ref: string) => shapes.get(nodeOf(ref))?.sides.get(pinOf(ref))

  const portNets = new Map<string, string[]>()
  for (const name of signalNames) {
    if (!routedNet(name)) continue
    for (const ref of [signals[name].driver, ...signals[name].sinks]) {
      if (nodes[nodeOf(ref)].kind === 'port') portNets.set(nodeOf(ref), [...(portNets.get(nodeOf(ref)) ?? []), name])
    }
  }

  // A port wired to exactly one pin that faces it is drawn as a straight stub
  // right next to that pin instead of being routed through channels. That only
  // works when the pin has room: two port boxes beside pins 8px apart overlap.
  const pinRoom = (ref: string) => {
    const shape = shapes.get(nodeOf(ref))!
    const side = shape.sides.get(pinOf(ref))
    if (side !== 'left' && side !== 'right') return true
    const pins = pinsOf(0, 0, shape)
    const ys = [...shape.sides].filter(([, s]) => s === side).map(([pin]) => pins[pin].y).sort((a, b) => a - b)
    return ys.every((y, i) => i === 0 || y - ys[i - 1] >= PORT_H + 2)
  }
  const directPort = new Map<string, string>() // port id -> the instance ref it hugs
  for (const [id, nets] of portNets) {
    const port = nodes[id] as PortNode
    if (boundary) {
      // Inside a frame a port meets the frame edge: inputs face right, outputs left.
      // An input can still sit next to a pin of the control block, which leads its
      // row, so nothing lies between the edge and the port (checked below).
      shapes.set(id, shapeOf(id, port, port.dir === 'out' ? 'left' : 'right'))
      const s = signals[nets[0]]
      const sink = s.sinks[0]
      if (port.dir === 'in' && nets.length === 1 && s.sinks.length === 1 && nodes[nodeOf(sink)].kind === 'control' && sideAt(sink) === 'left' && pinRoom(sink)) {
        directPort.set(id, sink)
      }
      continue
    }
    const s = signals[nets[0]]
    let side: Side
    if (port.dir === 'out') {
      const ds = nodes[nodeOf(s.driver)].kind === 'port' ? undefined : sideAt(s.driver)
      side = ds ? OPPOSITE[ds] : 'left'
      // Only when this port is all the net feeds: another reader needs the channels.
      if (nets.length === 1 && s.sinks.length === 1 && (ds === 'bottom' || ds === 'right') && pinRoom(s.driver)) {
        directPort.set(id, s.driver)
      }
    } else {
      const sink = s.sinks.find(ref => nodes[nodeOf(ref)].kind !== 'port')
      const ss = sink && sideAt(sink)
      side = ss ? OPPOSITE[ss] : 'right'
      if (nets.length === 1 && s.sinks.length === 1 && ss === 'left' && pinRoom(sink!)) directPort.set(id, sink!)
    }
    shapes.set(id, shapeOf(id, port, side))
  }

  // ── rows ──
  const isComb = (n: RtlNode) => n.kind !== 'port' && n.kind !== 'control' && n.kind !== 'component' && n.time === 'comb'
  const level = new Map<string, number>()
  const visiting = new Set<string>()
  const levelOf = (id: string): number => {
    const known = level.get(id)
    if (known !== undefined) return known
    const n = nodes[id]
    if (n.kind === 'port' || !isComb(n)) return 0
    if (visiting.has(id)) return 1 // combinational loop (contract C1 violation): keep going
    visiting.add(id)
    let lv = 1
    for (const pin of Object.keys(n.ports)) {
      const net = netAt.get(`${id}:${pin}`)
      if (net === undefined || signals[net].driver === `${id}:${pin}`) continue
      const d = nodes[nodeOf(signals[net].driver)]
      if (d.kind !== 'port' && isComb(d)) lv = Math.max(lv, levelOf(nodeOf(signals[net].driver)) + 1)
    }
    visiting.delete(id)
    level.set(id, lv)
    return lv
  }
  const depth = Math.max(0, ...ids.filter(id => isComb(nodes[id])).map(levelOf))

  const row = new Map<string, number>()
  for (const id of ids) {
    const n = nodes[id]
    if (n.kind === 'control') row.set(id, 0)
    else if (n.kind !== 'port') row.set(id, isComb(n) ? depth - levelOf(id) : depth)
  }
  // That holds only for a single control block. Any other input port bound for the
  // control block's row moves one row down (below), so it never stacks beside the
  // huggers' frame pins.
  const controls = ids.filter(id => nodes[id].kind === 'control')
  if (boundary && controls.length !== 1) directPort.clear()
  const huggedRow = boundary && directPort.size > 0 ? row.get(controls[0]) : undefined
  const directNets = new Set<string>()
  for (const id of directPort.keys()) directNets.add(portNets.get(id)![0])
  const channelNet = (name: string) => routedNet(name) && !directNets.has(name)
  for (const id of portNets.keys()) {
    const port = nodes[id] as PortNode
    const hug = directPort.get(id)
    const s = signals[portNets.get(id)![0]]
    if (hug !== undefined) row.set(id, sideAt(hug) === 'bottom' ? depth + 1 : row.get(nodeOf(hug))!)
    else if (port.dir === 'out' && boundary && nodes[nodeOf(s.driver)].kind !== 'port') row.set(id, row.get(nodeOf(s.driver))!)
    else if (port.dir === 'out') row.set(id, depth + 1)
    else {
      const sink = s.sinks.find(ref => nodes[nodeOf(ref)].kind !== 'port')
      const r = sink ? row.get(nodeOf(sink))! : 0
      row.set(id, r === huggedRow ? r + 1 : r)
    }
  }
  const rowCount = Math.max(...row.values()) + 1

  // ── drops: vertical escapes for left/right pins that are routed through channels ──
  const dropPins = (id: string, side: 'left' | 'right') =>
    [...shapes.get(id)!.sides].filter(([pin, s]) => {
      const net = netAt.get(refOf(id, pin))
      return s === side && net !== undefined && channelNet(net)
    }).map(([pin]) => pin)
  const huggers = (id: string, side: Side) =>
    [...directPort].filter(([, ref]) => nodeOf(ref) === id && sideAt(ref) === side).map(([port]) => shapes.get(port)!.w)

  // Inside a frame, the ports of one row that face the same edge form a stack:
  // one column, one width, each port on its own line so every frame pin gets its
  // own y. The stack takes a single place in its row and a drop per member.
  const stacks = new Map<string, string[]>() // port id -> its stack, top to bottom
  if (boundary) {
    const groups = new Map<string, string[]>()
    for (const id of portNets.keys()) {
      if (directPort.has(id)) continue
      const key = `${row.get(id)}:${(nodes[id] as PortNode).dir}`
      groups.set(key, [...(groups.get(key) ?? []), id])
    }
    for (const members of groups.values()) {
      const w = Math.max(...members.map(id => shapes.get(id)!.w))
      for (const id of members) {
        shapes.set(id, { ...shapes.get(id)!, w })
        stacks.set(id, members)
      }
    }
  }
  const stackIndex = (id: string) => stacks.get(id)?.indexOf(id) ?? 0
  const heightInRow = (id: string) => {
    const members = stacks.get(id)
    return members ? members.length * PORT_H + (members.length - 1) * STACK_GAP : shapes.get(id)!.h
  }
  // Registers, control blocks and frames stand on the bottom of their row, as the
  // slide draws them. Combinational boxes hang from the top instead: their output
  // pin is on top, and in a row made tall by a control block the climb up to the
  // channel was longer than the box itself.
  const hangs = (id: string) => isComb(nodes[id]) && !stacks.has(id)
  const topInRow = (id: string, rowH: number) =>
    (hangs(id) ? 0 : rowH - heightInRow(id)) + (stacks.has(id) ? stackIndex(id) * (PORT_H + STACK_GAP) : 0)
  // The refs that leave one side of a box (or a stack) through drops, top to bottom.
  const dropRefs = (id: string, side: 'left' | 'right') =>
    stacks.has(id)
      ? shapes.get(id)!.sides.get(PORT_PIN) === side ? stacks.get(id)! : []
      : dropPins(id, side).map(pin => refOf(id, pin))
  const leftSpace = (id: string) => PITCH * dropRefs(id, 'left').length + Math.max(0, ...huggers(id, 'left').map(w => w + PORT_GAP))
  const rightSpace = (id: string) => PITCH * dropRefs(id, 'right').length + Math.max(0, ...huggers(id, 'right').map(w => w + PORT_GAP))

  // ── x: order and place each row, pulling nodes over their data neighbours ──
  const packed = ids.filter(id => row.has(id) && !directPort.has(id))
  const leader = (id: string) => stacks.get(id)?.[0] ?? id
  const fixed = (id: string) => nodes[id].kind === 'control' || nodes[id].kind === 'port'
  const rows: string[][] = Array.from({ length: rowCount }, () => [])
  // Inside a frame, input ports lead their row and output ports close it.
  const edge = (id: string) => (!boundary || nodes[id].kind !== 'port' ? 0 : (nodes[id] as PortNode).dir === 'out' ? 1 : -1)
  const leading = packed.filter(id => fixed(id) && leader(id) === id).sort((a, b) => edge(a) - edge(b)).filter(id => edge(id) <= 0)
  const closing = packed.filter(id => edge(id) === 1 && leader(id) === id)
  for (const id of leading) rows[row.get(id)!].push(id)
  for (const id of packed.filter(id => !fixed(id))) rows[row.get(id)!].push(id)
  for (const id of closing) rows[row.get(id)!].push(id)

  const x = new Map<string, number>()
  const W = (id: string) => shapes.get(id)!.w
  const gap = (a: string, b: string) => NODE_GAP + rightSpace(a) + leftSpace(b)
  const relax = (members: string[], desired: (id: string) => number) => {
    members.forEach((id, i) => {
      const lo = i === 0 ? MARGIN + leftSpace(id) : x.get(members[i - 1])! + W(members[i - 1]) + gap(members[i - 1], id)
      x.set(id, Math.max(lo, Math.floor(desired(id))))
    })
    for (let i = members.length - 1; i >= 0; i--) {
      const id = members[i]
      const lo = i === 0 ? MARGIN + leftSpace(id) : x.get(members[i - 1])! + W(members[i - 1]) + gap(members[i - 1], id)
      const hi = i === members.length - 1 ? Infinity : x.get(members[i + 1])! - gap(id, members[i + 1]) - W(id)
      x.set(id, Math.max(lo, Math.floor(Math.min(desired(id), hi))))
    }
  }
  for (const members of rows) relax(members, () => -Infinity)

  const neighbours = new Map<string, string[]>()
  for (const name of signalNames) {
    const s = signals[name]
    if (s.flow !== 'data' || !routedNet(name)) continue
    const d = nodeOf(s.driver)
    for (const ref of s.sinks) {
      const k = nodeOf(ref)
      if (!x.has(d) || !x.has(k) || row.get(d) === row.get(k)) continue
      neighbours.set(d, [...(neighbours.get(d) ?? []), k])
      neighbours.set(k, [...(neighbours.get(k) ?? []), d])
    }
  }
  const center = (id: string) => x.get(id)! + W(id) / 2
  const barycenter = (id: string) => {
    const ns = neighbours.get(id) ?? []
    return ns.length === 0 ? center(id) : ns.reduce((sum, n) => sum + center(n), 0) / ns.length
  }
  for (let iter = 0; iter < 8; iter++) {
    const order = rows.map((_, i) => (iter % 2 === 0 ? i : rows.length - 1 - i))
    for (const r of order) {
      const head = rows[r].filter(id => fixed(id) && edge(id) <= 0)
      const tail = rows[r].filter(id => !fixed(id))
        .map((id, i) => ({ id, key: barycenter(id), i }))
        .sort((a, b) => a.key - b.key || a.i - b.i)
        .map(e => e.id)
      rows[r] = [...head, ...tail, ...rows[r].filter(id => edge(id) === 1)]
      relax(rows[r], id => (Object.hasOwn(pinned, id) ? pinned[id].x : fixed(id) ? -Infinity : barycenter(id) - W(id) / 2))
    }
  }
  // An output port closes its own row, right after what drives it: pushing them all
  // out to the widest row's edge made every frame as wide as its longest row.
  //
  // The passes above only ever move a box toward its neighbours, so a group that
  // refers to nothing else can settle far to the right of the fixed heads and stay
  // there. Take back the slack every row can spare, the same amount everywhere, so
  // nothing moves relative to anything else.
  // A box the reader placed stays where they put it.
  for (const [id, at] of Object.entries(pinned)) if (x.has(id)) x.set(id, Math.floor(at.x))
  const slack = Math.min(...rows.map(members => {
    const first = members.findIndex(id => !fixed(id))
    if (first < 0) return Infinity
    const id = members[first]
    const lo = first === 0
      ? MARGIN + leftSpace(id)
      : x.get(members[first - 1])! + W(members[first - 1]) + gap(members[first - 1], id)
    return x.get(id)! - lo
  }))
  if (Number.isFinite(slack) && slack > 0) {
    for (const members of rows) {
      const first = members.findIndex(id => !fixed(id))
      if (first < 0) continue
      for (const id of members.slice(first)) x.set(id, x.get(id)! - slack)
      relax(members, id => x.get(id)!) // trailing output ports follow their row left
    }
  }
  for (const id of packed) if (leader(id) !== id) x.set(id, x.get(leader(id))!)

  const pinX = (ref: string) => pinsOf(x.get(nodeOf(ref))!, 0, shapes.get(nodeOf(ref))!)[pinOf(ref)].x
  for (const [id, hug] of directPort) {
    const host = nodeOf(hug)
    const side = sideAt(hug)!
    if (side === 'left') x.set(id, x.get(host)! - PITCH * dropPins(host, 'left').length - PORT_GAP - W(id))
    else if (side === 'right') x.set(id, x.get(host)! + W(host) + PITCH * dropPins(host, 'right').length + PORT_GAP)
    else x.set(id, pinX(hug) - Math.round(W(id) / 2))
  }
  const shift = MARGIN - Math.min(...x.values())
  if (shift > 0) for (const [id, v] of x) x.set(id, v + shift)

  // ── routing plan (x only): accesses, risers, trunks ──
  // All drops on one side of a box leave in the same direction: up to the channel
  // above, or down to the one below when most of what they connect to lies lower.
  // A pin whose other ends sit in its own row votes for the nearer channel — boxes
  // stand on the bottom of their row, so that is usually the one below, and a net
  // between two such pins then needs no riser at all.
  const verticalRank = (ref: string) => {
    const r = row.get(nodeOf(ref))!
    const side = sideAt(ref)
    return side === 'top' ? r - 0.5 : side === 'bottom' ? r + 0.5 : r
  }
  const dropsDown = (id: string, side: 'left' | 'right') => {
    let vote = 0
    for (const ref of dropRefs(id, side)) {
      const pin = pinOf(ref)
      const net = signals[netAt.get(ref)!]
      const others = [net.driver, ...net.sinks].filter(other => other !== ref)
      const mean = others.reduce((sum, other) => sum + verticalRank(other), 0) / others.length
      const r = row.get(id)!
      // Everything in this row leaves through the channel below it: both ends of a
      // net between two boxes of one row then meet there, with no riser between them.
      vote += mean < r ? -1 : 1
    }
    return vote > 0
  }

  interface Access { ref: string; ax: number; ch: number; drop?: number; down?: boolean }
  const access = (ref: string): Access => {
    const id = nodeOf(ref)
    const pin = pinOf(ref)
    const side = shapes.get(id)!.sides.get(pin)!
    const r = row.get(id)!
    if (side === 'top') return { ref, ax: pinX(ref), ch: r }
    if (side === 'bottom') return { ref, ax: pinX(ref), ch: r + 1 }
    const refs = dropRefs(id, side)
    const down = dropsDown(id, side)
    // The pin nearest the escape direction gets the drop closest to the box, so drops never cross stubs.
    const offset = PITCH * (down ? refs.length - refs.indexOf(ref) : refs.indexOf(ref) + 1)
    const drop = side === 'left' ? x.get(id)! - offset : x.get(id)! + W(id) + offset
    return { ref, ax: drop, ch: down ? r + 1 : r, drop, down }
  }

  // [lo, hi, owner]: the net that put the obstacle there (none for boxes). A riser
  // is never blocked by its own net's stubs — see `runsBack` below for the one case
  // where it must still avoid them.
  type Obstacle = [number, number, string?]
  const obstacles = () => Array.from({ length: rowCount + 1 }, (): Obstacle[] => [])
  const boxObs = obstacles()
  const dropUpObs = obstacles()
  const dropDownObs = obstacles()
  const topPinObs = obstacles()
  const bottomPinObs = obstacles()
  const riserObs = obstacles()
  for (const [id, left] of x) boxObs[row.get(id)!].push([left - BOX_PAD, left + W(id) + BOX_PAD])

  interface Plan { accesses: Access[]; riser?: { x: number; a: number; b: number }; trunks: Map<number, Interval> }
  const plans = new Map<string, Plan>()
  for (const name of signalNames) {
    if (!channelNet(name)) continue
    const s = signals[name]
    const accesses = [s.driver, ...s.sinks].map(access)
    plans.set(name, { accesses, trunks: new Map() })
    for (const a of accesses) {
      const r = row.get(nodeOf(a.ref))!
      const side = shapes.get(nodeOf(a.ref))!.sides.get(pinOf(a.ref))
      if (a.drop !== undefined) (a.down ? dropDownObs : dropUpObs)[r].push([a.drop - 3, a.drop + 3, name])
      else (side === 'top' ? topPinObs : bottomPinObs)[r].push([a.ax - 4, a.ax + 4, name])
    }
  }
  for (const [id, hug] of directPort) {
    const side = sideAt(hug)
    if (side === 'bottom') topPinObs[row.get(id)!].push([pinX(hug) - 4, pinX(hug) + 4, portNets.get(id)![0]])
  }

  const blocked = (xv: number, a: number, b: number, owner: string) => {
    const hit = (list: Obstacle[] | undefined) => !!list?.some(([lo, hi, by]) => by !== owner && xv >= lo && xv <= hi)
    for (let r = a; r < b; r++) if (hit(boxObs[r]) || hit(dropUpObs[r]) || hit(dropDownObs[r])) return true
    if (hit(dropUpObs[b]) || hit(dropDownObs[a - 1]) || hit(bottomPinObs[a - 1]) || hit(topPinObs[b])) return true
    for (let r = Math.max(0, a - 1); r <= Math.min(rowCount, b); r++) if (hit(riserObs[r])) return true
    return false
  }

  for (const [name, plan] of plans) {
    const driver = plan.accesses[0]
    const channels = [...new Set(plan.accesses.map(a => a.ch))].sort((p, q) => p - q)
    let riserX: number | undefined
    if (channels.length > 1) {
      const a = channels[0]
      const b = channels[channels.length - 1]
      const far = plan.accesses.filter(acc => acc.ch !== driver.ch)
      const farMean = far.reduce((sum, acc) => sum + acc.ax, 0) / far.length
      // A riser sharing x with one of its own stubs is fine when it simply continues
      // that stub (the stub enters the riser's end channel from outside the span),
      // but not when it would run back along it.
      const entersFromAbove = (acc: Access) =>
        acc.drop !== undefined ? !!acc.down : shapes.get(nodeOf(acc.ref))!.sides.get(pinOf(acc.ref)) === 'bottom'
      const runsBack = (c: number) =>
        plan.accesses.some(acc => acc.ax === c && !((acc.ch === a && entersFromAbove(acc)) || (acc.ch === b && !entersFromAbove(acc))))
      const candidates = new Set<number>([driver.ax, Math.round(farMean), ...far.map(acc => acc.ax)])
      const lists = [...boxObs, ...dropUpObs, ...dropDownObs, ...topPinObs, ...bottomPinObs, ...riserObs]
      for (const list of lists) for (const [lo, hi] of list) { candidates.add(Math.floor(lo) - 1); candidates.add(Math.ceil(hi) + 1) }
      let best: { x: number; cost: number } | undefined
      for (const c of candidates) {
        if (c < MARGIN / 2 || blocked(c, a, b, name) || runsBack(c)) continue
        // Prefer continuing a stub straight on: every x that does not saves a bend.
        const aligned = plan.accesses.some(acc => acc.ax === c)
        const cost = Math.abs(c - driver.ax) + Math.abs(c - farMean) + (aligned ? 0 : PITCH)
        if (!best || cost < best.cost || (cost === best.cost && c < best.x)) best = { x: c, cost }
      }
      riserX = best?.x ?? Math.max(...boxObs.flat().map(([, hi]) => hi)) + PITCH
      plan.riser = { x: riserX, a, b }
      for (let r = Math.max(0, a - 1); r <= Math.min(rowCount, b); r++) riserObs[r].push([riserX - PITCH + 1, riserX + PITCH - 1, name])
    }
    for (const ch of channels) {
      const xs = plan.accesses.filter(acc => acc.ch === ch).map(acc => acc.ax)
      if (riserX !== undefined) xs.push(riserX)
      plan.trunks.set(ch, [Math.min(...xs), Math.max(...xs)])
    }
  }

  // ── tracks: interval colouring per channel, then an order of tracks in which a
  // stub coming down from the row above never runs over a stub rising from the
  // row below at the same x ──
  const trackOf = new Map<string, number>() // `${signal}@${channel}` -> track
  const trackCount: number[] = Array.from({ length: rowCount + 1 }, () => 0)
  for (let ch = 0; ch <= rowCount; ch++) {
    const trunks = [...plans]
      .filter(([, p]) => p.trunks.has(ch))
      .map(([name, p]) => ({ name, span: p.trunks.get(ch)! }))
      .sort((p, q) => p.span[0] - q.span[0] || p.span[1] - q.span[1] || signalIndex.get(p.name)! - signalIndex.get(q.name)!)
    const tracks: { spans: Interval[]; names: string[] }[] = []
    const colour = new Map<string, number>()
    for (const t of trunks) {
      let k = tracks.findIndex(tr => tr.spans.every(([lo, hi]) => t.span[0] > hi + MIN_TRACK_SEP || lo > t.span[1] + MIN_TRACK_SEP))
      if (k < 0) {
        tracks.push({ spans: [], names: [] })
        k = tracks.length - 1
      }
      tracks[k].spans.push(t.span)
      tracks[k].names.push(t.name)
      colour.set(t.name, k)
    }

    const fromAbove: [string, number][] = [] // occupies the channel from its top down to the track
    const fromBelow: [string, number][] = [] // occupies it from the track down to its bottom
    for (const { name } of trunks) {
      const plan = plans.get(name)!
      for (const acc of plan.accesses) {
        if (acc.ch !== ch) continue
        const side = shapes.get(nodeOf(acc.ref))!.sides.get(pinOf(acc.ref))
        if (acc.drop === undefined ? side === 'bottom' : acc.down) fromAbove.push([name, acc.ax])
        else fromBelow.push([name, acc.ax])
      }
      if (plan.riser?.a === ch) fromBelow.push([name, plan.riser.x])
      if (plan.riser?.b === ch) fromAbove.push([name, plan.riser.x])
    }
    const below = new Map<number, Set<number>>() // track -> tracks that must lie under it
    for (const [p, px] of fromAbove) {
      for (const [q, qx] of fromBelow) {
        const [a, b] = [colour.get(p)!, colour.get(q)!]
        if (p !== q && a !== b && Math.abs(px - qx) < 2) below.set(a, (below.get(a) ?? new Set()).add(b))
      }
    }
    topologicalOrder(tracks.length, below).forEach((k, position) => {
      for (const name of tracks[k].names) trackOf.set(`${name}@${ch}`, position)
    })
    trackCount[ch] = tracks.length
  }

  // ── y ──
  const rowH = rows.map((members, r) =>
    Math.max(20, ...members.map(heightInRow), ...[...directPort.keys()].filter(id => row.get(id) === r && sideAt(directPort.get(id)!) === 'bottom').map(id => shapes.get(id)!.h)))
  const chTop: number[] = []
  const rowTop: number[] = []
  let cursor = MARGIN
  for (let r = 0; r <= rowCount; r++) {
    chTop[r] = cursor
    cursor += 2 * CHANNEL_PAD + Math.max(0, trackCount[r] - 1) * PITCH
    if (r < rowCount) { rowTop[r] = cursor; cursor += rowH[r] }
  }
  const height = cursor + MARGIN

  const boxes: Record<string, NodeBox> = {}
  const place = (id: string, top: number) => {
    const shape = shapes.get(id)!
    boxes[id] = { x: x.get(id)!, y: top, w: shape.w, h: shape.h, row: row.get(id)!, pins: pinsOf(x.get(id)!, top, shape) }
  }
  for (const id of packed) place(id, rowTop[row.get(id)!] + topInRow(id, rowH[row.get(id)!]))
  for (const [id, hug] of directPort) {
    const side = sideAt(hug)
    if (side === 'bottom') place(id, rowTop[row.get(id)!] + rowH[row.get(id)!] - shapes.get(id)!.h)
    else place(id, boxes[nodeOf(hug)].pins[pinOf(hug)].y - shapes.get(id)!.h / 2)
  }

  // ── wires ──
  const pinAt = (ref: string) => boxes[nodeOf(ref)].pins[pinOf(ref)]
  const trackY = (name: string, ch: number) => chTop[ch] + CHANNEL_PAD + trackOf.get(`${name}@${ch}`)! * PITCH
  const wires: Record<string, Wire> = {}
  for (const name of signalNames) {
    if (!routedNet(name)) continue
    const segments: Segment[] = []
    const seg = (x1: number, y1: number, x2: number, y2: number) => {
      if (x1 !== x2 || y1 !== y2) segments.push({ x1, y1, x2, y2 })
    }
    const shaped = drawn[name]?.points
    if (shaped && shaped.length >= 2) {
      // The reader drew this one by hand; draw exactly that.
      for (let i = 1; i < shaped.length; i++) seg(shaped[i - 1].x, shaped[i - 1].y, shaped[i].x, shaped[i].y)
      wires[name] = { segments, junctions: junctionsOf(segments) }
      continue
    }
    const plan = plans.get(name)
    if (!plan) {
      // A hugging port: a straight stub. Bend once if the two pins do not line up.
      const s = signals[name]
      const a = pinAt(s.driver)
      const b = pinAt(s.sinks[0])
      const corner = a.side === 'left' || a.side === 'right' ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
      seg(a.x, a.y, corner.x, corner.y)
      seg(corner.x, corner.y, b.x, b.y)
    } else {
      for (const acc of plan.accesses) {
        const p = pinAt(acc.ref)
        const ty = trackY(name, acc.ch)
        if (acc.drop === undefined) seg(p.x, p.y, p.x, ty)
        else { seg(p.x, p.y, acc.drop, p.y); seg(acc.drop, p.y, acc.drop, ty) }
      }
      for (const [ch, [lo, hi]] of plan.trunks) seg(lo, trackY(name, ch), hi, trackY(name, ch))
      if (plan.riser) seg(plan.riser.x, trackY(name, plan.riser.a), plan.riser.x, trackY(name, plan.riser.b))
    }
    wires[name] = { segments, junctions: junctionsOf(segments) }
  }

  tidyWires(signals, boxes, wires, pinAt)

  const width = Math.max(...Object.values(boxes).map(b => b.x + b.w), ...Object.values(wires).flatMap(w => w.segments.map(s => Math.max(s.x1, s.x2)))) + MARGIN
  return { width, height, nodes: boxes, wires }
}

// Kahn's algorithm, lowest index first so the result is stable. On a cycle the
// constraints cannot all hold; keep the colouring order.
function topologicalOrder(n: number, below: Map<number, Set<number>>): number[] {
  const indegree = Array.from({ length: n }, () => 0)
  for (const set of below.values()) for (const b of set) indegree[b]++
  const ready = indegree.flatMap((d, i) => (d === 0 ? [i] : []))
  const order: number[] = []
  while (ready.length > 0) {
    ready.sort((p, q) => p - q)
    const k = ready.shift()!
    order.push(k)
    for (const b of below.get(k) ?? []) if (--indegree[b] === 0) ready.push(b)
  }
  return order.length === n ? order : Array.from({ length: n }, (_, i) => i)
}

// A dot wherever three or more wire arms meet: segment ends count once, a
// segment passing straight through a point counts twice.
function junctionsOf(segments: Segment[]): Point[] {
  const points = new Map<string, Point>()
  for (const s of segments) for (const p of [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]) points.set(`${p.x},${p.y}`, p)
  const out: Point[] = []
  for (const p of points.values()) {
    let degree = 0
    for (const s of segments) {
      if ((s.x1 === p.x && s.y1 === p.y) || (s.x2 === p.x && s.y2 === p.y)) degree += 1
      else if (onSegment(p, s)) degree += 2
    }
    if (degree >= 3) out.push(p)
  }
  return out.sort((p, q) => p.y - q.y || p.x - q.x)
}

export function onSegment(p: Point, s: Segment): boolean {
  return (
    p.x >= Math.min(s.x1, s.x2) && p.x <= Math.max(s.x1, s.x2) &&
    p.y >= Math.min(s.y1, s.y2) && p.y <= Math.max(s.y1, s.y2) &&
    (s.x1 === s.x2 ? p.x === s.x1 : p.y === s.y1)
  )
}

// A wire between two pins that face each other should run straight across, or
// step once when they are a little apart — not dive down to a channel and climb
// back. The channel router cannot see that, so the detour is undone afterwards,
// and only when the simpler path stays clear of every box and every other net.
function tidyWires(
  signals: ComponentGraph['signals'],
  boxes: Record<string, NodeBox>,
  wires: Record<string, Wire>,
  pinAt: (ref: string) => Pin,
): void {
  const spans = (s: Segment, t: Segment) => {
    const vertical = s.x1 === s.x2 && t.x1 === t.x2 && s.x1 === t.x1
    const horizontal = s.y1 === s.y2 && t.y1 === t.y2 && s.y1 === t.y1
    if (!vertical && !horizontal) return false
    const [p1, p2, q1, q2] = vertical
      ? [Math.min(s.y1, s.y2), Math.max(s.y1, s.y2), Math.min(t.y1, t.y2), Math.max(t.y1, t.y2)]
      : [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2), Math.min(t.x1, t.x2), Math.max(t.x1, t.x2)]
    return Math.min(p2, q2) - Math.max(p1, q1) > 0
  }
  const throughBox = (s: Segment) =>
    Object.values(boxes).some(b =>
      Math.min(s.x1, s.x2) < b.x + b.w - 1 && Math.max(s.x1, s.x2) > b.x + 1 &&
      Math.min(s.y1, s.y2) < b.y + b.h - 1 && Math.max(s.y1, s.y2) > b.y + 1)
  const overlapsAnother = (name: string, s: Segment) =>
    Object.entries(wires).some(([other, w]) => other !== name && w.segments.some(t => spans(s, t)))

  for (const [name, wire] of Object.entries(wires)) {
    const signal = signals[name]
    if (signal.sinks.length !== 1 || wire.segments.length < 2) continue
    const a = pinAt(signal.driver)
    const b = pinAt(signal.sinks[0])
    const sideways = (p: Pin) => p.side === 'left' || p.side === 'right'
    const facing = sideways(a) && sideways(b) &&
      (a.x < b.x ? a.side === 'right' && b.side === 'left' : b.side === 'right' && a.side === 'left')
    if (!facing || Math.abs(a.x - b.x) < 2 * PITCH) continue

    const step = (xm: number): Segment[] => [
      { x1: a.x, y1: a.y, x2: xm, y2: a.y },
      { x1: xm, y1: a.y, x2: xm, y2: b.y },
      { x1: xm, y1: b.y, x2: b.x, y2: b.y },
    ].filter(s => s.x1 !== s.x2 || s.y1 !== s.y2)
    const middle = Math.round((a.x + b.x) / 2)
    const tries = [middle, ...Array.from({ length: 12 }, (_, k) => [middle + (k + 1) * PITCH, middle - (k + 1) * PITCH]).flat()]
      .filter(xm => xm > Math.min(a.x, b.x) + 1 && xm < Math.max(a.x, b.x) - 1)
      .map(step)
    const better = tries.find(segs => segs.length < wire.segments.length && segs.every(s => !throughBox(s) && !overlapsAnother(name, s)))
    if (better) wires[name] = { segments: better, junctions: [] }
  }

  // A step of a few pixels between two long parallel runs reads as a wobble. Push
  // it to one end of the run, where it merges with the turn that is already there.
  for (const [name, wire] of Object.entries(wires)) {
    if (signals[name].sinks.length !== 1) continue
    let points = pathOf(wire.segments, pinAt(signals[name].driver))
    if (!points) continue
    for (let pass = 0; pass < 4; pass++) {
      const next = unwobble(points, segs => segs.every(s => !throughBox(s) && !overlapsAnother(name, s)))
      if (!next) break
      points = next
    }
    const segments = segmentsOf(points)
    if (segments.length < wire.segments.length) wires[name] = { segments, junctions: [] }
  }
}

const merged = (points: Point[]): Point[] => {
  const out = [points[0]]
  for (const p of points.slice(1)) {
    const last = out[out.length - 1]
    if (p.x === last.x && p.y === last.y) continue
    const before = out[out.length - 2]
    if (before && ((before.x === last.x && p.x === last.x) || (before.y === last.y && p.y === last.y))) out.pop()
    out.push(p)
  }
  return out
}

const segmentsOf = (points: Point[]): Segment[] =>
  points.slice(1).map((p, i) => ({ x1: points[i].x, y1: points[i].y, x2: p.x, y2: p.y }))

// The vertices of a wire that runs from one pin to one other, in order.
function pathOf(segments: Segment[], from: Pin): Point[] | undefined {
  const left = [...segments]
  const points: Point[] = [{ x: from.x, y: from.y }]
  while (left.length > 0) {
    const here = points[points.length - 1]
    const i = left.findIndex(s => (s.x1 === here.x && s.y1 === here.y) || (s.x2 === here.x && s.y2 === here.y))
    if (i < 0) return undefined // a fork or a gap: not a simple path
    const s = left.splice(i, 1)[0]
    points.push(s.x1 === here.x && s.y1 === here.y ? { x: s.x2, y: s.y2 } : { x: s.x1, y: s.y1 })
  }
  return merged(points)
}

// Moves the first short step it finds to either end of its run; undefined when
// none is left or neither way is clear.
function unwobble(points: Point[], clear: (segments: Segment[]) => boolean): Point[] | undefined {
  for (let i = 1; i + 2 < points.length; i++) {
    const [before, a, b, after] = points.slice(i - 1, i + 3)
    if (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) > PITCH) continue
    const vertical = before.x === a.x && b.x === after.x
    const horizontal = before.y === a.y && b.y === after.y
    if (!vertical && !horizontal) continue
    const early = vertical ? { x: b.x, y: before.y } : { x: before.x, y: b.y }
    const late = vertical ? { x: a.x, y: after.y } : { x: after.x, y: a.y }
    for (const corner of [late, early]) {
      const candidate = merged([...points.slice(0, i), corner, ...points.slice(i + 2)])
      if (candidate.length < merged(points).length && clear(segmentsOf(candidate))) return candidate
    }
  }
  return undefined
}
