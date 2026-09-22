import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildView, parseVcd, readBenchLog, readFacts, wordsIn } from '@rtlgraph/wave'
import { loadWebview, type Harness } from './dom.ts'

// The waveform webview, driven the way the host drives it. It exists because
// the view came up blank for one of two reports that both looked fine from the
// outside, and nothing in a unit test of the model could have caught it.

const BUNDLE = join(import.meta.dirname, '../dist/wave.js')
const DEMO = join(import.meta.dirname, '../../../demo/uart-p01/waveform')

/**
 * What the host sends, built the way waveView.ts builds it: the view from the
 * dump, the lines the report worked out against the source, and only the
 * wording that can cross into a webview.
 */
function payload(bench: string) {
  const report = JSON.parse(readFileSync(join(DEMO, `${bench}.waveform.json`), 'utf8'))
  const wave = parseVcd(readFileSync(join(DEMO, `${bench}.vcd`), 'utf8'))
  const facts = readFacts(wave, report.bench ?? [], 'ko')
  for (const window of facts.windows) {
    const stored = report.facts?.windows?.find((w: { label: string }) => w.label === window.label)
    if (stored?.source) Object.assign(window, { source: stored.source })
  }
  const view = buildView(wave, facts, 20, 'ko')
  for (const trace of view.traces) {
    const place = report.signals?.[trace.name]
    if (place) Object.assign(trace, { source: place })
  }
  const words = Object.fromEntries(Object.entries(wordsIn('ko')).filter(([, said]) => typeof said === 'string'))
  return { type: 'wave', view, words }
}

let ui: Harness | undefined
const webview = async (): Promise<Harness> => (ui ??= await loadWebview(BUNDLE))

// Whatever the host posts must survive the trip. A structured clone is the
// strictest thing VS Code might do with it, and a function in the payload
// silently costs the whole message.
test('what the host sends can cross into a webview at all', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, () => {
  for (const bench of ['tb_uart_corner', 'tb_uart_loop']) {
    if (!existsSync(join(DEMO, `${bench}.waveform.json`))) continue
    assert.doesNotThrow(() => structuredClone(payload(bench)), `${bench} payload is not clonable`)
  }
})

test('a report draws: the places on the left, a row per signal', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_corner.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  view.send(payload('tb_uart_corner'))

  const rail = view.byId('wave-rail')!
  const places = rail.children.filter(child => child.attributes.get('class')?.includes('wave-place'))
  assert.ok(places.length >= 3, 'the rail lists somewhere to go')
  assert.equal(places[0].children[0].textContent, '깨어나는 과정', 'and it opens on how the design came up')

  // every check that could be traced offers its line of the testbench
  const sources = rail.find(child => child.attributes.get('class') === 'source')
  assert.match(sources?.textContent ?? '', /tb_uart_corner\.v:\d+/)

  const labels = view.byId('wave-labels')!
  const names = labels.children.flatMap(row => row.children.filter(c => c.attributes.get('class')?.includes('name')))
  assert.ok(names.length >= 8, 'a row per signal')
  // a signal whose driving line was found is a way into the code
  assert.ok(names.some(name => name.tag === 'button'), 'signal names link to the RTL that drives them')
})

// The bug this file was written for: the loop report opened blank while the
// corner one drew, because a payload can be fine and still not arrive.
test('the second report draws too, and opens on something that moves', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_loop.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const message = payload('tb_uart_loop')
  const view = await webview()
  view.send(message)

  const places = view.byId('wave-rail')!.children.filter(c => c.attributes.get('class')?.includes('wave-place'))
  assert.ok(places.length >= 3, 'the loop report has places too')

  // …and the opening window is wide enough to contain some activity: a view
  // that frames 40 ns of a 4 µs run reads as broken, however correct it is.
  const opening = message.view.markers[0]
  assert.ok(opening.to - opening.from >= message.view.end / 50,
    `the opening window is ${opening.to - opening.from} of ${message.view.end}`)
})
