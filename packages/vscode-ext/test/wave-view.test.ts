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
const DEMO = join(import.meta.dirname, '../../../demo/uart-p01/waveform/mine')

/**
 * What the host sends, built the way waveView.ts builds it: the view from the
 * dump, the lines the report worked out against the source, and only the
 * wording that can cross into a webview.
 */
function payload(bench: string, withAnalysis = true) {
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
    const place = report.signals?.[trace.path] ?? report.signals?.[trace.name]
    if (place) Object.assign(trace, { source: place })
  }
  // …and the reading an agent wrote about it, if there is one beside the report
  const analysisPath = join(DEMO, `${bench}.waveform-analysis.md`)
  if (withAnalysis && existsSync(analysisPath)) {
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

  // The rail is a contact sheet: a title, a time, and how many instants — the
  // detail is one click away, in the panel.
  const card = places[1]
  assert.equal(card.find(n => n.attributes.get('class') === 'source'), undefined, 'no code button on a thumbnail')
  assert.ok(card.findAll(n => n.attributes.get('class')?.startsWith('tag') === true).length >= 1, 'but it says what is in it')
  card.dispatch('click', {})
  const panel = view.byId('wave-why')!
  assert.equal(panel.hidden, false, 'clicking a place opens it')
  const sources = panel.find(child => child.attributes.get('class') === 'source')
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
  // entry that names it lights up in the panel
  badges[0].dispatch('mouseenter', {})
  const after = view.byId('wave-plot')!
  assert.equal(after.findAll(n => n.attributes.get('class')?.includes('wave-moment-label') === true).length, 0,
    'no words appear over the traces')
  assert.equal(after.findAll(n => n.attributes.get('class') === 'wave-badge hot').length, 1, 'the badge itself lights')
  assert.ok(view.byId('wave-why')!.findAll(n => n.attributes.get('class') === 'moment hot').length === 1,
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
  // the instants are in the panel now, which opens when a place is clicked
  view.byId('wave-rail')!.children.filter(c => c.attributes.get('class')?.includes('wave-place'))[0].dispatch('click', {})
  const pill = view.byId('wave-why')!.find(n => n.tag === 'button' && n.attributes.get('class')?.startsWith('moment') === true)!
  assert.equal(hotLines(), 0, 'nothing is lit before the hand arrives')
  pill.dispatch('mouseenter', {})
  assert.equal(hotLines(), 1, 'the instant the pill names is lit')
  pill.dispatch('mouseleave', {})
  assert.equal(hotLines(), 0, 'and goes out again')

  // the first real signal row: not the time axis, and not a module heading
  const row = view.byId('wave-labels')!.children.find(r => {
    const kind = r.attributes.get('class') ?? ''
    return kind.includes('wave-label') && !kind.includes('axis') && !kind.includes('group')
  })!
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

  const cards = () => rail().children.filter(c => c.attributes.get('class')?.includes('wave-place'))
  const written = cards().find(card => card.findAll(n => n.attributes.get('class') === 'tag written').length > 0)!
  assert.ok(written, 'a place with writing says so on its thumbnail')
  // It opens in the panel on the right, not under the card: a reader reads the
  // argument against the signals, and unfolding pushed those off the screen.
  const panel = () => view.byId('wave-why')!
  const prose = () => panel().findAll(n => n.attributes.get('class') === 'prose')
  assert.equal(prose().length, 0, 'nothing is open to begin with')
  assert.equal(panel().hidden, true, 'and the panel takes no room until asked for')

  written.dispatch('click', {})
  assert.equal(prose().length, 1, 'and only the one that was asked for')
  assert.equal(panel().hidden, false)
  assert.equal(rail().findAll(n => n.attributes.get('class') === 'prose').length, 0,
    'the list of places keeps its place')
  assert.ok(panel().find(n => n.attributes.get('class') === 'why-title')!.textContent.length > 0,
    'the panel says which check it is about')
  const cites = panel().findAll(n => n.attributes.get('class') === 'cite')
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

// Thirty names in one list do not say where any of them lives. The report
// already knows — each signal carries the line of RTL that drives it — so the
// rows are grouped under the file that line is in.
test('the rows are grouped by the module they belong to', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_loop.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  view.send(payload('tb_uart_loop'))
  const labels = () => view.byId('wave-labels')!.children
  const groups = () => labels().filter(r => r.attributes.get('class')?.includes('group') === true).map(r => r.textContent)

  assert.ok(groups().includes('uart_receiver.v'), `the receiver's own signals are named as its: ${groups()}`)
  assert.ok(groups().length >= 2, 'and the design is more than one module')

  // A heading takes a lane in the plot too, or the two columns stop lining up:
  // the labels and the traces are read across.
  const lanes = labels().filter(r => r.attributes.get('class')?.includes('axis') !== true).length
  const drawn = view.byId('wave-plot')!.findAll(n => n.attributes.get('class') === 'wave-row-group').length
  assert.equal(drawn, groups().length, 'every heading has its own empty lane')
  assert.ok(lanes > drawn, 'and the rest are signals')

  // A constant and a signal that changes are different kinds of thing.
  const vars = view.byId('toolbar')!.find(n => n.tag === 'button' && n.textContent === 'var')!
  vars.dispatch('click', {})
  assert.ok(groups().some(name => /파라미터|parameters/.test(name)), `the parameters are their own group: ${groups()}`)
  vars.dispatch('click', {}) // the harness is shared: leave the view as it was found
})

// Every section is written as the same three fields, and what does not bear on
// the verdict folds away: that is what makes a check readable in thirty seconds.
test('the three fields read as fields, and the aside folds', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_corner.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  const sent = payload('tb_uart_corner')
  Object.assign(sent.view.markers.find(m => m.id === 'init')!, {
    explain: '목적 — 리셋 직후 설계가 정의되는지.\n방식 — 4 클럭 동안 reset 을 든다 (`tb.v:82`).'
      + '\n결과 — 40.000 ns 에 전부 정의됐다 (`uart_receiver.v:84`).\n\n'
      + '### 더 보기\n레지스터마다 어디서 정의되는지.',
  })
  view.send(sent)
  view.byId('wave-rail')!.children.filter(c => c.attributes.get('class')?.includes('wave-place'))[0].dispatch('click', {})
  const panel = view.byId('wave-why')!

  const fields = panel.findAll(n => n.attributes.get('class') === 'field-name').map(n => n.textContent)
  assert.deepEqual(fields, ['목적', '방식', '결과'], 'each field is labelled, in the order a reader asks in')
  const fold = panel.find(n => n.tag === 'details')
  assert.ok(fold, 'the aside is folded rather than run on')
  assert.equal(fold!.find(n => n.tag === 'summary')!.textContent, '더 보기')
  assert.ok(fold!.findAll(n => /레지스터마다/.test(n.textContent)).length > 0, 'and what it holds is inside it')
})

