import type { ComponentGraph, ComponentNode, HierarchyEntry, RtlNode, Signal, ViewFilter } from '@rtlgraph/ir'
import { FILTER_PRESETS, parseEndpoint, visibleElements } from '@rtlgraph/ir'
import { lookupSymbol } from '@rtlgraph/registry'
import {
  displayName, FRAME_TITLE_H, layoutComponent, layoutHierarchy, PORT_PIN, TITLE_H,
  type ChildPlacement, type LayoutResult, type NestedLayout, type NodeBox,
} from '@rtlgraph/layout'
import { sceneToSvg, type Group, type Item, type Scene } from './scene.ts'
import { FONT_FAMILY, FONT_SIZE, PALETTE } from './palette.ts'
import { renderScenePdf, type PdfResult } from './pdf.ts'

export type { Group, Item, Paint, Scene } from './scene.ts'
export type { PdfResult } from './pdf.ts'
export { sceneToSvg } from './scene.ts'
export { PALETTE, FONT_FAMILY, FONT_SIZE } from './palette.ts'
export { renderScenePdf } from './pdf.ts'

// IR -> picture as pure functions. The editor webview and every export format
// draw the same Scene, so there is one renderer (NodeGraph kept two and they
// drifted apart).


export interface RenderOptions {
  filter?: ViewFilter
  layout?: LayoutResult
  // Shrink the view box to what the filter leaves visible (default). The editor
  // turns this off so toggling a filter never shifts the picture.
  crop?: boolean
}

export interface HierarchyRenderOptions {
  filter?: ViewFilter
  crop?: boolean
  // Which component instances ("u_host", "u_host/u_dma") are drawn open. Default: none.
  isUnfolded?: (instance: string) => boolean
  // Draw the fold markers a reader can click. They belong to the editor, not to an
  // exported figure, so this is off by default.
  controls?: boolean
  // For a figure: when the root only wraps one open component, draw that component
  // itself. The frame around everything and the doubled port pills say nothing.
  unwrap?: boolean
  // Draw the frame around an open component — its panel, title and marker. The
  // editor needs it to show what is open; a figure is just the schematic.
  frames?: boolean
  // Draw the grips the reader drags while arranging by hand.
  editing?: boolean
  layout?: NestedLayout // must have been laid out with the same isUnfolded
}

const CROP_MARGIN = 24

function wireStyle(s: Signal): { color: string; width: number; dash?: string } {
  if (s.flow === 'data') return { color: PALETTE.data, width: s.width > 1 ? 2 : 1.25 }
  if (s.flow === 'reset') return { color: PALETTE.reset, width: 1.25, dash: '5 3' }
  if (s.flow === 'clock') return { color: PALETTE.clock, width: 1, dash: '2 2' }
  return { color: PALETTE.control, width: 1.25, dash: '5 3' }
}

// The fold marker in a component's title bar: a boxed "+" when folded, "−" when
// open. One click on it opens or closes that component, so it carries a class the
// editor can look for, and a transparent square around it to click at.
export const FOLD_MARKER_CLASS = 'fold'
export const RESIZE_GRIP_CLASS = 'resize'

function foldMarker(b: NodeBox, titleH: number, folded: boolean): Item[] {
  const [x, y] = [b.x + b.w - 18, b.y + (titleH - 10) / 2]
  const bars = [{ x1: x + 2, y1: y + 5, x2: x + 8, y2: y + 5 }]
  if (folded) bars.push({ x1: x + 5, y1: y + 2, x2: x + 5, y2: y + 8 })
  return [
    // No fill: the editor's stylesheet is what makes this square catch clicks,
    // and a renderer that does not know "transparent" would paint it black.
    { kind: 'rect', x: x - 5, y: y - 5, w: 20, h: 20, fill: 'none', className: FOLD_MARKER_CLASS },
    { kind: 'rect', x, y, w: 10, h: 10, fill: PALETTE.background, stroke: PALETTE.muted, className: FOLD_MARKER_CLASS },
    { kind: 'lines', segments: bars, fill: 'none', stroke: PALETTE.ink, strokeWidth: 1.25, className: FOLD_MARKER_CLASS },
  ]
}

