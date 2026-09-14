import type { Item, Scene } from './scene.ts'

// A vector PDF of a Scene, written by hand: one page, the two built-in Helvetica
// fonts (no embedding), no dependencies. One CSS pixel becomes one PDF point.

export interface PdfResult {
  bytes: Uint8Array
  // Characters outside WinAnsi (e.g. Hangul in a label) that the built-in fonts
  // cannot draw; they are replaced by "?".
  unsupportedText: string[]
}

// Advance widths (1/1000 em) for U+0020..U+007E from the standard Helvetica AFMs.
// prettier-ignore
const HELVETICA = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584]
// prettier-ignore
const HELVETICA_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]

const KAPPA = 0.5523 // Bézier handle length for a quarter circle

const num = (n: number) => {
  const s = n.toFixed(2).replace(/\.?0+$/, '')
  return s === '-0' ? '0' : s
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number]
}

function textWidth(text: string, size: number, bold: boolean): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA
  let units = 0
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    units += code >= 32 && code <= 126 ? table[code - 32] : 556
  }
  return (units / 1000) * size
}

export function renderScenePdf(scene: Scene): PdfResult {
  const { x: vx, y: vy, w: W, h: H } = scene.view
  const X = (x: number) => num(x - vx)
  const Y = (y: number) => num(vy + H - y) // PDF's origin is bottom-left
  const unsupported = new Set<string>()
  const ops: string[] = []

  const paint = (item: { fill?: string; stroke?: string; strokeWidth?: number; dash?: string }) => {
    const fill = item.fill !== undefined && item.fill !== 'none'
    const stroke = item.stroke !== undefined && item.stroke !== 'none'
    if (fill) ops.push(`${rgb(item.fill!).map(num).join(' ')} rg`)
    if (stroke) {
      ops.push(`${rgb(item.stroke!).map(num).join(' ')} RG`, `${num(item.strokeWidth ?? 1)} w`)
      ops.push(item.dash ? `[${item.dash.trim().split(/[\s,]+/).map(Number).map(num).join(' ')}] 0 d` : '[] 0 d')
    }
    return fill && stroke ? 'B' : fill ? 'f' : stroke ? 'S' : 'n'
  }

  const roundedRect = (x: number, y: number, w: number, h: number, r: number) => {
    r = Math.min(r, w / 2, h / 2)
    const k = r * KAPPA
    // Built in SVG coordinates, converted point by point.
    const pts: string[] = [
      `${X(x + r)} ${Y(y)} m`,
      `${X(x + w - r)} ${Y(y)} l`,
      `${X(x + w - r + k)} ${Y(y)} ${X(x + w)} ${Y(y + r - k)} ${X(x + w)} ${Y(y + r)} c`,
      `${X(x + w)} ${Y(y + h - r)} l`,
      `${X(x + w)} ${Y(y + h - r + k)} ${X(x + w - r + k)} ${Y(y + h)} ${X(x + w - r)} ${Y(y + h)} c`,
      `${X(x + r)} ${Y(y + h)} l`,
      `${X(x + r - k)} ${Y(y + h)} ${X(x)} ${Y(y + h - r + k)} ${X(x)} ${Y(y + h - r)} c`,
      `${X(x)} ${Y(y + r)} l`,
      `${X(x)} ${Y(y + r - k)} ${X(x + r - k)} ${Y(y)} ${X(x + r)} ${Y(y)} c`,
      'h',
    ]
    ops.push(...pts)
  }

  const draw = (item: Item) => {
    ops.push('q')
    switch (item.kind) {
      case 'rect': {
        const op = paint(item)
        if (item.rx) roundedRect(item.x, item.y, item.w, item.h, item.rx)
        else ops.push(`${X(item.x)} ${Y(item.y + item.h)} ${num(item.w)} ${num(item.h)} re`)
        ops.push(op)
        break
      }
      case 'polygon': {
        const op = paint(item)
        item.points.forEach(([x, y], i) => ops.push(`${X(x)} ${Y(y)} ${i === 0 ? 'm' : 'l'}`))
        ops.push('h', op)
        break
      }
      case 'lines': {
        const op = paint({ ...item, fill: undefined })
        for (const s of item.segments) ops.push(`${X(s.x1)} ${Y(s.y1)} m`, `${X(s.x2)} ${Y(s.y2)} l`)
        ops.push(op)
        break
      }
      case 'circle': {
        const op = paint(item)
        const { cx, cy, r } = item
        const k = r * KAPPA
        ops.push(
          `${X(cx + r)} ${Y(cy)} m`,
          `${X(cx + r)} ${Y(cy + k)} ${X(cx + k)} ${Y(cy + r)} ${X(cx)} ${Y(cy + r)} c`,
          `${X(cx - k)} ${Y(cy + r)} ${X(cx - r)} ${Y(cy + k)} ${X(cx - r)} ${Y(cy)} c`,
          `${X(cx - r)} ${Y(cy - k)} ${X(cx - k)} ${Y(cy - r)} ${X(cx)} ${Y(cy - r)} c`,
          `${X(cx + k)} ${Y(cy - r)} ${X(cx + r)} ${Y(cy - k)} ${X(cx + r)} ${Y(cy)} c`,
          'h',
          op,
        )
        break
      }
      case 'text': {
        const size = item.size ?? scene.fontSize
        let encoded = ''
        for (const ch of item.text) {
          const code = ch.codePointAt(0)!
          if (code >= 32 && code <= 255 && code !== 127) encoded += ch
          else {
            unsupported.add(ch)
            encoded += '?'
          }
        }
        const width = textWidth(encoded, size, !!item.bold)
        const left = item.anchor === 'middle' ? item.x - width / 2 : item.anchor === 'end' ? item.x - width : item.x
        const baseline = item.central ? item.y + size * 0.35 : item.y
        const escaped = [...encoded]
          .map(ch => (ch === '(' || ch === ')' || ch === '\\' ? `\\${ch}` : ch.charCodeAt(0) > 126 ? `\\${ch.charCodeAt(0).toString(8).padStart(3, '0')}` : ch))
          .join('')
        ops.push(`${rgb(item.fill).map(num).join(' ')} rg`, 'BT', `/${item.bold ? 'F2' : 'F1'} ${num(size)} Tf`, `${X(left)} ${Y(baseline)} Td`, `(${escaped}) Tj`, 'ET')
        break
      }
    }
    ops.push('Q')
  }

  ops.push(`${rgb(scene.background).map(num).join(' ')} rg`, `0 0 ${num(W)} ${num(H)} re`, 'f')
  for (const group of scene.groups) for (const item of group.items) draw(item)
  const content = ops.join('\n')

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(W)} ${num(H)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`,
    '<< /Producer (RTLGraph) >>',
  ]

  // Latin-1 string -> bytes, one byte per character (content is ASCII apart from escapes).
  const latin1 = (s: string) => Uint8Array.from(s, ch => ch.charCodeAt(0) & 0xff)
  const header = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  let body = header
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefAt = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`

  return { bytes: latin1(body), unsupportedText: [...unsupported] }
}
