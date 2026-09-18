// Writes demo/pwm/spec/pwm_brief.pdf: the one-page assignment brief the pwm demo
// is built from, so the spec links in the JSON point at a real document.
//
//   node demo/pwm/spec/brief.mjs
//
// It is written with RTLGraph's own PDF writer — a Scene of text — so the repo
// carries no PDF library and no course material.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderScenePdf } from '../../../packages/rtl-render/src/index.ts'

const PAGE = { w: 595, h: 842 } // A4 in points
const ink = '#111827'
const muted = '#6b7280'

const lines = [
  ['D02-2: PWM controller', 20, true, 70],
  ['Pulse Width Modulation', 13, true, 110],
  ['Generate a square wave with a configurable duty cycle.', 11, false, 132],
  ['The average DC voltage drives an electric motor.', 11, false, 150],
  ['Interface signals', 13, true, 190],
  ['CLK : Core clock', 11, false, 212],
  ['RST : Active-high reset', 11, false, 230],
  ['PERIOD : Number of pulse period', 11, false, 248],
  ['DUTY : Number of ON cycles', 11, false, 266],
  ['SET : Set DUTY and PERIOD, enable PWM', 11, false, 284],
  ['STOP : Stop the PWM output', 11, false, 302],
  ['PWM : Generated PWM pulse', 11, false, 320],
  ['RDY : Active-low when the PWM core is activated', 11, false, 338],
  ['Detailed operations', 13, true, 378],
  ['Reset the core (RDY becomes HIGH).', 11, false, 400],
  ['Set PERIOD and DUTY.', 11, false, 418],
  ['Assert 1-cycle SET (active-high) to enable the PWM core.', 11, false, 436],
  ['Assert 1-cycle STOP (active-high) to stop the PWM core.', 11, false, 454],
  ['A state machine keeps the core in IDLE until it is set up,', 11, false, 486],
  ['loads the settings for one cycle, and runs until it is stopped.', 11, false, 504],
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
      { kind: 'text', x: 60, y: PAGE.h - 50, text: 'page 1 of 1 - the brief demo/pwm is built from', size: 9, fill: muted },
    ],
  }],
}

const { bytes, unsupportedText } = renderScenePdf(scene)
if (unsupportedText.length > 0) throw new Error(`cannot draw ${unsupportedText.join(' ')}`)
writeFileSync(join(import.meta.dirname, 'pwm_brief.pdf'), bytes)
console.log(`wrote pwm_brief.pdf (${bytes.length} bytes)`)