// An open component: a frame whose body is drawn by the child's own level.
function frameItems(node: ComponentNode, b: NodeBox, controls: boolean, frames: boolean, editing = false): Item[] {
  if (!frames) return [] // the wires still cross where its edge was
  const grip: Item[] = editing
    ? [{
        kind: 'lines',
        segments: [
          { x1: b.x + b.w - 12, y1: b.y + b.h - 2, x2: b.x + b.w - 2, y2: b.y + b.h - 12 },
          { x1: b.x + b.w - 7, y1: b.y + b.h - 2, x2: b.x + b.w - 2, y2: b.y + b.h - 7 },
        ],
        fill: 'none', stroke: PALETTE.frameStroke, strokeWidth: 1.5, className: RESIZE_GRIP_CLASS,
      }, {
        kind: 'rect', x: b.x + b.w - 16, y: b.y + b.h - 16, w: 16, h: 16, fill: 'none', className: RESIZE_GRIP_CLASS,
      }]
    : []
  return [
    { kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: 4, fill: PALETTE.componentFill, stroke: PALETTE.frameStroke, strokeWidth: 1.5 },
    { kind: 'lines', segments: [{ x1: b.x, y1: b.y + FRAME_TITLE_H, x2: b.x + b.w, y2: b.y + FRAME_TITLE_H }], fill: 'none', stroke: PALETTE.frameStroke },
    { kind: 'text', x: b.x + 8, y: b.y + FRAME_TITLE_H / 2, text: node.label ?? node.name, anchor: 'start', central: true, bold: true, fill: PALETTE.ink },
    ...(controls ? foldMarker(b, FRAME_TITLE_H, false) : []),
    ...grip,
  ]
}

// The bubble a schematic puts on a pin that acts when it is low, drawn just
// outside the box so the wire runs into it.
function activeLowBubbles(node: RtlNode, b: NodeBox): Item[] {
  if (node.kind !== 'reg') return []
  const low = [
    ...(node.rstActive === 'low' ? ['RST'] : []),
    ...(node.enActive === 'low' ? ['EN'] : []),
  ]
  return low.flatMap((name): Item[] => {
    const pin = b.pins[name]
    if (!pin) return []
    const away = pin.side === 'left' ? -1 : pin.side === 'right' ? 1 : 0
    const down = pin.side === 'top' ? -1 : pin.side === 'bottom' ? 1 : 0
    return [{
      kind: 'circle',
      cx: pin.x + away * BUBBLE_R,
      cy: pin.y + down * BUBBLE_R,
      r: BUBBLE_R,
      fill: PALETTE.background,
      stroke: PALETTE.ink,
      strokeWidth: 1.25,
    }]
  })
}

const BUBBLE_R = 3.5

