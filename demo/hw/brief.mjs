// Writes demo/hw/hw_brief.pdf: the handout the skeleton was given with, sitting
// in the same flat folder as the code — the way an assignment arrives.
//
//   node demo/hw/brief.mjs
//
// Written with RTLGraph's own PDF writer, like demo/pwm's, so the repo carries
// no PDF library and no course material.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderScenePdf } from '../../packages/rtl-render/src/index.ts'

const PAGE = { w: 595, h: 842 } // A4 in points
const ink = '#111827'
const muted = '#6b7280'

const lines = [
  ['HW-1: Limit counter', 20, true, 70],
  ['A counter that stops itself', 13, true, 110],
  ['Count up while EN is high and clear the count at LIMIT.', 11, false, 132],
  ['Keep the module and port names of the skeleton exactly.', 11, false, 150],
  ['Interface signals', 13, true, 190],
  ['CLK : Core clock', 11, false, 212],
  ['nRST : Active-low reset, asynchronous', 11, false, 230],
  ['EN : Count on this edge while high', 11, false, 248],
  ['LIMIT : The count the run ends at', 11, false, 266],
  ['CNT : The count now held', 11, false, 284],
  ['DONE : High for the cycle the count reaches LIMIT.', 11, false, 302],
  ['Detailed operations', 13, true, 342],
  ['Hold nRST low to clear the counter at once.', 11, false, 364],
  ['The counter advances only on a rising edge with EN high.', 11, false, 382],
  ['The count returns to zero on the edge after it reaches LIMIT.', 11, false, 400],
  ['Leave the given folder as it is: one flat directory.', 11, false, 432],
]

const scene = {
  view: { x: 0, y: 0, w: PAGE.w, h: PAGE.h },
  background: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: 11,
  groups: [{
    className: 'brief',
    attribute: { name: 'data-node-id', value: 'brief' },
    items: [
      ...lines.map(([text, size, bold, y]) => ({ kind: 'text', x: 60, y, text, size, bold, fill: ink })),
      { kind: 'text', x: 60, y: PAGE.h - 50, text: 'page 1 of 1 - the handout demo/hw was given with', size: 9, fill: muted },
    ],
  }],
}

const { bytes, unsupportedText } = renderScenePdf(scene)
if (unsupportedText.length > 0) throw new Error(`cannot draw ${unsupportedText.join(' ')}`)
writeFileSync(join(import.meta.dirname, 'hw_brief.pdf'), bytes)
console.log(`wrote hw_brief.pdf (${bytes.length} bytes)`)
