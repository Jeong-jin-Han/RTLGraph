import type { ComponentGraph, PortNode, RtlNode } from '@rtlgraph/ir'
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

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

type Interval = [number, number]

interface Shape {
  w: number
  h: number
  titled: boolean // generic boxes list their pins under a title
  sides: Map<string, Side> // pin -> side, in drawing order
}

export const displayName = (id: string): string => id.replace(/^@/, '').split('.').pop()!
const textWidth = (s: string) => s.length * CHAR_W

function shapeOf(id: string, node: RtlNode, portSide: Side): Shape {
  if (node.kind === 'port') {
    return { w: Math.max(28, textWidth(displayName(id)) + 14), h: 18, titled: false, sides: new Map([[PORT_PIN, portSide]]) }
  }
  const sides = new Map<string, Side>()
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
    w: Math.max(110, textWidth(node.module) + 24, longest * 2 + 30),
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
        const py = shape.titled ? y + TITLE_H + k * PIN_STEP + PIN_STEP / 2 : y + Math.round((shape.h * (k + 1)) / (n + 1))
        pins[name] = { side, x: side === 'left' ? x : x + shape.w, y: py }
      }
    })
  }
  return pins
}

export function layoutComponent(graph: ComponentGraph): LayoutResult {
  const { nodes, signals } = graph
  const ids = Object.keys(nodes)
  const signalNames = Object.keys(signals)
  const signalIndex = new Map(signalNames.map((name, i) => [name, i]))

  const netAt = new Map<string, string>() // endpoint ref -> signal
  for (const [name, s] of Object.entries(signals)) for (const ref of [s.driver, ...s.sinks]) netAt.set(ref, name)
  const refOf = (id: string, pin: string) => (pin === PORT_PIN ? id : `${id}:${pin}`)
  const nodeOf = (ref: string) => parseEndpoint(ref).node
  const pinOf = (ref: string) => parseEndpoint(ref).port ?? PORT_PIN
  const routedNet = (name: string) => !signals[name].hidden

  // ── shapes of instances, then port nodes facing the pin they connect to ──
  const shapes = new Map<string, Shape>()
  for (const id of ids) if (nodes[id].kind !== 'port') shapes.set(id, shapeOf(id, nodes[id], 'left'))
  const sideAt = (ref: string) => shapes.get(nodeOf(ref))?.sides.get(pinOf(ref))

  const portNets = new Map<string, string[]>()
  for (const name of signalNames) {
    if (!routedNet(name)) continue
    for (const ref of [signals[name].driver, ...signals[name].sinks]) {
      if (nodes[nodeOf(ref)].kind === 'port') portNets.set(nodeOf(ref), [...(portNets.get(nodeOf(ref)) ?? []), name])
    }
  }

  // A port wired to exactly one pin that faces it is drawn as a straight stub
  // right next to that pin instead of being routed through channels.
  const directPort = new Map<string, string>() // port id -> the instance ref it hugs
  for (const [id, nets] of portNets) {
    const port = nodes[id] as PortNode
    const s = signals[nets[0]]
    let side: Side
    if (port.dir === 'out') {
      const ds = nodes[nodeOf(s.driver)].kind === 'port' ? undefined : sideAt(s.driver)
      side = ds ? OPPOSITE[ds] : 'left'
      if (nets.length === 1 && (ds === 'bottom' || ds === 'right')) directPort.set(id, s.driver)
    } else {
      const sink = s.sinks.find(ref => nodes[nodeOf(ref)].kind !== 'port')
      const ss = sink && sideAt(sink)
      side = ss ? OPPOSITE[ss] : 'right'
      if (nets.length === 1 && s.sinks.length === 1 && ss === 'left') directPort.set(id, sink!)
    }
    shapes.set(id, shapeOf(id, port, side))
  }
  const directNets = new Set<string>()
  for (const id of directPort.keys()) directNets.add(portNets.get(id)![0])
  const channelNet = (name: string) => routedNet(name) && !directNets.has(name)

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
  for (const id of portNets.keys()) {
    const port = nodes[id] as PortNode
    const hug = directPort.get(id)
    const s = signals[portNets.get(id)![0]]
    if (hug !== undefined) row.set(id, sideAt(hug) === 'bottom' ? depth + 1 : row.get(nodeOf(hug))!)
    else if (port.dir === 'out') row.set(id, depth + 1)
    else {
      const sink = s.sinks.find(ref => nodes[nodeOf(ref)].kind !== 'port')
      row.set(id, sink ? row.get(nodeOf(sink))! : 0)
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
  const leftSpace = (id: string) => PITCH * dropPins(id, 'left').length + Math.max(0, ...huggers(id, 'left').map(w => w + PORT_GAP))
  const rightSpace = (id: string) => PITCH * dropPins(id, 'right').length + Math.max(0, ...huggers(id, 'right').map(w => w + PORT_GAP))

  // ── x: order and place each row, pulling nodes over their data neighbours ──
  const packed = ids.filter(id => row.has(id) && !directPort.has(id))
  const fixed = (id: string) => nodes[id].kind === 'control' || nodes[id].kind === 'port'
  const rows: string[][] = Array.from({ length: rowCount }, () => [])
  for (const id of packed.filter(fixed)) rows[row.get(id)!].push(id)
  for (const id of packed.filter(id => !fixed(id))) rows[row.get(id)!].push(id)

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
      const head = rows[r].filter(fixed)
      const tail = rows[r].filter(id => !fixed(id))
        .map((id, i) => ({ id, key: barycenter(id), i }))
        .sort((a, b) => a.key - b.key || a.i - b.i)
        .map(e => e.id)
      rows[r] = [...head, ...tail]
      relax(rows[r], id => (fixed(id) ? -Infinity : barycenter(id) - W(id) / 2))
    }
  }

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
  const nearerBelow = (id: string, pin: string) => {
    const shape = shapes.get(id)!
    const rowH = Math.max(20, ...rows[row.get(id)!].map(member => shapes.get(member)!.h))
    const pinY = rowH - shape.h + pinsOf(0, 0, shape)[pin].y
    return rowH - pinY < pinY
  }
  const dropsDown = (id: string, side: 'left' | 'right') => {
    let vote = 0
    for (const pin of dropPins(id, side)) {
      const ref = refOf(id, pin)
      const net = signals[netAt.get(ref)!]
      const others = [net.driver, ...net.sinks].filter(other => other !== ref)
      const mean = others.reduce((sum, other) => sum + verticalRank(other), 0) / others.length
      const r = row.get(id)!
      vote += mean > r ? 1 : mean < r ? -1 : nearerBelow(id, pin) ? 1 : -1
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
    const pins = dropPins(id, side)
    const down = dropsDown(id, side)
    // The pin nearest the escape direction gets the drop closest to the box, so drops never cross stubs.
    const offset = PITCH * (down ? pins.length - pins.indexOf(pin) : pins.indexOf(pin) + 1)
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
    Math.max(20, ...members.map(id => shapes.get(id)!.h), ...[...directPort.keys()].filter(id => row.get(id) === r && sideAt(directPort.get(id)!) === 'bottom').map(id => shapes.get(id)!.h)))
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
  for (const id of packed) place(id, rowTop[row.get(id)!] + rowH[row.get(id)!] - shapes.get(id)!.h)
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
    const plan = plans.get(name)
    if (!plan) {
      const s = signals[name]
      const a = pinAt(s.driver)
      const b = pinAt(s.sinks[0])
      seg(a.x, a.y, b.x, b.y)
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
