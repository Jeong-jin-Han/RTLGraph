import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildView, matchAnalysis, parseAnalysis, parseVcd, readBenchLog, readFacts, wordsIn } from '@rtlgraph/wave'
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
    if (stored?.stimulus) Object.assign(window, { stimulus: stored.stimulus })
  }
  const view = buildView(wave, facts, 20, 'ko')
  for (const trace of view.traces) {
    const place = report.signals?.[trace.name]
    if (place) Object.assign(trace, { source: place })
  }
  // …and the reading an agent wrote about it, if there is one beside the report
  const analysisPath = join(DEMO, `${bench}.waveform-analysis.md`)
  if (existsSync(analysisPath)) {
    const { matched, spare } = matchAnalysis(parseAnalysis(readFileSync(analysisPath, 'utf8')), view.markers)
    for (const marker of view.markers) {
      const section = matched.get(marker.id)
      if (section) Object.assign(marker, { explain: section.body })
    }
    if (spare.length > 0) Object.assign(view, { notes: spare.map(s => ({ heading: s.heading, body: s.body })) })
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

// Several instants a few nanoseconds apart is the normal case — four of them
// inside 60 ns is what the loop report opens on — so the labels have to stack
// rather than print over one another.
test('the badges that mark instants never sit on top of one another', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_loop.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  const message = payload('tb_uart_loop')
  view.send(message)

  // The view opens on "coming up", which has one instant. The crowding happens
  // on a check: six instants, four of them inside the first 60 ns.
  const places = view.byId('wave-rail')!.children.filter(c => c.attributes.get('class')?.includes('wave-place'))
  const crowded = message.view.markers.findIndex(m => m.focus.length >= 4)
  assert.ok(crowded > 0, 'a check with several instants to mark')
  places[crowded].dispatch('click', {})

  const plot = view.byId('wave-plot')!
  const badges = plot.findAll(node => node.attributes.get('class')?.startsWith('wave-badge') === true && node.tag === 'rect')
  assert.ok(badges.length >= 2, 'the check has several instants worth marking')

  // the plot carries numbers and nothing else: the wording lives in the rail
  assert.equal(plot.findAll(n => n.attributes.get('class')?.includes('wave-moment-label') === true).length, 0)
  const numbers = plot.findAll(n => n.attributes.get('class')?.startsWith('wave-badge-number') === true)
  assert.deepEqual(numbers.map(n => n.textContent), badges.map((_, i) => String(i + 1)), 'numbered in time order')

  // and no two badges share a lane and overlap in x
  const placed = badges.map(badge => ({
    x: Number(badge.attributes.get('x')), y: Number(badge.attributes.get('y')), w: Number(badge.attributes.get('width')),
  }))
  for (const [i, a] of placed.entries()) {
    for (const b of placed.slice(i + 1)) {
      if (a.y !== b.y) continue
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x, `two badges overlap on the same lane at y=${a.y}`)
    }
  }

  // pointing at a badge is the other way in: the plot stays wordless and the
  // entry that names it lights up in the rail
  badges[0].dispatch('mouseenter', {})
  const after = view.byId('wave-plot')!
  assert.equal(after.findAll(n => n.attributes.get('class')?.includes('wave-moment-label') === true).length, 0,
    'no words appear over the traces')
  assert.equal(after.findAll(n => n.attributes.get('class') === 'wave-badge hot').length, 1, 'the badge itself lights')
  assert.ok(view.byId('wave-rail')!.findAll(n => n.attributes.get('class') === 'moment hot').length === 1,
    'and so does the line that spells it out')
})

// Pointing at something should say which line it means, without moving the view
// or asking for a click first.
test('pointing at a moment, or at a signal, lights up what it refers to', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_corner.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  view.send(payload('tb_uart_corner'))

  const hotLines = () => view.byId('wave-plot')!.findAll(n => n.attributes.get('class') === 'wave-moment hot').length
  // `.moments` is the row that holds them; the pills themselves are buttons.
  const pill = view.byId('wave-rail')!.find(n => n.tag === 'button' && n.attributes.get('class')?.startsWith('moment') === true)!
  assert.equal(hotLines(), 0, 'nothing is lit before the hand arrives')
  pill.dispatch('mouseenter', {})
  assert.equal(hotLines(), 1, 'the instant the pill names is lit')
  pill.dispatch('mouseleave', {})
  assert.equal(hotLines(), 0, 'and goes out again')

  const row = view.byId('wave-labels')!.children.find(r => r.attributes.get('class')?.includes('wave-label') && !r.attributes.get('class')?.includes('axis'))!
  row.dispatch('mouseenter', {})
  assert.equal(view.byId('wave-plot')!.findAll(n => n.attributes.get('class') === 'wave-row-hot').length, 1,
    'the row under the hand is picked out in the plot')
  assert.ok(view.byId('wave-labels')!.children.some(r => r.attributes.get('class')?.includes('hot')), 'and in the labels')
})

