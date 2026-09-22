// The waveform view. What it is for: moving between the places worth looking
// at — how the design came up, then each check the testbench printed — rather
// than scrolling a dump by hand looking for them.
//
// The host does the reading; this file only draws and navigates.

import type { Marker, Trace, WaveView, Words } from '@rtlgraph/wave'

/** Only the phrases that are plain strings reach a webview — see waveView.ts. */
type Said = Partial<Record<keyof Words, string>>

declare function acquireVsCodeApi(): { postMessage(message: unknown): void }
const vscode = acquireVsCodeApi()

const ROW = 26
const LABELS = 190
const AXIS = 22

let view: WaveView | undefined
let words: Said | undefined
const say = (key: keyof Words, fallback: string): string => words?.[key] ?? fallback
let from = 0
let to = 1
let active = 'init'
let cursor: number | undefined
/** The moment the hand is over, in the rail or the plot. */
let hot: number | undefined
/** The trace the hand is over. */
let hotTrace: string | undefined
/** Places whose written explanation is unfolded. */
const opened = new Set<string>()

// ── the document ──────────────────────────────────────────────────────────────
const toolbar = document.createElement('div')
toolbar.id = 'toolbar'
const title = document.createElement('span')
title.className = 'label'
const spacer = document.createElement('span')
spacer.className = 'spacer'
const buttons = document.createElement('span')
buttons.className = 'group'
const bar: { label: string; hint: keyof Words; fallback: string; run: () => void }[] = [
  { label: '⟨', hint: 'previousPlace', fallback: 'the place before this one (←)', run: () => step(-1) },
  { label: '⟩', hint: 'nextPlace', fallback: 'the next place (→)', run: () => step(1) },
  { label: '−', hint: 'zoomOut', fallback: 'zoom out', run: () => zoom(1.6) },
  { label: '+', hint: 'zoomIn', fallback: 'zoom in', run: () => zoom(1 / 1.6) },
  { label: '⇔', hint: 'wholeRun', fallback: 'the whole run', run: () => { from = 0; to = view?.end ?? 1; draw() } },
]
const barButtons = bar.map(item => {
  const button = document.createElement('button')
  button.textContent = item.label
  button.addEventListener('click', item.run)
  buttons.append(button)
  return button
})
const retitleBar = () => barButtons.forEach((button, i) => { button.title = say(bar[i].hint, bar[i].fallback) })
retitleBar()
toolbar.append(title, spacer, buttons)

const middle = document.createElement('div')
middle.id = 'middle'
const rail = document.createElement('div')
rail.id = 'wave-rail'
const canvas = document.createElement('div')
canvas.id = 'wave-canvas'
const labels = document.createElement('div')
labels.id = 'wave-labels'
const plot = document.createElement('div')
plot.id = 'wave-plot'
canvas.append(labels, plot)
middle.append(rail, canvas)
document.body.append(toolbar, middle)

const notice = document.createElement('div')
notice.id = 'notice'
notice.hidden = true
document.body.append(notice)

// ── drawing ───────────────────────────────────────────────────────────────────
const SI = [[1e15, 's'], [1e12, 'ms'], [1e9, 'µs'], [1e6, 'ns'], [1e3, 'ps']] as const

function atTime(time: number): string {
  const fs = time * (view?.tick ?? 1)
  for (const [size, unit] of SI) if (Math.abs(fs) >= size) return `${(fs / size).toFixed(3)} ${unit}`
  return `${fs.toFixed(0)} fs`
}

/** The value a trace held going into `time` — the same rule the report uses. */
function valueAt(trace: Trace, time: number): string | undefined {
  let held: string | undefined
  for (const [at, value] of trace.points) {
    if (at > time) break
    held = value
  }
  return held
}

function shown(value: string, width: number): string {
  if (width === 1) return value
  if (/[xzu]/i.test(value)) return value.includes('x') ? 'x' : value
  const n = Number.parseInt(value, 2)
  return Number.isNaN(n) ? value : `${n.toString(16).padStart(Math.ceil(width / 4), '0')}`
}

