// Finding a quoted sentence inside a page of PDF text.
//
// A `spec` stores the sentence and a page hint, never highlight coordinates
// (DECISIONS D5): a PDF is re-exported, reflowed, re-paginated, and coordinates
// go quietly wrong while the sentence stays true. So the sentence has to be
// found again every time the document is opened — and found even when what the
// PDF hands back is not quite what the reader copied: a line break in the
// middle, two spaces where there was one, a hyphen at the edge of a column, a
// ligature, curly quotes.
//
// Nothing here knows about pdf.js. The input is the text a page is made of, in
// reading order, each piece with the box it occupies; the output is the boxes
// to paint, one per line of the match.

export interface TextPiece {
  str: string
  x: number // left, in the page's own units, y growing downwards
  y: number // top
  w: number
  h: number
}

export interface Highlight {
  rects: { x: number; y: number; w: number; h: number }[]
  // The matched words as the *page* spells them, not as the quote does. A real
  // viewer highlights by searching its own text, so it has to be handed the
  // document's own wording — which is not the quote whenever the match was fuzzy
  // or the page broke a word across two runs.
  text: string
  score: number // 1 for an exact match, down to 0
  exact: boolean
}

// What the two sides are compared as. Everything here is a difference a copy out
// of a PDF makes without changing the sentence.
//
// Whitespace is dropped rather than collapsed. pdf.js hands back a run per piece
// of styling, and a real slide deck breaks lines mid-sentence and puts the curly
// quotes of `“data_out”` in runs of their own — so whether there is a space
// between two runs is not something the document actually says. Comparing
// without spaces at all makes the question go away; a whole sentence is long
// enough that losing word boundaries costs nothing.
const FOLD: [RegExp, string][] = [
  [/\u00ad/g, ''], // soft hyphen
  [/[\u2018\u2019\u201b\u2032]/g, "'"],
  [/[\u201c\u201d\u2033]/g, '"'],
  [/[\u2010-\u2015\u2212]/g, '-'],
  [/[\u2192\u27f6\u21d2\u27f9]/g, '->'], // "1'b1 → 1'b0" is written "->" as often as not
  [/\ufb00/g, 'ff'], [/\ufb01/g, 'fi'], [/\ufb02/g, 'fl'], [/\ufb03/g, 'ffi'], [/\ufb04/g, 'ffl'],
]

// Slide decks written with an equation editor spell names in Mathematical
// Alphanumeric Symbols: the real UART handout writes "Receive 1b per
// SymbolEdgeTime" with every letter of the name in mathematical italics, which
// nobody types by hand. Each block of 26 letters or 10 digits maps straight
// back onto ASCII.
const MATH: [number, number, string][] = [
  [0x1d400, 0x1d419, 'A'], [0x1d41a, 0x1d433, 'a'], // bold
  [0x1d434, 0x1d44d, 'A'], [0x1d44e, 0x1d467, 'a'], // italic
  [0x1d468, 0x1d481, 'A'], [0x1d482, 0x1d49b, 'a'], // bold italic
  [0x1d5a0, 0x1d5b9, 'A'], [0x1d5ba, 0x1d5d3, 'a'], // sans
  [0x1d5d4, 0x1d5ed, 'A'], [0x1d5ee, 0x1d607, 'a'], // sans bold
  [0x1d7ce, 0x1d7d7, '0'], [0x1d7e2, 0x1d7eb, '0'], // digits: bold, sans
]

function plain(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    const block = code >= 0x1d400 ? MATH.find(([from, to]) => code >= from && code <= to) : undefined
    out += block ? String.fromCharCode(block[2].charCodeAt(0) + (code - block[0])) : ch
  }
  return out
}

const fold = (text: string): string =>
  FOLD.reduce((s, [re, to]) => s.replace(re, to), plain(text)).replace(/\s+/g, '').toLowerCase()

// The page as one string, with a way back: `from[i]` is the piece the i-th
// character came from, and `at[i]` its offset inside that piece.
interface Flat {
  text: string
  from: number[]
  at: number[]
}

function flatten(pieces: TextPiece[]): Flat {
  let text = ''
  const from: number[] = []
  const at: number[] = []
  for (const [index, piece] of pieces.entries()) {
    // Character by character, so a character that folds away (a space, a soft
    // hyphen) takes its place in the map with it. Code points, not code units:
    // a mathematical letter is a surrogate pair and folds as a whole.
    let i = 0
    for (const char of piece.str) {
      for (const ch of fold(char)) {
        text += ch
        from.push(index)
        at.push(i)
      }
      i += char.length
    }
  }
  return { text, from, at }
}

// How alike two strings are: the share of two-letter runs they have in common
// (Dice). A single-pass character alignment was tried first and scored a
// re-worded sentence 0.59 — below anything that could also reject a different
// sentence — because one inserted comma knocks the rest out of step. Pairs do
// not care where the drift started: the same sentence re-worded scores 0.79, a
// different sentence that opens the same way 0.53, an unrelated one 0.26.
function likeness(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const pairs = (s: string) => {
    const seen = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) seen.set(s.slice(i, i + 2), (seen.get(s.slice(i, i + 2)) ?? 0) + 1)
    return seen
  }
  const left = pairs(a)
  const right = pairs(b)
  let shared = 0
  for (const [pair, count] of left) shared += Math.min(count, right.get(pair) ?? 0)
  return (2 * shared) / (a.length - 1 + (b.length - 1))
}