// Zooming about the middle is right in the middle of a run and wrong at its
// end: the thing you are looking at slides off the screen while the view grows
// around a point you did not choose.
test('an edge of the run holds still while the rest zooms', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_corner.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  const message = payload('tb_uart_corner')
  view.send(message)
  const window = () => view.byId('toolbar')!.find(n => n.attributes.get('class') === 'label')!.textContent
  const click = (label: string) => view.byId('toolbar')!.find(n => n.tag === 'button' && n.textContent === label)!.dispatch('click', {})

  // the last check ends where the run does
  const places = view.byId('wave-rail')!.children.filter(c => c.attributes.get('class')?.includes('wave-place'))
  places[places.length - 1].dispatch('click', {})
  const ended = window().split('→')[1]
  click('−')
  assert.equal(window().split('→')[1], ended, 'zooming out at the end keeps the end where it is')
  click('+')
  assert.equal(window().split('→')[1], ended, 'and so does zooming back in')
  assert.notEqual(window().split('→')[0], '0 fs ', 'the left edge is what moved')

  // at the start it is the other way round
  click('⇔')
  const started = window().split('→')[0]
  click('+')
  assert.equal(window().split('→')[0], started, 'the whole run zooms from its start')
})

// The measurements are the claim; the analysis is the argument. They belong on
// one screen, with the argument folded away until it is asked for.
test('what an agent wrote about a check unfolds beside it, citations and all', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_corner.waveform-analysis.md'))) return t.skip('nobody has written one here')
  const view = await webview()
  view.send(payload('tb_uart_corner'))
  const rail = () => view.byId('wave-rail')!

  const fold = rail().find(n => n.attributes.get('class') === 'why')!
  assert.match(fold.textContent, /왜 통과했나/)
  // the sections that belong to no check are shown outright; a check's is not
  const inPlaces = () => rail().findAll(n => n.attributes.get('class') === 'prose'
    && n.parent?.attributes.get('class')?.includes('wave-place') === true)
  assert.equal(inPlaces().length, 0, 'folded away to begin with')

  fold.dispatch('click', {})
  assert.equal(inPlaces().length, 1, 'and only the one that was asked for')
  const cites = rail().findAll(n => n.attributes.get('class') === 'cite')
  assert.ok(cites.length >= 1, 'the lines it cites are buttons')
  assert.match(cites[0].textContent, /\.v:\d+/)
  cites[0].dispatch('click', {})
  const asked = view.posted.at(-1) as { type: string; file: string; line: number }
  assert.equal(asked.type, 'openCode')
  assert.match(asked.file, /\.v$/)
  assert.ok(asked.line > 0)

  // sections that belong to no check are kept rather than dropped
  assert.ok(rail().findAll(n => n.attributes.get('class') === 'wave-note').length >= 1)
})

// A run has ten checks and nobody ordered ten essays: a place with no writing
// yet offers to ask for that one, and the request carries its measurements.
test('a check with nothing written offers to ask, one check at a time', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_loop.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  view.send(payload('tb_uart_loop')) // no analysis is written for this one
  const asks = view.byId('wave-rail')!.findAll(n => n.attributes.get('class') === 'ask')
  assert.ok(asks.length >= 3, 'every place without writing offers it')
  asks[0].dispatch('click', {})
  const posted = view.posted.at(-1) as { type: string; id: string }
  assert.equal(posted.type, 'askAnalysis')
  assert.equal(posted.id, 'init', 'and says which place it is about')
})

// The card reads in the order a reader asks in: what for, how, what happened.
// "How" comes from the bench's own statements, which the dump cannot know — it
// is carried from the report, and was dropped in transit once already.
test('a card says how the stretch was driven, not only what came of it', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_corner.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  view.send(payload('tb_uart_corner'))
  const rail = view.byId('wave-rail')!
  const names = rail.findAll(n => n.attributes.get('class') === 'part-name').map(n => n.textContent)
  assert.ok(names.includes('방식'), `the card shows how it was driven — got ${names.join(', ')}`)
  assert.ok(names.includes('결과'))
  const steps = rail.findAll(n => n.attributes.get('class') === 'step').map(n => n.textContent)
  assert.ok(steps.some(step => step.includes('frame(')), `the driving statements are there — got ${steps.slice(0, 4).join(' | ')}`)
})

// Dragging pans. If the browser is allowed to treat it as a text selection, the
// whole plot lights up blue and the values come along for the ride.
test('dragging the plot pans it rather than selecting the writing on it', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_corner.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  view.send(payload('tb_uart_corner'))
  const plot = view.byId('wave-plot')!

  const down = plot.dispatch('mousedown', { clientX: 200 })
  assert.equal(down.defaultPrevented, true, 'the selection never starts')
  assert.ok(plot.attributes.get('class')?.includes('panning'), 'and the hand says it is panning')
})