function draw(): void {
  if (!view) return
  const span = Math.max(to - from, 1)
  const width = Math.max(plot.clientWidth || 600, 200)
  const x = (time: number) => ((time - from) / span) * width

  title.textContent = `${atTime(from)} → ${atTime(to)}` +
    (view.omitted > 0 ? `  ·  ${view.traces.length} / ${view.traces.length + view.omitted}` : '')

  // the rail: where to go
  rail.replaceChildren(...view.markers.map(marker => {
    const item = document.createElement('div')
    item.className = `wave-place ${marker.kind}${marker.id === active ? ' active' : ''}`
    const head = document.createElement('div')
    head.className = 'what'
    head.textContent = marker.label
    const when = document.createElement('div')
    when.className = 'when'
    when.textContent = `${atTime(marker.from)} → ${atTime(marker.to)}`
    item.append(head, when)
    for (const note of marker.notes) {
      const line = document.createElement('div')
      line.className = 'note'
      line.textContent = note
      item.append(line)
    }
    // Where to look, inside the stretch: each instant is a button that puts the
    // cursor on it, because "the transfer" is a moment, not a paragraph.
    if (marker.focus.length > 0) {
      const moments = document.createElement('div')
      moments.className = 'moments'
      for (const [i, moment] of numbered(marker).entries()) {
        const button = document.createElement('button')
        button.className = `moment${hot === moment.at ? ' hot' : ''}`
        const badge = document.createElement('span')
        badge.className = 'badge'
        badge.textContent = String(i + 1)
        const said = document.createElement('span')
        said.textContent = `${atTime(moment.at)} · ${moment.what}`
        button.append(badge, said)
        button.title = moment.signal ?? ''
        button.addEventListener('click', event => {
          event.stopPropagation()
          look(marker, moment.at)
        })
        // Pointing at one is enough to find it: the line it marks lights up
        // without the view moving, so a hand can sweep the list and watch.
        button.addEventListener('mouseenter', () => {
          if (marker.id !== active) show(marker)
          hot = moment.at
          if (moment.signal) hotTrace = moment.signal
          draw()
        })
        button.addEventListener('mouseleave', () => { hot = undefined; hotTrace = undefined; draw() })
        moments.append(button)
      }
      item.append(moments)
    }
    // And where it came from: the line of the testbench that printed it.
    if (marker.source) {
      const code = document.createElement('button')
      code.className = 'source'
      code.textContent = `${marker.source.file.split('/').pop()}:${marker.source.line}`
      code.title = marker.source.text
      code.addEventListener('click', event => {
        event.stopPropagation()
        vscode.postMessage({ type: 'openCode', file: marker.source!.file, line: marker.source!.line })
      })
      item.append(code)
    }
    // Nobody has written about this one yet: offer to ask, for this check
    // alone. A run has ten of them and explaining all ten at once is a long
    // job nobody ordered.
    if (!marker.explain) {
      const ask = document.createElement('button')
      ask.className = 'ask'
      ask.textContent = `? ${say('why', 'why it passed')}`
      ask.title = say('askWhy', 'ask why')
      ask.addEventListener('click', event => {
        event.stopPropagation()
        vscode.postMessage({ type: 'askAnalysis', id: marker.id })
      })
      item.append(ask)
    }
    // What an agent made of it, folded away until asked for: the measurements
    // are the claim, this is the argument, and a reader wants one at a time.
    if (marker.explain) {
      const toggle = document.createElement('button')
      toggle.className = 'why'
      toggle.textContent = `${opened.has(marker.id) ? '▾' : '▸'} ${say('why', 'why it passed')}`
      toggle.addEventListener('click', event => {
        event.stopPropagation()
        if (opened.has(marker.id)) opened.delete(marker.id)
        else opened.add(marker.id)
        draw()
      })
      item.append(toggle)
      if (opened.has(marker.id)) item.append(prose(marker.explain))
    }
    item.addEventListener('click', () => show(marker))
    return item
  }))

  // Sections of the analysis that belong to no single check — what is still
  // unproven, usually. They are the writer's, so they are not thrown away.
  for (const note of view.notes ?? []) {
    const block = document.createElement('div')
    block.className = 'wave-note'
    const head = document.createElement('div')
    head.className = 'what'
    head.textContent = note.heading
    block.append(head, prose(note.body))
    rail.append(block)
  }

  // the labels, with the value under the cursor when there is one
  const watched = new Set(view.markers.find(m => m.id === active)?.watch ?? [])
  labels.replaceChildren(...[axisLabel(), ...view.traces.map(trace => {
    const row = document.createElement('div')
    row.className = `wave-label${trace.bench ? ' bench' : ''}` +
      (watched.size > 0 && !watched.has(trace.path) ? ' aside' : '') +
      (hotTrace === trace.path ? ' hot' : '')
    row.addEventListener('mouseenter', () => { hotTrace = trace.path; draw() })
    row.addEventListener('mouseleave', () => { hotTrace = undefined; draw() })
    // The trace's own way back to the code: not every instant, but the line
    // that drives this signal, which is the jump a reader actually wants.
    const name = document.createElement(trace.source ? 'button' : 'span')
    name.className = trace.source ? 'name to-code' : 'name'
    name.textContent = trace.name
    name.title = trace.source ? `${trace.source.file}:${trace.source.line}  ${trace.source.text}` : trace.path
    if (trace.source) {
      name.addEventListener('click', () => vscode.postMessage({
        type: 'openCode', file: trace.source!.file, line: trace.source!.line,
      }))
    }
    row.append(name)
    if (cursor !== undefined) {
      const value = document.createElement('span')
      value.className = 'value'
      const held = valueAt(trace, cursor)
      value.textContent = held === undefined ? '—' : shown(held, trace.width)
      row.append(value)
    }
    return row
  })])

  // the traces
  const height = AXIS + view.traces.length * ROW
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  const add = (name: string, attrs: Record<string, string | number>, text?: string) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name)
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
    if (text !== undefined) node.textContent = text
    svg.append(node)
    return node
  }

  // time axis: five or so round marks
  const stepSize = niceStep(span / 5)
  for (let t = Math.ceil(from / stepSize) * stepSize; t <= to; t += stepSize) {
    add('line', { x1: x(t), y1: AXIS - 6, x2: x(t), y2: height, class: 'wave-grid' })
    add('text', { x: x(t) + 3, y: 12, class: 'wave-tick' }, atTime(t))
  }

  view.traces.forEach((trace, row) => {
    const top = AXIS + row * ROW + 4
    const bottom = AXIS + row * ROW + ROW - 6
    if (hotTrace === trace.path) {
      add('rect', { x: 0, y: AXIS + row * ROW, width, height: ROW, class: 'wave-row-hot' })
    }
    add('line', { x1: 0, y1: AXIS + row * ROW, x2: width, y2: AXIS + row * ROW, class: 'wave-row' })
    const points = trace.points
    let previous = valueAt(trace, from) ?? 'x'
    let startedAt = from
    const segment = (value: string, a: number, b: number) => {
      if (b <= a) return
      const unknown = /[xzu]/i.test(value)
      const lit = hotTrace === trace.path ? ' hot' : ''
      if (trace.width === 1 && !unknown) {
        const y = value === '1' ? top : bottom
        add('line', { x1: a, y1: y, x2: b, y2: y, class: `wave-line${lit}` })
        return
      }
      if (unknown) {
        add('rect', { x: a, y: top, width: Math.max(b - a, 1), height: bottom - top, class: 'wave-unknown' })
        return
      }
      // a bus: a band with its value written in, when there is room
      add('path', {
        d: `M ${a} ${(top + bottom) / 2} L ${a + 3} ${top} L ${b - 3} ${top} L ${b} ${(top + bottom) / 2} L ${b - 3} ${bottom} L ${a + 3} ${bottom} Z`,
        class: 'wave-bus',
      })
      if (b - a > 34) add('text', { x: (a + b) / 2, y: bottom - 3, class: 'wave-value' }, shown(value, trace.width))
    }
    for (const [at, value] of points) {
      if (at <= from) continue
      if (at > to) break
      segment(previous, x(startedAt), x(at))
      if (trace.width === 1 && !/[xzu]/i.test(previous) && !/[xzu]/i.test(value)) {
        add('line', { x1: x(at), y1: top, x2: x(at), y2: bottom, class: `wave-line${hotTrace === trace.path ? ' hot' : ''}` })
      }
      previous = value
      startedAt = at
    }
    segment(previous, x(startedAt), width)
  })

  // The stretch this place covers, and the instants inside it worth a look.
  const place = view.markers.find(m => m.id === active)
  if (place) {
    if (place.from > from || place.to < to) {
      add('rect', { x: x(place.from), y: AXIS, width: Math.max(x(place.to) - x(place.from), 1), height: height - AXIS, class: 'wave-window' })
    }
    // A number, not a sentence. Four instants inside sixty nanoseconds cannot
    // all carry their wording on the plot; they can all carry a badge, and the
    // same number sits beside the words in the rail. Pointing at one — here or
    // there — is what spells it out.
    const lanes: number[] = []
    for (const [i, moment] of numbered(place).entries()) {
      if (moment.at < from || moment.at > to) continue
      const lit = hot === moment.at
      const at = x(moment.at)
      add('line', { x1: at, y1: AXIS, x2: at, y2: height, class: `wave-moment${lit ? ' hot' : ''}` })

      const size = 15
      // An instant at 0 sits on the very edge; the badge is nudged inside so it
      // can be read and clicked, while its line stays where the instant is.
      const badgeX = Math.min(Math.max(at - size / 2, 0), Math.max(width - size, 0))
      let lane = lanes.findIndex(end => end < badgeX)
      if (lane < 0) lane = Math.min(lanes.length, 5)
      lanes[lane] = badgeX + size + 2
      const y = AXIS + 3 + lane * (size + 2)
      const badge = add('rect', { x: badgeX, y, width: size, height: size, rx: 4, class: `wave-badge${lit ? ' hot' : ''}` })
      const number = add('text', { x: badgeX + size / 2, y: y + 11, class: `wave-badge-number${lit ? ' hot' : ''}` }, String(i + 1))
      for (const node of [badge, number]) {
        node.addEventListener('mouseenter', () => {
          hot = moment.at
          if (moment.signal) hotTrace = moment.signal
          draw()
        })
        node.addEventListener('mouseleave', () => { hot = undefined; hotTrace = undefined; draw() })
      }
      // No words here, ever. Text that appears under the hand moves the eye to
      // the wrong place and covers the very trace being pointed at; the wording
      // lives in the rail, where the matching entry lights up instead.
    }
  }

  if (cursor !== undefined && cursor >= from && cursor <= to) {
    add('line', { x1: x(cursor), y1: 0, x2: x(cursor), y2: height, class: 'wave-cursor' })
  }
  plot.replaceChildren(svg)
}