// An analysis writes tables — a register per row, what defines it, its reset
// value — and a table poured into a paragraph is pipes and unreadable.
test('a table in the writing is drawn as a table', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_corner.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  const sent = payload('tb_uart_corner')
  const place = sent.view.markers.find(m => m.id === 'init')!
  Object.assign(place, {
    explain: '앞말\n\n| 레지스터 | 정의하는 줄 |\n|---|---|\n| `has_byte` | `uart_receiver.v:120` |\n| `rx_shift` | `uart_receiver.v:111` |\n\n뒷말',
  })
  view.send(sent)
  view.byId('wave-rail')!.children.filter(c => c.attributes.get('class')?.includes('wave-place'))[0].dispatch('click', {})

  const table = view.byId('wave-why')!.find(n => n.tag === 'table')
  assert.ok(table, 'the rows are a table, not a paragraph of pipes')
  assert.equal(table!.findAll(n => n.tag === 'th').length, 2, 'the header row is a header')
  assert.equal(table!.findAll(n => n.tag === 'tr').length, 3, 'the rule under it is not a row')
  // and the citations inside the cells are still buttons
  assert.equal(table!.findAll(n => n.attributes.get('class') === 'cite').length, 2)
  assert.equal(view.byId('wave-why')!.findAll(n => n.tag === 'p').length, 2, 'the prose around it is prose')
})

