// What a waveform viewer needs, worked out before any pixels exist.
//
// A dump holds every signal in the design; a screen holds about twenty rows.
// Choosing which twenty is the whole design of this view, and it is done here,
// away from the webview, so it can be argued with in a test: the bench's own
// ports first (they are what a check talks about), then the state the design
// keeps, and never the bookkeeping a simulator dumps alongside.

import { seriesOf, type Waveform } from './vcd.ts'
import { asValue, type WaveFacts, type WindowFacts } from './facts.ts'
import { wordsIn, type Lang } from './words.ts'

export interface Trace {
  path: string
  /** The name on its own, for a narrow label column. */
  name: string
  width: number
  /** True for the testbench's own signals — the ones a check drives or reads. */
  bench: boolean
  /** `[time, value]`, in order, starting with the value at time 0. */
  points: readonly (readonly [number, string])[]
  /** The line of RTL that drives it, when one was found. */
  source?: { file: string; line: number; text: string }
}

/** A place worth jumping to: how the design came up, or a check that passed. */
export interface Marker {
  id: string
  label: string
  from: number
  to: number
  kind: 'init' | 'check'
  /** A line or two of what was measured here, already worded. */
  notes: readonly string[]
  /** The testbench line that printed this, relative to the report. */
  source?: { file: string; line: number; text: string }
  /** Instants worth looking at inside the stretch. */
  focus: readonly { at: number; what: string; signal?: string }[]
  /** Signals that moved here — what this check is actually about. */
  watch: readonly string[]
  /** What an agent wrote about this place, if anyone has written it. */
  explain?: string
  /** The measurements behind the notes, for composing a request about them. */
  did?: WindowFacts['did']
}

export interface WaveView {
  tick: number
  /** Sections of the analysis that belong to no particular place. */
  notes?: readonly { heading: string; body: string }[]
  timescale: string
  end: number
  traces: readonly Trace[]
  markers: readonly Marker[]
  /** Paths the dump has that did not make the cut, so the view can say so. */
  omitted: number
}

const CLOCK = /(^|[_/])(clk|clock)([_/]|$)/i
// What a dump calls a signal when it is not one: a testbench's counters and
// flags are declared `integer`/`real`/`time`, and drawing them as if they were
// wires fills the screen with loop variables.
const NOT_HARDWARE = new Set(['parameter', 'integer', 'real', 'time', 'realtime', 'string', 'event'])

/**
 * Traces to draw, best first. A clock is dropped: at any zoom that shows a whole
 * frame it is a grey blur, and its period is in the measurements already.
 */
function chooseTraces(wave: Waveform, facts: WaveFacts, limit: number): { traces: Trace[]; omitted: number } {
  const root = wave.signals[0]?.scope[0]
  // One row per net. A port appears once in the bench and again inside every
  // module it is wired to; the dump gives them all the same id, so the
  // shallowest path stands for the net and the rest are dropped.
  const seen = new Set<string>()
  const candidates = [...wave.signals]
    .sort((a, b) => a.scope.length - b.scope.length || a.path.localeCompare(b.path))
    .filter(s => {
      if (!s.hardware || NOT_HARDWARE.has(s.kind) || CLOCK.test(s.name)) return false
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    })
  const rank = (path: string, depth: number) => {
    const inHandshake = facts.handshakes.some(h => h.valid === path || h.ready === path)
    const isReset = facts.reset?.path === path
    if (inHandshake) return 0          // what a check is usually about
    if (isReset) return 1              // and what everything hangs off
    if (depth === 1) return 2          // the bench's other ports
    return 3 + depth                   // then the design, shallowest first
  }
  const ordered = [...candidates].sort((a, b) => {
    const byRank = rank(a.path, a.scope.length) - rank(b.path, b.scope.length)
    if (byRank !== 0) return byRank
    return a.path.localeCompare(b.path)
  })
  // A port is a different net on each side of a boundary — the dump gives
  // those different ids — but they carry the same values, so drawing both is
  // drawing the same picture twice. Identical histories collapse to one row.
  const drawn = new Map<string, Trace>()
  for (const signal of ordered) {
    const points = seriesOf(wave, signal.path).map(c => [c.time, c.value] as const)
    const history = points.map(([time, value]) => `${time}=${value}`).join(',')
    if (drawn.has(history)) continue
    drawn.set(history, {
      path: signal.path,
      name: signal.name,
      width: signal.width,
      bench: signal.scope.length === 1 && signal.scope[0] === root,
      points,
    })
  }
  const distinct = [...drawn.values()]
  // A design can hold two `bit_counter`s — one per module — and two rows with
  // the same label are two rows nobody can tell apart. Whoever shares a name
  // wears the scope that distinguishes it.
  const times = new Map<string, number>()
  for (const trace of distinct) times.set(trace.name, (times.get(trace.name) ?? 0) + 1)
  const labelled = distinct.map(trace => times.get(trace.name)! > 1
    ? { ...trace, name: trace.path.split('/').slice(-2).join('/') }
    : trace)
  return { traces: labelled.slice(0, limit), omitted: Math.max(labelled.length - limit, 0) }
}

