// Turning what pdf.js reads off a page into the boxes the matcher works in.
//
// pdf.js gives each run a text matrix in PDF space — y growing upwards from the
// bottom-left, the run's own scale and skew folded in — and a viewport matrix
// that maps that onto the canvas. The matcher wants plain screen boxes, y
// growing downwards, so the two are multiplied here, once, where it can be
// tested. Structural types only: nothing imports pdf.js, so the matcher stays
// usable from a plain node test.

import type { TextPiece } from './match.ts'

export interface TextItem {
  str: string
  width: number // in text space, before the viewport scale
  height: number
  transform: number[] // [a, b, c, d, e, f]
}

export interface Viewport {
  transform: number[] // [a, b, c, d, e, f], PDF space -> canvas
  scale: number
}

// [a b c d e f] ∘ [a b c d e f], the way pdf.js's Util.transform does it.
const compose = (m: number[], n: number[]): number[] => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]

export function piecesFrom(items: TextItem[], viewport: Viewport): TextPiece[] {
  const pieces: TextPiece[] = []
  for (const item of items) {
    if (item.str === '') continue // pdf.js marks line ends with an empty run
    const at = compose(viewport.transform, item.transform)
    // The height of the run as drawn: the length of the matrix's vertical part,
    // which also covers a page that is rotated or scaled.
    const h = Math.hypot(at[2], at[3]) || item.height * viewport.scale
    const w = item.width * viewport.scale
    // at[5] is the baseline; a box that starts at the baseline would sit under
    // the text it is meant to cover.
    pieces.push({ str: item.str, x: at[4], y: at[5] - h, w, h })
  }
  return pieces
}