/**
 * Prose from the analysis, with its citations made into buttons. `uart_receiver.v:47`
 * is the whole point of asking for line numbers, so it opens the line.
 */
const CITATION = /([\w./-]+\.(?:v|sv|json|md)):(\d+)(?:-\d+)?/g

function prose(text: string): HTMLElement {
  const block = document.createElement('div')
  block.className = 'prose'
  for (const paragraph of text.split(/\n{2,}/)) {
    const line = document.createElement('p')
    let at = 0
    for (const match of paragraph.matchAll(CITATION)) {
      const before = paragraph.slice(at, match.index)
      if (before) {
        const span = document.createElement('span')
        span.textContent = before.replace(/[`*]/g, '')
        line.append(span)
      }
      const link = document.createElement('button')
      link.className = 'cite'
      link.textContent = match[0]
      link.addEventListener('click', event => {
        event.stopPropagation()
        vscode.postMessage({ type: 'openCode', file: match[1], line: Number(match[2]) })
      })
      line.append(link)
      at = match.index + match[0].length
    }
    const rest = paragraph.slice(at)
    if (rest) {
      const span = document.createElement('span')
      span.textContent = rest.replace(/[`*]/g, '')
      line.append(span)
    }
    block.append(line)
  }
  return block
}

/** A place's instants in time order — the order their badges are numbered in. */
function numbered(place: Marker): Marker['focus'] {
  return [...place.focus].sort((a, b) => a.at - b.at)
}

function axisLabel(): HTMLElement {
  const row = document.createElement('div')
  row.className = 'wave-label axis'
  row.textContent = cursor === undefined ? say('hoverForValues', 'hover for values') : atTime(cursor)
  return row
}

function niceStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(rough, 1)))
  for (const size of [1, 2, 5, 10]) if (rough <= size * power) return size * power
  return 10 * power
}