/** How the design came up, and then one marker per check the bench printed. */
function markersFor(facts: WaveFacts, traces: readonly Trace[], lang: Lang): Marker[] {
  const w = wordsIn(lang)
  const at = facts.reset?.releasedAt
  const settled = facts.init.settledAt
  // Coming up ends when the last thing that was going to be defined is defined:
  // the reset release on its own is too early to see the design do anything.
  const defined = facts.init.unknownAfterReset.map(u => u.until).filter((t): t is number => t !== undefined)
  // …and then far enough to see the design do the first thing it does. Ending at
  // the reset release frames a flat 40 ns of a 4 µs run, which reads as a broken
  // view rather than as an uneventful one.
  const after = at ?? 0
  const firstMove = Math.min(...traces
    .map(t => t.points.find(([time]) => time > after + 1)?.[0] ?? Infinity))
  const settledBy = Math.max(settled ?? 0, after, ...defined)
  const initTo = Math.max(
    settledBy,
    Number.isFinite(firstMove) ? firstMove : 0,
    Math.round(facts.end / 20),
  ) || Math.round(facts.end / 20)
  const notes: string[] = []
  if (at !== undefined) notes.push(w.resetReleased(facts.reset?.path ?? '', String(at)).replace(/[`*]/g, ''))
  notes.push(facts.init.unknownAfterReset.length === 0
    ? w.nothingLeftUndefined
    : w.stillUndefined + ` ${facts.init.unknownAfterReset.map(u => u.path.split('/').pop()).join(', ')}`)

  const markers: Marker[] = [{
    id: 'init',
    label: w.comingUp,
    from: 0,
    to: initTo,
    kind: 'init',
    notes,
    focus: at !== undefined ? [{ at, what: w.focusResetReleased }] : [],
    watch: facts.init.unknownAfterReset.map(u => u.path),
  }]
  for (const [i, window] of facts.windows.entries()) {
    const taken = window.transfers.filter(t => t.taken !== undefined)
    markers.push({
      id: `check-${i + 1}`,
      label: window.label,
      from: window.from,
      to: window.to,
      kind: 'check',
      notes: [
        ...(taken.length > 0 ? [w.transfersTaken(taken.length, taken.map(t => t.waited).join(', '))] : []),
        ...(window.reset ? [w.reset_in_stretch] : []),
        // What the wires did here, in words: the thin version of this said
        // "busiest: clk, sample", which is not a reading of anything.
        ...window.did.map(entry => {
          const name = entry.path.split('/').slice(-1)[0]
          const from = asValue(entry.from, entry.width)
          const to = asValue(entry.to, entry.width)
          if (entry.width === 1 && (entry.pulses ?? 0) > 1) return w.didPulse(name, entry.pulses!)
          if (from === to) return w.didHold(name, to)
          return w.didChange(name, from, to, entry.changes, entry.counted)
        }),
      ],
      ...(window.source ? { source: window.source } : {}),
      did: window.did,
      focus: window.focus,
      watch: window.moved.slice(0, 6).map(m => m.path),
    })
  }
  return markers
}

export function buildView(wave: Waveform, facts: WaveFacts, limit = 20, lang: Lang = 'en'): WaveView {
  const { traces, omitted } = chooseTraces(wave, facts, limit)
  return {
    tick: wave.tick,
    timescale: wave.timescale,
    end: wave.end,
    traces,
    markers: markersFor(facts, traces, lang),
    omitted,
  }
}
