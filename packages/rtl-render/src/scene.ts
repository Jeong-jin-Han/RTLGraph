import type { Segment } from '@rtlgraph/layout'

// A format-independent picture: what renderSvg and renderPdf both draw. Keeping
// the drawing decisions in one place is what stops the SVG and PDF (and later the
// HTML export) from drifting apart.

export interface Paint {
  fill?: string
  stroke?: string
  strokeWidth?: number
  dash?: string // SVG dasharray syntax, e.g. "5 3"
}

export type Item =
  | ({ kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number } & Paint)
  | ({ kind: 'polygon'; points: [number, number][] } & Paint)
  | ({ kind: 'lines'; segments: Segment[] } & Paint)
  | ({ kind: 'circle'; cx: number; cy: number; r: number } & Paint)
  | {
      kind: 'text'
      x: number
      y: number
      text: string
      size?: number // default: the scene font size
      anchor?: 'start' | 'middle' | 'end' // default: start
      central?: boolean // vertically centred on y instead of sitting on it
      bold?: boolean
      fill: string
    }

export interface Group {
  className: string
  attribute: { name: 'data-signal' | 'data-node-id'; value: string }
  items: Item[]
}

export interface Scene {
  view: { x: number; y: number; w: number; h: number }
  background: string
  fontFamily: string
  fontSize: number
  groups: Group[] // wires first, then nodes, in drawing order
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function itemToSvg(item: Item): string {
  const paint = (p: Paint) =>
    `${p.fill !== undefined ? ` fill="${p.fill}"` : ''}${p.stroke !== undefined ? ` stroke="${p.stroke}"` : ''}` +
    `${p.strokeWidth !== undefined ? ` stroke-width="${p.strokeWidth}"` : ''}${p.dash !== undefined ? ` stroke-dasharray="${p.dash}"` : ''}`
  switch (item.kind) {
    case 'rect':
      return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}"${item.rx !== undefined ? ` rx="${item.rx}"` : ''}${paint(item)}/>`
    case 'polygon':
      return `<polygon points="${item.points.map(([x, y]) => `${x},${y}`).join(' ')}"${paint(item)}/>`
    case 'lines':
      return `<path d="${item.segments.map(s => `M${s.x1} ${s.y1}L${s.x2} ${s.y2}`).join('')}"${paint(item)}/>`
    case 'circle':
      return `<circle cx="${item.cx}" cy="${item.cy}" r="${item.r}"${paint(item)}/>`
    case 'text': {
      const attrs = [
        item.anchor !== undefined ? `text-anchor="${item.anchor}"` : '',
        item.central ? 'dominant-baseline="central"' : '',
        item.size !== undefined ? `font-size="${item.size}"` : '',
        item.bold ? 'font-weight="600"' : '',
        `fill="${item.fill}"`,
      ].filter(Boolean).join(' ')
      return `<text x="${item.x}" y="${item.y}" ${attrs}>${esc(item.text)}</text>`
    }
  }
}

export function sceneToSvg(scene: Scene): string {
  const { x, y, w, h } = scene.view
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}" font-family="${scene.fontFamily}" font-size="${scene.fontSize}">`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${scene.background}"/>`,
  ]
  for (const g of scene.groups) {
    lines.push(`<g class="${g.className}" ${g.attribute.name}="${esc(g.attribute.value)}">${g.items.map(itemToSvg).join('')}</g>`)
  }
  lines.push('</svg>', '')
  return lines.join('\n')
}