// A run has ten checks and nobody ordered ten essays: a place with no writing
// yet offers to ask for that one, and the request carries its measurements.
test('a check with nothing written offers to ask, one check at a time', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_loop.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  // as a project looks before anyone has written a word about the run
  view.send(payload('tb_uart_loop', false))
  const cards = view.byId('wave-rail')!.children.filter(c => c.attributes.get('class')?.includes('wave-place'))
  assert.ok(cards.every(card => card.findAll(n => n.attributes.get('class') === 'tag unwritten').length === 1),
    'every thumbnail says nobody has written about it')
  // …and opening one offers to ask, for that check alone
  cards[0].dispatch('click', {})
  const asks = view.byId('wave-why')!.findAll(n => n.attributes.get('class') === 'ask')
  assert.equal(asks.length, 1, 'the panel offers it')
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
  const message = payload('tb_uart_corner')
  view.send(message)
  const rail = view.byId('wave-rail')!
  // the thumbnail carries none of this; opening the place does
  assert.equal(rail.findAll(n => n.attributes.get('class') === 'part-name').length, 0)
  const at = message.view.markers.findIndex(m => (m.stimulus ?? []).length > 0)
  assert.ok(at >= 0, 'this report has a check whose driving statements were found')
  view.byId('wave-rail')!.children
    .filter(c => c.attributes.get('class')?.includes('wave-place'))[at].dispatch('click', {})
  const panel = view.byId('wave-why')!
  const names = panel.findAll(n => n.attributes.get('class') === 'part-name').map(n => n.textContent)
  assert.ok(names.includes('방식'), `the panel shows how it was driven — got ${names.join(', ')}`)
  assert.ok(names.includes('결과'))
  const steps = panel.findAll(n => n.attributes.get('class') === 'step').map(n => n.textContent)
  assert.ok(steps.length > 0 && steps.some(step => /\w+\(|=/.test(step)),
    `the driving statements are there — got ${steps.slice(0, 4).join(' | ')}`)
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

// Vivado shows whatever you dragged into the wave config, clock and all. This
// view opens on what a reader wants first and keeps the rest a button away —
// which is only defensible if the button exists.
test('the clock and the bench variables are off by default, and one click away', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_corner.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  view.send(payload('tb_uart_corner'))
  const named = () => view.byId('wave-labels')!.findAll(n => n.attributes.get('class')?.includes('name') === true)
    .map(n => n.textContent)
  const click = (label: string) => view.byId('toolbar')!.find(n => n.tag === 'button' && n.textContent === label)!.dispatch('click', {})

  assert.equal(named().includes('clk'), false, 'the clock is not what a reader wants first')
  assert.equal(named().includes('errors'), false, "nor is the bench's own counter")
  // …but a register whose name merely contains "clock" is hardware and is shown
  assert.ok(named().includes('clock_counter'), 'clock_counter is a register, not the clock')

  click('clk')
  assert.ok(named().includes('clk'), 'asked for, it appears')
  click('var')
  assert.ok(named().includes('errors') && named().includes('i'), "and so do the bench's variables")
  click('clk')
  assert.equal(named().includes('clk'), false, 'and it goes away again')
})

// The same argument covers the rows past the first screenful: the header counts
// them (20 / 33), so a reader who reads that and finds no way to see the other
// thirteen is looking at a bug, not at a decision.
test('the signals past the first screenful are a button away too', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_loop.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  const sent = payload('tb_uart_loop')
  const rest = sent.view.traces.filter(t => t.role === 'signal' && !t.primary).map(t => t.name)
  assert.ok(rest.length > 0, 'this report has more signals than one screenful')
  view.send(sent)
  const named = () => view.byId('wave-labels')!.findAll(n => n.attributes.get('class')?.includes('name') === true)
    .map(n => n.textContent)
  const click = (label: string) => view.byId('toolbar')!.find(n => n.tag === 'button' && n.textContent === label)!.dispatch('click', {})

  assert.equal(rest.some(name => named().includes(name)), false, 'they are not on screen to begin with')
  click('⋯')
  for (const name of rest) assert.ok(named().includes(name), `${name} is reachable`)
  click('⋯')
  assert.equal(rest.some(name => named().includes(name)), false, 'and the screenful comes back')
})