// Where in the page the quote is. Exact first — most of the time the sentence is
// there verbatim — then the best window of the same length around each place the
// quote's first distinctive word appears.
function locate(page: string, quote: string, words: string[]): { start: number; end: number; score: number } | undefined {
  const exact = page.indexOf(quote)
  if (exact >= 0) return { start: exact, end: exact + quote.length, score: 1 }
  if (quote.length < 4) return undefined

  // The page has no spaces left to split on, so the anchors come from the words
  // of the sentence as it was written, folded the same way.
  const anchors = words.length > 0 ? words : [quote.slice(0, 8)]
  let best: { start: number; end: number; score: number } | undefined
  for (const anchor of anchors.slice(0, 6)) {
    for (let at = page.indexOf(anchor); at >= 0; at = page.indexOf(anchor, at + 1)) {
      // The anchor can be anywhere in the quote, so the window starts wherever
      // the anchor sits inside it, and is allowed to run a little long.
      const before = quote.indexOf(anchor)
      const start = Math.max(0, at - before)
      for (const end of [start + quote.length, start + Math.ceil(quote.length * 1.15)]) {
        const score = likeness(page.slice(start, Math.min(page.length, end)), quote)
        if (!best || score > best.score) best = { start, end: Math.min(page.length, end), score }
      }
    }
  }
  return best && best.score >= 0.62 ? best : undefined
}

// One box per line, so a sentence that wraps is painted as the reader sees it:
// pieces that share a baseline are merged, and the lines come out in order.
function boxes(pieces: TextPiece[], touched: Map<number, { from: number; to: number }>): Highlight['rects'] {
  const parts = [...touched.entries()]
    .map(([index, span]) => {
      const piece = pieces[index]
      const chars = Math.max(piece.str.length, 1)
      const unit = piece.w / chars
      const from = Math.min(span.from, chars)
      const to = Math.min(Math.max(span.to, from + 1), chars)
      // A piece the match only clips (the first or last one) is painted from the
      // character it starts at, assuming the run is evenly spaced.
      return { x: piece.x + unit * from, y: piece.y, w: unit * (to - from), h: piece.h }
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)

  const lines: Highlight['rects'] = []
  for (const part of parts) {
    const line = lines[lines.length - 1]
    // Same line when the baselines overlap by most of their height.
    if (line && Math.abs(line.y - part.y) <= Math.min(line.h, part.h) * 0.6) {
      const right = Math.max(line.x + line.w, part.x + part.w)
      line.x = Math.min(line.x, part.x)
      line.w = right - line.x
      line.h = Math.max(line.h, part.h)
      line.y = Math.min(line.y, part.y)
    } else lines.push({ ...part })
  }
  return lines
}

// The boxes to paint for a quote on this page, or nothing when the page does not
// say it. `exact` is worth showing: a fuzzy hit means the document has moved on
// from what the JSON quotes.
export function findQuote(pieces: TextPiece[], quote: string): Highlight | undefined {
  const wanted = fold(quote)
  if (wanted.length === 0 || pieces.length === 0) return undefined
  const words = quote.split(/\s+/).map(fold).filter(w => w.length >= 4)
  const flat = flatten(pieces)
  const found = locate(flat.text, wanted, words)
  if (!found) return undefined

  const touched = new Map<number, { from: number; to: number }>()
  for (let i = found.start; i < found.end && i < flat.from.length; i++) {
    const index = flat.from[i]
    const span = touched.get(index)
    if (span) span.to = flat.at[i] + 1
    else touched.set(index, { from: flat.at[i], to: flat.at[i] + 1 })
  }
  const rects = boxes(pieces, touched)
  const text = [...touched.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, span]) => pieces[index].str.slice(span.from, Math.max(span.to, span.from + 1)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return rects.length > 0 ? { rects, text, score: found.score, exact: found.score === 1 } : undefined
}

// The whole document, when the page hint is wrong or missing: the page that says
// it best wins, and an exact match stops the search.
export function findQuoteInPages(
  pages: TextPiece[][],
  quote: string,
  hint?: number,
): { page: number; highlight: Highlight } | undefined {
  // The hinted page first — it is right nearly always, and this is the common path.
  const order = [...pages.keys()].sort((a, b) =>
    Math.abs(a - ((hint ?? 1) - 1)) - Math.abs(b - ((hint ?? 1) - 1)))
  let best: { page: number; highlight: Highlight } | undefined
  for (const index of order) {
    const highlight = findQuote(pages[index], quote)
    if (!highlight) continue
    if (highlight.exact) return { page: index + 1, highlight }
    if (!best || highlight.score > best.highlight.score) best = { page: index + 1, highlight }
  }
  return best
}
