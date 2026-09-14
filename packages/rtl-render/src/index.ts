import type { ComponentGraph, RtlNode, Signal, ViewFilter } from '@rtlgraph/ir'
import { FILTER_PRESETS, parseEndpoint, visibleElements } from '@rtlgraph/ir'
import { lookupSymbol } from '@rtlgraph/registry'
import { displayName, layoutComponent, PORT_PIN, TITLE_H, type LayoutResult, type NodeBox } from '@rtlgraph/layout'
import { sceneToSvg, type Group, type Item, type Scene } from './scene.ts'
import { renderScenePdf, type PdfResult } from './pdf.ts'

export type { Group, Item, Paint, Scene } from './scene.ts'
export type { PdfResult } from './pdf.ts'
export { sceneToSvg } from './scene.ts'
export { renderScenePdf } from './pdf.ts'

// IR -> picture as pure functions. The editor webview and every export format
// draw the same Scene, so there is one renderer (NodeGraph kept two and they
// drifted apart).

// Fixed palette: colours carry meaning (data / control / reset), so they must
// not follow the VS Code theme.
export const PALETTE = {
  background: '#ffffff',
  ink: '#111827',
  muted: '#6b7280',
  nodeFill: '#ffffff',
  muxFill: '#f3f4f6',
  controlFill: '#eef2ff',
  controlStroke: '#4f46e5',
  data: '#111827',
  control: '#2563eb',
  reset: '#dc2626',
  clock: '#9ca3af',
} as const

export interface RenderOptions {
  filter?: ViewFilter
  layout?: LayoutResult
  // Shrink the view box to what the filter leaves visible (default). The editor
  // turns this off so toggling a filter never shifts the picture.
  crop?: boolean
}

const CROP_MARGIN = 24
const FONT_FAMILY = 'Arial, Helvetica, sans-serif'
const FONT_SIZE = 12

function wireStyle(s: Signal): { color: string; width: number; dash?: string } {
  if (s.flow === 'data') return { color: PALETTE.data, width: s.width > 1 ? 2 : 1.25 }
  if (s.flow === 'reset') return { color: PALETTE.reset, width: 1.25, dash: '5 3' }
  if (s.flow === 'clock') return { color: PALETTE.clock, width: 1, dash: '2 2' }
  return { color: PALETTE.control, width: 1.25, dash: '5 3' }
}

function nodeItems(id: string, node: RtlNode, b: NodeBox): Item[] {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  if (node.kind === 'port') {
    return [
      { kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: 9, fill: PALETTE.background, stroke: PALETTE.muted },
      { kind: 'text', x: cx, y: cy, text: displayName(id), anchor: 'middle', central: true, size: 11, fill: PALETTE.ink },
    ]
  }
  const def = node.kind === 'control' ? undefined : lookupSymbol(node.module)
  if (def?.symbol === 'register') {
    return [
      { kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, fill: PALETTE.nodeFill, stroke: PALETTE.ink, strokeWidth: 2 },
      { kind: 'text', x: cx, y: cy, text: displayName(id), anchor: 'middle', central: true, fill: PALETTE.ink },
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
  const items: Item[] = [
    {
      kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: 3,
      fill: control ? PALETTE.controlFill : PALETTE.nodeFill,
      stroke: control ? PALETTE.controlStroke : PALETTE.ink,
      strokeWidth: 1.5,
      ...(node.kind === 'blackbox' ? { dash: '6 3' } : {}),
    },
    { kind: 'text', x: cx, y: b.y + TITLE_H / 2, text: node.label ?? node.module, anchor: 'middle', central: true, bold: true, fill: PALETTE.ink },
  ]
  for (const [name, pin] of Object.entries(b.pins)) {
    if (name === PORT_PIN) continue
    const left = pin.side === 'left'
    items.push({ kind: 'text', x: left ? pin.x + 5 : pin.x - 5, y: pin.y, text: name, anchor: left ? 'start' : 'end', central: true, size: 10, fill: PALETTE.muted })
  }
  return items
}

export function buildScene(graph: ComponentGraph, options: RenderOptions = {}): Scene {
  const layout = options.layout ?? layoutComponent(graph)
  const visible = visibleElements(graph, options.filter ?? FILTER_PRESETS.all)

  let view = { x: 0, y: 0, w: layout.width, h: layout.height }
  if (options.crop ?? true) {
    const xs: number[] = []
    const ys: number[] = []
    for (const id of visible.nodes) {
      const b = layout.nodes[id]
      if (b) xs.push(b.x, b.x + b.w), ys.push(b.y, b.y + b.h)
    }
    for (const name of visible.signals) {
      for (const s of layout.wires[name]?.segments ?? []) xs.push(s.x1, s.x2), ys.push(s.y1, s.y2)
    }
    if (xs.length > 0) {
      const [x0, y0] = [Math.min(...xs) - CROP_MARGIN, Math.min(...ys) - CROP_MARGIN]
      view = { x: x0, y: y0, w: Math.max(...xs) + CROP_MARGIN - x0, h: Math.max(...ys) + CROP_MARGIN - y0 }
    }
  }

  const groups: Group[] = []
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
    groups.push({ className: `wire ${s.flow}`, attribute: { name: 'data-signal', value: name }, items })
  }
  for (const [id, b] of Object.entries(layout.nodes)) {
    if (!visible.nodes.has(id)) continue
    groups.push({ className: `node ${graph.nodes[id].kind}`, attribute: { name: 'data-node-id', value: id }, items: nodeItems(id, graph.nodes[id], b) })
  }

  return { view, background: PALETTE.background, fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, groups }
}

export function renderSvg(graph: ComponentGraph, options: RenderOptions = {}): string {
  return sceneToSvg(buildScene(graph, options))
}

export function renderPdf(graph: ComponentGraph, options: RenderOptions = {}): PdfResult {
  return renderScenePdf(buildScene(graph, options))
}