// The analysis is written in the same small syntax NodeGraph uses — lists,
// tables, `**bold**`, and KaTeX — because the same person writes both and
// should not have to remember which tool takes which.
test('the panel renders what an analysis is written in: lists, bold, code, math', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_corner.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  const sent = payload('tb_uart_corner')
  Object.assign(sent.view.markers.find(m => m.id === 'init')!, {
    explain: [
      '결과 — **모두 정의됐다**, `serial_in_d` 를 빼고.',
      '',
      '- 첫째, 리셋이 40 ns 에 풀렸다 (`uart_receiver.v:84`).',
      '- 둘째, 한 심볼은 $$\\frac{125\\,\\text{MHz}}{115200} = 1085$$ 클럭이다.',
      '',
      '한가운데는 $542$ 클럭이다.',
    ].join('\n'),
  })
  view.send(sent)
  view.byId('wave-rail')!.children.filter(c => c.attributes.get('class')?.includes('wave-place'))[0].dispatch('click', {})
  const panel = view.byId('wave-why')!

  const items = panel.findAll(n => n.tag === 'li')
  assert.equal(items.length, 2, 'a run of bullets is a list, not one long sentence')
  // the citation inside a bullet is still the way into the code
  assert.ok(items[0].findAll(n => n.attributes.get('class') === 'cite').length === 1)
  assert.equal(panel.findAll(n => n.tag === 'strong').length, 1, '**bold** is bold')
  assert.ok(panel.findAll(n => n.tag === 'code').length >= 1, '`code` is code, not stripped')
  const math = panel.findAll(n => n.attributes.get('class')?.startsWith('math') === true)
  assert.equal(math.length, 2, 'both the display formula and the inline one are rendered')
  assert.ok(math.some(n => n.attributes.get('class') === 'math block'), 'and $$…$$ stands on its own line')
})

// Nobody is told what a toolbar of symbols does, so the last one says.
test('the help button opens the guide, and right-click opens a signal', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_corner.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  view.send(payload('tb_uart_corner'))

  const help = view.byId('toolbar')!.find(n => n.tag === 'button' && n.textContent === '?')!
  assert.ok(help, 'the toolbar ends with a way to ask what it does')
  help.dispatch('click', {})
  assert.equal((view.posted.at(-1) as { type: string }).type, 'help')

  // …and a signal's own way into the code is the right button, on the row
  const rows = view.byId('wave-labels')!.children.filter(r => {
    const kind = r.attributes.get('class') ?? ''
    return kind.includes('wave-label') && !kind.includes('axis') && !kind.includes('group')
  })
  const row = rows.find(r => r.find(n => n.attributes.get('class')?.includes('to-code') === true))!
  row.dispatch('contextmenu', { preventDefault: () => {} })
  const asked = view.posted.at(-1) as { type: string; file: string; line: number }
  assert.equal(asked.type, 'openCode')
  assert.match(asked.file, /\.v$/)
})

// A check exists because the handout asked for something. The sentence is
// quoted in the analysis; the page it came from should be one click, into the
// same reader a schematic box opens.
test('a page of the brief is a link, and a stray rule is not drawn', { skip: !existsSync(BUNDLE) && 'run `npm run build -w rtlgraph`' }, async t => {
  if (!existsSync(join(DEMO, 'tb_uart_corner.waveform.json'))) return t.skip('demo/uart-p01 is not here')
  const view = await webview()
  const sent = payload('tb_uart_corner')
  Object.assign(sent.view.markers.find(m => m.id === 'init')!, {
    explain: '결과 — "data_out_ready : signal indicating that reception is possible"'
      + ' (PDF_P01_UART_Controller.pdf p.6)\n\n---\n',
  })
  view.send(sent)
  view.byId('wave-rail')!.children.filter(c => c.attributes.get('class')?.includes('wave-place'))[0].dispatch('click', {})
  const panel = view.byId('wave-why')!

  const brief = panel.find(n => n.attributes.get('class') === 'cite brief')!
  assert.ok(brief, 'the handout is a link like any other citation')
  assert.match(brief.textContent, /PDF_P01_UART_Controller\.pdf p\.6/)
  brief.dispatch('click', {})
  const asked = view.posted.at(-1) as { type: string; file: string; page: number; quote?: string }
  assert.equal(asked.type, 'openBrief')
  assert.equal(asked.page, 6)
  assert.match(asked.quote ?? '', /reception is possible/, 'and it carries the sentence, to highlight it')

  // the `---` the writer put between sections is a separator, not a dash to draw
  assert.equal(panel.findAll(n => n.textContent.trim() === '---').length, 0)
})