function nodeItems(id: string, node: RtlNode, b: NodeBox, controls = false): Item[] {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  if (node.kind === 'port') {
    return [
      { kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: 9, fill: PALETTE.background, stroke: PALETTE.muted },
      { kind: 'text', x: cx, y: cy, text: displayName(id), anchor: 'middle', central: true, size: 11, fill: PALETTE.ink },
    ]
  }
  const def = node.kind === 'control' || node.kind === 'component' ? undefined : lookupSymbol(node.module)
  if (def?.symbol === 'register') {
    return [
      { kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, fill: PALETTE.nodeFill, stroke: PALETTE.ink, strokeWidth: 2 },
      { kind: 'text', x: cx, y: cy, text: displayName(id), anchor: 'middle', central: true, fill: PALETTE.ink },
      ...activeLowBubbles(node, b),
    ]
  }
  if (def?.symbol === 'mux') {
    const inset = 10
    const items: Item[] = [{
      kind: 'polygon',
      points: [[b.x, b.y + b.h], [b.x + b.w, b.y + b.h], [b.x + b.w - inset, b.y], [b.x + inset, b.y]],
      fill: PALETTE.muxFill, stroke: PALETTE.ink, strokeWidth: 1.5,
    }]
    def.ports.filter(p => p.role === 'data' && p.dir === 'in').forEach((p, i) => {
      const pin = b.pins[p.name]
      if (pin) items.push({ kind: 'text', x: pin.x, y: b.y + b.h - 5, text: String(i), anchor: 'middle', size: 9, fill: PALETTE.muted })
    })
    return items
  }
  if (def) {
    return [
      { kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, fill: PALETTE.nodeFill, stroke: PALETTE.ink, strokeWidth: 1.5 },
      { kind: 'text', x: cx, y: cy, text: def.label ?? def.module, anchor: 'middle', central: true, fill: PALETTE.ink },
    ]
  }
  const control = node.kind === 'control'
  const component = node.kind === 'component'
  const items: Item[] = [
    {
      kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: 3,
      fill: control ? PALETTE.controlFill : component ? PALETTE.componentFill : PALETTE.nodeFill,
      stroke: control ? PALETTE.controlStroke : PALETTE.ink,
      strokeWidth: 1.5,
      ...(node.kind === 'blackbox' ? { dash: '6 3' } : {}),
    },
    { kind: 'text', x: cx, y: b.y + TITLE_H / 2, text: node.label ?? (component ? node.name : node.module), anchor: 'middle', central: true, bold: true, fill: PALETTE.ink },
    ...(component && controls ? foldMarker(b, TITLE_H, true) : []),
  ]
  for (const [name, pin] of Object.entries(b.pins)) {
    if (name === PORT_PIN) continue
    const left = pin.side === 'left'
    items.push({ kind: 'text', x: left ? pin.x + 5 : pin.x - 5, y: pin.y, text: name, anchor: left ? 'start' : 'end', central: true, size: 10, fill: PALETTE.muted })
  }
  return items
}

function translate(item: Item, dx: number, dy: number): Item {
  if (dx === 0 && dy === 0) return item
  switch (item.kind) {
    case 'rect':
    case 'text':
      return { ...item, x: item.x + dx, y: item.y + dy }
    case 'circle':
      return { ...item, cx: item.cx + dx, cy: item.cy + dy }
    case 'polygon':
      return { ...item, points: item.points.map(([x, y]): [number, number] => [x + dx, y + dy]) }
    case 'lines':
      return { ...item, segments: item.segments.map(s => ({ x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy })) }
  }
}

// What the filter passed over keeps its own colours — data black, control blue,
// reset red — and fades, so it reads as background without losing what it is.
export const DIM_OPACITY = 0.18

interface Canvas {
  filter: ViewFilter
  controls: boolean
  frames: boolean
  editing: boolean
  groups: Group[]
  xs: number[] // extent of what is visible, for cropping
  ys: number[]
}

