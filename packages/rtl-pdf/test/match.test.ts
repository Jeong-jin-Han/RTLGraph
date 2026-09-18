import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findQuote, findQuoteInPages, type TextPiece } from '../src/match.ts'

// A page, written the way pdf.js hands one back: a piece per run, in reading
// order, each with the box it fills. 7 points per character is about right for
// 11pt Helvetica and keeps the arithmetic in the tests readable.
const UNIT = 7
function line(y: number, ...runs: string[]): TextPiece[] {
  let x = 60
  return runs.map(str => {
    const piece = { str, x, y, w: str.length * UNIT, h: 12 }
    x += piece.w
    return piece
  })
}

const PAGE: TextPiece[] = [
  ...line(70, 'D02-2: PWM controller'),
  ...line(132, 'Generate a square wave ', 'with a configurable duty cycle.'),
  ...line(212, 'CLK : Core clock'),
  ...line(338, 'RDY : Active-low when the PWM', ' core is activated'),
]

test('a sentence that is there is found, and painted as one box per line', () => {
  const found = findQuote(PAGE, 'Generate a square wave with a configurable duty cycle.')
  assert.ok(found)
  assert.equal(found.exact, true)
  assert.equal(found.score, 1)
  assert.equal(found.rects.length, 1, 'it sits on one line')
  const [rect] = found.rects
  assert.equal(rect.y, 132)
  assert.ok(Math.abs(rect.x - 60) < 1, `starts at the left of the line, not ${rect.x}`)
  assert.ok(rect.w > 50 * UNIT * 0.9, 'and covers the whole sentence')
})

test('the match carries the page\'s own wording, for a viewer to search with', () => {
  const found = findQuote(PAGE, 'Generate a square wave, with an adjustable duty cycle.')
  assert.equal(found?.text, 'Generate a square wave with a configurable duty cycle.',
    'what the page says, not what the JSON quotes')
})

test('a sentence split across two runs is one box when they share a line', () => {
  const found = findQuote(PAGE, 'RDY : Active-low when the PWM core is activated')
  assert.ok(found?.exact)
  assert.equal(found.rects.length, 1)
  assert.equal(found.rects[0].y, 338)
})

test('a sentence that wraps is painted line by line', () => {
  const wrapped = [...line(400, 'The count returns to zero on the edge'), ...line(418, 'after it reaches LIMIT.')]
  const found = findQuote(wrapped, 'The count returns to zero on the edge after it reaches LIMIT.')
  assert.ok(found?.exact, 'the line break between the runs reads as a space')
  assert.deepEqual(found.rects.map(r => r.y), [400, 418])
})

test('only part of a line is painted when only part of it is quoted', () => {
  const found = findQuote(PAGE, 'Core clock')
  assert.ok(found?.exact)
  const [rect] = found.rects
  assert.ok(rect.x > 60 + 5 * UNIT, `starts after "CLK : ", not at ${rect.x}`)
  assert.ok(rect.w < 'CLK : Core clock'.length * UNIT, 'and stops before the line does')
})

test('what the document has moved on from is still found, and said to be inexact', () => {
  // The JSON quotes what the brief said; the brief was re-issued with a comma
  // and a different word. The link is still worth following.
  const found = findQuote(PAGE, 'Generate a square wave, with an adjustable duty cycle.')
  assert.ok(found, 'a near miss is a hit')
  assert.equal(found.exact, false)
  assert.ok(found.score > 0.62 && found.score < 1, `scored ${found.score}`)
  assert.equal(found.rects[0].y, 132, 'and it is the right line')
})

test('a sentence the page does not say is not painted somewhere at random', () => {
  assert.equal(findQuote(PAGE, 'The average DC voltage drives an electric motor.'), undefined)
  assert.equal(findQuote(PAGE, ''), undefined)
  assert.equal(findQuote([], 'anything'), undefined)
})

test('case, curly quotes, ligatures and extra spacing do not hide a sentence', () => {
  const fancy = line(60, '“Conﬁgurable”   duty – the ofﬁce default.')
  const found = findQuote(fancy, '"Configurable" duty - the office default.')
  assert.ok(found?.exact, 'the fold makes both sides the same sentence')
})

// The three shapes a real handout (EE.50078 P01, a PowerPoint deck) turned out
// to have. Each of them made a sentence unfindable before it was folded away.
test('a sentence is found when its quote marks arrive as runs of their own', () => {
  const pieces = line(60, 'data_out_valid', ' ', ': indicate', ' ', '\u201c', 'data_out', '\u201d', ' ', 'is valid')
  const found = findQuote(pieces, 'data_out_valid : indicate "data_out" is valid')
  assert.ok(found?.exact, 'whether two runs have a space between them is not something the document says')
  assert.equal(found.rects.length, 1)
})

test('a name written in mathematical italics is the same name', () => {
  // PowerPoint's equation editor writes SymbolEdgeTime in U+1D400's blocks.
  const italic = [...'SymbolEdgeTime'].map(c => {
    const base = c >= 'a' ? 0x1d44e - 0x61 : 0x1d434 - 0x41
    return String.fromCodePoint(base + c.charCodeAt(0))
  }).join('')
  const found = findQuote(line(60, `Receive 1b per ${italic}.`), 'Receive 1b per SymbolEdgeTime.')
  assert.ok(found?.exact, 'nobody types the mathematical letters by hand')
})

test('an arrow is the same as the way it is typed', () => {
  const found = findQuote(line(60, 'When observed serial_in is 1\u2019b1 \u2192 1\u2019b0, start reception.'),
    "When observed serial_in is 1'b1 -> 1'b0, start reception.")
  assert.ok(found?.exact)
})

test('the page hint is followed, but a wrong hint still finds the page that says it', () => {
  const pages = [line(70, 'A cover page.'), PAGE, line(70, 'CLK : Core clock')]
  const onHint = findQuoteInPages(pages, 'CLK : Core clock', 2)
  assert.equal(onHint?.page, 2, 'the hinted page has it, so that is the answer')
  const wrongHint = findQuoteInPages(pages, 'RDY : Active-low when the PWM core is activated', 1)
  assert.equal(wrongHint?.page, 2, 'the hint was wrong; the sentence still is where it is')
  assert.equal(findQuoteInPages(pages, 'nothing says this', 1), undefined)
})
