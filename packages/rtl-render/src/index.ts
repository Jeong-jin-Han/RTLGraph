import type { ComponentGraph, RtlNode, Signal, ViewFilter } from '@rtlgraph/ir'
import { FILTER_PRESETS, parseEndpoint, visibleElements } from '@rtlgraph/ir'
import { lookupSymbol } from '@rtlgraph/registry'
import { displayName, layoutComponent, PORT_PIN, TITLE_H, type LayoutResult, type NodeBox } from '@rtlgraph/layout'

// IR -> SVG as a pure function. The editor webview and the HTML export both use
// this, so there is one renderer (NodeGraph kept two and they drifted apart).

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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function wireStyle(s: Signal): { color: string; width: number; dash?: string } {
  if (s.flow === 'data') return { color: PALETTE.data, width: s.width > 1 ? 2 : 1.25 }
  if (s.flow === 'reset') return { color: PALETTE.reset, width: 1.25, dash: '5 3' }
  if (s.flow === 'clock') return { color: PALETTE.clock, width: 1, dash: '2 2' }
  return { color: PALETTE.control, width: 1.25, dash: '5 3' }
}

function text(x: number, y: number, body: string, attrs = ''): string {
  return `<text x="${x}" y="${y}"${attrs ? ' ' + attrs : ''}>${esc(body)}</text>`
}

function drawNode(id: string, node: RtlNode, b: NodeBox): string {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const middle = 'text-anchor="middle" dominant-baseline="central"'
  const parts: string[] = []
  if (node.kind === 'port') {
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="9" fill="${PALETTE.background}" stroke="${PALETTE.muted}"/>`)
    parts.push(text(cx, cy, displayName(id), `${middle} font-size="11" fill="${PALETTE.ink}"`))
    return parts.join('')
  }
  const def = node.kind === 'control' ? undefined : lookupSymbol(node.module)
  if (def?.symbol === 'register') {
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${PALETTE.nodeFill}" stroke="${PALETTE.ink}" stroke-width="2"/>`)
    parts.push(text(cx, cy, displayName(id), `${middle} fill="${PALETTE.ink}"`))
  } else if (def?.symbol === 'mux') {
    const inset = 10
    parts.push(`<polygon points="${b.x},${b.y + b.h} ${b.x + b.w},${b.y + b.h} ${b.x + b.w - inset},${b.y} ${b.x + inset},${b.y}" fill="${PALETTE.muxFill}" stroke="${PALETTE.ink}" stroke-width="1.5"/>`)
    def.ports.filter(p => p.role === 'data' && p.dir === 'in').forEach((p, i) => {
      const pin = b.pins[p.name]
      if (pin) parts.push(text(pin.x, b.y + b.h - 5, String(i), `text-anchor="middle" font-size="9" fill="${PALETTE.muted}"`))
    })
  } else if (def) {
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${PALETTE.nodeFill}" stroke="${PALETTE.ink}" stroke-width="1.5"/>`)
    parts.push(text(cx, cy, def.label ?? def.module, `${middle} fill="${PALETTE.ink}"`))
  } else {
    const control = node.kind === 'control'
    const dash = node.kind === 'blackbox' ? ' stroke-dasharray="6 3"' : ''
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3" fill="${control ? PALETTE.controlFill : PALETTE.nodeFill}" stroke="${control ? PALETTE.controlStroke : PALETTE.ink}" stroke-width="1.5"${dash}/>`)
    parts.push(text(cx, b.y + TITLE_H / 2, node.label ?? node.module, `${middle} font-weight="600" fill="${PALETTE.ink}"`))
    for (const [name, pin] of Object.entries(b.pins)) {
      if (name === PORT_PIN) continue
      const left = pin.side === 'left'
      parts.push(text(left ? pin.x + 5 : pin.x - 5, pin.y, name, `text-anchor="${left ? 'start' : 'end'}" dominant-baseline="central" font-size="10" fill="${PALETTE.muted}"`))
    }
  }
  return parts.join('')
}

export function renderSvg(graph: ComponentGraph, options: RenderOptions = {}): string {
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

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" width="${view.w}" height="${view.h}" font-family="Arial, Helvetica, sans-serif" font-size="12">`,
    `<rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" fill="${PALETTE.background}"/>`,
  ]

  for (const [name, wire] of Object.entries(layout.wires)) {
    if (!visible.signals.has(name)) continue
    const s = graph.signals[name]
    const style = wireStyle(s)
    const d = wire.segments.map(g => `M${g.x1} ${g.y1}L${g.x2} ${g.y2}`).join('')
    const dash = style.dash ? ` stroke-dasharray="${style.dash}"` : ''
    const dots = wire.junctions.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${style.color}"/>`).join('')
    let label = ''
    if (s.width > 1) {
      const { node, port } = parseEndpoint(s.driver)
      const pin = layout.nodes[node]?.pins[port ?? PORT_PIN]
      if (pin) label = text(pin.x + 4, pin.side === 'top' ? pin.y - 4 : pin.y + 12, String(s.width), `font-size="9" fill="${PALETTE.muted}"`)
    }
    lines.push(`<g class="wire ${s.flow}" data-signal="${esc(name)}"><path d="${d}" fill="none" stroke="${style.color}" stroke-width="${style.width}"${dash}/>${dots}${label}</g>`)
  }

  for (const [id, b] of Object.entries(layout.nodes)) {
    if (!visible.nodes.has(id)) continue
    lines.push(`<g class="node ${graph.nodes[id].kind}" data-node-id="${esc(id)}">${drawNode(id, graph.nodes[id], b)}</g>`)
  }

  lines.push('</svg>', '')
  return lines.join('\n')
}