// Draws one schematic at (dx, dy), then every open child inside its frame. Ids of
// a child's elements are prefixed with its instance path: "u_host/CNT_FF".
function drawLevel(
  canvas: Canvas,
  graph: ComponentGraph,
  layout: LayoutResult,
  children: Record<string, ChildPlacement>,
  entries: Record<string, HierarchyEntry>,
  dx: number,
  dy: number,
  prefix: string,
) {
  const { groups, xs, ys } = canvas
  const visible = visibleElements(graph, canvas.filter)
  const place = (items: Item[]) => items.map(item => translate(item, dx, dy))

  for (const id of visible.nodes) {
    const b = layout.nodes[id]
    if (b) xs.push(b.x + dx, b.x + b.w + dx), ys.push(b.y + dy, b.y + b.h + dy)
  }
  for (const name of visible.signals) {
    for (const s of layout.wires[name]?.segments ?? []) xs.push(s.x1 + dx, s.x2 + dx), ys.push(s.y1 + dy, s.y2 + dy)
  }

  // Within one level the dim parts go under the picked ones. Not globally: a
  // frame is painted, and a frame drawn later would cover its children.
  const levelDim: Group[] = []
  const levelLit: Group[] = []
  const add = (lit: boolean, group: Group) =>
    lit ? levelLit.push(group) : levelDim.push({ ...group, className: `${group.className} dim`, opacity: DIM_OPACITY })

  for (const [name, wire] of Object.entries(layout.wires)) {
    if (!visible.signals.has(name)) continue
    const s = graph.signals[name]
    const style = wireStyle(s)
    const items: Item[] = [
      { kind: 'lines', segments: wire.segments, fill: 'none', stroke: style.color, strokeWidth: style.width, ...(style.dash ? { dash: style.dash } : {}) },
      ...wire.junctions.map((p): Item => ({ kind: 'circle', cx: p.x, cy: p.y, r: 3, fill: style.color })),
    ]
    if (s.width > 1) {
      const { node, port } = parseEndpoint(s.driver)
      const pin = layout.nodes[node]?.pins[port ?? PORT_PIN]
      if (pin) items.push({ kind: 'text', x: pin.x + 4, y: pin.side === 'top' ? pin.y - 4 : pin.y + 12, text: String(s.width), size: 9, fill: PALETTE.muted })
    }
    add(visible.litSignals.has(name), { className: `wire ${s.flow}`, attribute: { name: 'data-signal', value: prefix + name }, items: place(items) })
  }
  for (const [id, b] of Object.entries(layout.nodes)) {
    if (!visible.nodes.has(id)) continue
    const node = graph.nodes[id]
    const open = node.kind === 'component' && id in children
    const className = node.kind !== 'component' ? `node ${node.kind}` : `node component ${open ? 'unfolded' : 'folded'}`
    const items = open
      ? frameItems(node as ComponentNode, b, canvas.controls, canvas.frames, canvas.editing)
      : nodeItems(id, node, b, canvas.controls)
    // A frame is the room its children sit in, never dim.
    add(open || visible.litNodes.has(id), { className, attribute: { name: 'data-node-id', value: prefix + id }, items: place(items) })
  }

  groups.push(...levelDim, ...levelLit)

  for (const [id, child] of Object.entries(children)) {
    const entry = entries[id]
    if (!entry) continue
    const childPrefix = `${prefix}${id}/`
    const childVisible = visibleElements(entry.graph, canvas.filter)
    for (const [port, segment] of Object.entries(child.connectors)) {
      const ref = `@${port}`
      const name = Object.keys(entry.graph.signals).find(n => {
        const s = entry.graph.signals[n]
        return s.driver === ref || s.sinks.includes(ref)
      })
      if (name === undefined || !childVisible.signals.has(name)) continue
      const style = wireStyle(entry.graph.signals[name])
      const line: Item = { kind: 'lines', segments: [segment], fill: 'none', stroke: style.color, strokeWidth: style.width, ...(style.dash ? { dash: style.dash } : {}) }
      const group: Group = {
        className: `wire connector ${entry.graph.signals[name].flow}`,
        attribute: { name: 'data-signal', value: childPrefix + name },
        items: place([line]),
      }
      groups.push(childVisible.litSignals.has(name)
        ? group
        : { ...group, className: `${group.className} dim`, opacity: DIM_OPACITY })
    }
    drawLevel(canvas, entry.graph, child.layout, child.layout.children, entry.children, dx + child.x, dy + child.y, childPrefix)
  }
}