// ── moving about ──────────────────────────────────────────────────────────────
function show(marker: Marker): void {
  const pad = Math.max((marker.to - marker.from) * 0.15, 1)
  from = Math.max(marker.from - pad, 0)
  to = Math.min(marker.to + pad, view?.end ?? marker.to + pad)
  if (to <= from) to = from + 1
  active = marker.id
  draw()
}

/** The same stretch, with the cursor parked on one instant inside it. */
function look(marker: Marker, at: number): void {
  show(marker)
  cursor = at
  draw()
}

function step(by: number): void {
  if (!view) return
  const at = view.markers.findIndex(m => m.id === active)
  const next = view.markers[Math.min(Math.max(at + by, 0), view.markers.length - 1)]
  if (next) show(next)
}

/**
 * Zoom about the middle — except at an edge of the run, where the edge is what
 * you are holding on to. Looking at the last frame and zooming out to see how
 * it got there should keep the last frame on screen, not slide it off the right
 * while the view "grows" around a point in the middle.
 */
function zoom(by: number): void {
  const end = view?.end ?? to
  const span = Math.max((to - from) * by, 1)
  const atStart = from <= 0
  const atEnd = to >= end
  if (atEnd && !atStart) {
    to = end
    from = Math.max(end - span, 0)
  } else if (atStart) {
    // Including the whole run: time reads left to right, so zooming in on it
    // keeps the start rather than drifting away from both ends at once.
    from = 0
    to = Math.min(span, end)
  } else {
    const middleTime = (from + to) / 2
    from = Math.max(middleTime - span / 2, 0)
    to = Math.min(middleTime + span / 2, end)
  }
  draw()
}