function sceneOf(canvas: Canvas, width: number, height: number, crop: boolean): Scene {
  let view = { x: 0, y: 0, w: width, h: height }
  if (canvas.xs.length > 0) {
    const [minX, minY] = [Math.min(...canvas.xs) - CROP_MARGIN, Math.min(...canvas.ys) - CROP_MARGIN]
    const [maxX, maxY] = [Math.max(...canvas.xs) + CROP_MARGIN, Math.max(...canvas.ys) + CROP_MARGIN]
    // Cropping shrinks the page to what is drawn. Not cropping keeps the page the
    // layout planned — so switching the filter never moves anything — but it still
    // grows to hold what sticks out of it: a wire dragged up out of the box would
    // otherwise be cut off by the view box, which is what the reader saw.
    const [x0, y0] = crop ? [minX, minY] : [Math.min(0, minX), Math.min(0, minY)]
    const [x1, y1] = crop ? [maxX, maxY] : [Math.max(width, maxX), Math.max(height, maxY)]
    view = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }
  return { view, background: PALETTE.background, fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, groups: canvas.groups }
}

export function buildScene(graph: ComponentGraph, options: RenderOptions = {}): Scene {
  const layout = options.layout ?? layoutComponent(graph)
  const canvas: Canvas = { filter: options.filter ?? FILTER_PRESETS.all, controls: false, frames: true, editing: false, groups: [], xs: [], ys: [] }
  drawLevel(canvas, graph, layout, {}, {}, 0, 0, '')
  return sceneOf(canvas, layout.width, layout.height, options.crop ?? true)
}

// A loaded hierarchy, with the open components drawn as frames around their schematics.
export function buildHierarchyScene(root: HierarchyEntry, options: HierarchyRenderOptions = {}): Scene {
  const isUnfolded = options.isUnfolded ?? (() => false)
  const inner = options.unwrap ? wrappedComponent(root, isUnfolded) : undefined
  const entry = inner ?? root
  // A passed layout belongs to the root that was asked for, not to the one inside it.
  // The unwrapped component keeps the arrangement it has inside its frame — ports on
  // the boundary — so the figure is what the editor shows, minus the frame.
  const layout = (inner ? undefined : options.layout) ?? layoutHierarchy(entry, isUnfolded, inner !== undefined)
  const canvas: Canvas = {
    filter: options.filter ?? FILTER_PRESETS.all,
    controls: options.controls === true,
    frames: options.frames !== false,
    editing: options.editing === true,
    groups: [], xs: [], ys: [],
  }
  drawLevel(canvas, entry.graph, layout, layout.children, entry.children, 0, 0, '')
  return sceneOf(canvas, layout.width, layout.height, options.crop ?? true)
}

// The one component an otherwise empty root wraps: ports, one box, and nets that
// only carry a port to it. Undefined when the root says anything of its own.
function wrappedComponent(root: HierarchyEntry, isUnfolded: (instance: string) => boolean): HierarchyEntry | undefined {
  if (root.graph.kind !== 'system') return undefined
  const boxes = Object.entries(root.graph.nodes).filter(([, n]) => n.kind === 'component')
  if (boxes.length !== 1) return undefined
  const [id] = boxes[0]
  const child = root.children[id]
  if (!child || !isUnfolded(child.instance)) return undefined
  const wiringOnly = Object.values(root.graph.signals)
    .every(s => [s.driver, ...s.sinks].every(ref => ref.startsWith('@') || parseEndpoint(ref).node === id))
  return wiringOnly ? child : undefined
}

export function renderSvg(graph: ComponentGraph, options: RenderOptions = {}): string {
  return sceneToSvg(buildScene(graph, options))
}

export function renderPdf(graph: ComponentGraph, options: RenderOptions = {}): PdfResult {
  return renderScenePdf(buildScene(graph, options))
}

export function renderHierarchySvg(root: HierarchyEntry, options: HierarchyRenderOptions = {}): string {
  return sceneToSvg(buildHierarchyScene(root, options))
}

export function renderHierarchyPdf(root: HierarchyEntry, options: HierarchyRenderOptions = {}): PdfResult {
  return renderScenePdf(buildHierarchyScene(root, options))
}

// State machines draw from the same Scene; see fsm.ts.
export * from './fsm.ts'