plot.addEventListener('mousemove', event => {
  if (!view) return
  const box = plot.getBoundingClientRect()
  cursor = from + ((event.clientX - box.left) / Math.max(box.width, 1)) * (to - from)
  draw()
})
plot.addEventListener('mouseleave', () => { cursor = undefined; draw() })
plot.addEventListener('wheel', event => {
  event.preventDefault()
  zoom(event.deltaY > 0 ? 1.2 : 1 / 1.2)
}, { passive: false })

let dragging: { x: number; from: number; to: number } | undefined
plot.addEventListener('mousedown', event => { dragging = { x: event.clientX, from, to } })
window.addEventListener('mouseup', () => { dragging = undefined })
window.addEventListener('mousemove', event => {
  if (!dragging || !view) return
  const box = plot.getBoundingClientRect()
  const moved = ((event.clientX - dragging.x) / Math.max(box.width, 1)) * (dragging.to - dragging.from)
  from = Math.max(dragging.from - moved, 0)
  to = from + (dragging.to - dragging.from)
  draw()
})
window.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') step(-1)
  else if (event.key === 'ArrowRight') step(1)
  else return
  event.preventDefault()
})
window.addEventListener('resize', () => draw())

window.addEventListener('message', event => {
  const message = event.data as { type?: string; view?: WaveView; words?: Said; message?: string }
  if (message?.type === 'wave' && message.view) {
    view = message.view
    words = message.words
    retitleBar()
    notice.hidden = true
    const first = view.markers[0]
    if (first) show(first)
    else { from = 0; to = view.end; draw() }
  } else if (message?.type === 'waveError') {
    notice.hidden = false
    notice.textContent = message.message ?? 'nothing to draw'
  }
})

vscode.postMessage({ type: 'ready' })
