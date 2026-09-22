// What a waveform says on its own, before anyone explains it.
//
// Every number here is measured, never inferred from what the design is
// supposed to do: the clock's period is the distance between two edges that
// really happened, a handshake's wait is the clocks that really passed. The
// "why" belongs to whoever reads this — the `waveform` prompt asks an agent for
// it, against the code — and keeping the two apart is the point. A measurement
// that guesses is a measurement nobody can check.

import { edgesOf, levelAt, levelBefore, seriesOf, type WaveChange, type Waveform } from './vcd.ts'
import { wordsIn, type Lang } from './words.ts'

export interface ClockFacts {
  path: string
  /** Rising edges seen. */
  edges: number
  /** The commonest gap between edges, in dump ticks — the period it runs at. */
  period?: number
  /** Every distinct gap seen, shortest first. */
  periods: readonly number[]
  /** True when more than one gap appears: a stopped clock, or a real wobble. */
  jitter: boolean
  hertz?: number
}

export interface DriveFacts {
  path: string
  changes: number
  /** Changes that landed exactly on a clock's active edge. */
  onEdge: number
  /** The first few of those, so a reader can go and look. */
  onEdgeAt: readonly number[]
}

export interface HandshakeFacts {
  valid: string
  ready: string
  /** One entry per time valid rose. */
  transfers: readonly {
    raised: number
    /** When both were high on an active edge — the transfer itself. */
    taken?: number
    /** Clocks between valid rising and the transfer. */
    waited?: number
    /** Clocks valid stayed up. */
    held?: number
  }[]
}

export interface SignalFacts {
  path: string
  kind: string
  width: number
  changes: number
  /** First and last time it moved. */
  first?: number
  last?: number
  /** When it first held x or z after the reset was released. */
  unknownAt?: number
}

export interface InitFacts {
  /** Signals holding x or z at time 0 — before anything has run. */
  unknownAtZero: readonly string[]
  /** Signals still holding x or z once the reset was released. */
  unknownAfterReset: readonly { path: string; until?: number }[]
  /** The first time nothing in the dump holds x or z, if that ever happens. */
  settledAt?: number
  /** Clocks between the reset being released and everything being defined. */
  settledAfter?: number
}

/** One stretch of the run, bounded by what the testbench printed. */
export interface WindowFacts {
  /** The bench line that closes this stretch — the check that passed. */
  label: string
  from: number
  to: number
  /** Where in the testbench that line was printed, when it could be found. */
  source?: { file: string; line: number; text: string }
  /** The statements that drove this stretch, from the bench's own source. */
  stimulus?: readonly { line: number; text: string }[]
  /** The instants worth looking at, and why — a transfer, a reset, an edge. */
  focus: readonly { at: number; what: string; signal?: string }[]
  /** Handshake transfers that completed inside it. */
  transfers: readonly { valid: string; raised: number; taken?: number; waited?: number }[]
  /** What moved, busiest first — the signals worth looking at for this check. */
  moved: readonly { path: string; changes: number }[]
  /**
   * What each of them did, in the plainest terms the dump can support: what it
   * held going in, what it held at the end, how many times it moved, and — for
   * a one-bit signal — how many pulses that was. "busiest: clk, sample" says
   * nothing; "sample pulsed 14 times, bit_counter went 10 → 0" is the check.
   */
  did: readonly {
    path: string
    /** So a reader can be shown `3c` rather than `00111100`. */
    width: number
    /** The value going into the stretch, and the one it ends on. */
    from?: string
    to?: string
    changes: number
    /** Rising edges, for a one-bit signal. */
    pulses?: number
    /** True when the values only ever decrease (or only increase) — a counter. */
    counted?: 'up' | 'down'
  }[]
  /** Was the reset asserted at any point in this stretch? */
  reset: boolean
}

export interface WaveFacts {
  timescale: string
  tick: number
  end: number
  signals: number
  changes: number
  clock?: ClockFacts
  reset?: { path: string; releasedAt?: number }
  init: InitFacts
  drives: readonly DriveFacts[]
  handshakes: readonly HandshakeFacts[]
  /** One per timestamped line the bench printed; empty when it printed no times. */
  windows: readonly WindowFacts[]
  /** Signals that never moved — a stuck net, or simply unused. */
  idle: readonly string[]
  unknown: readonly SignalFacts[]
  busiest: readonly SignalFacts[]
}

/** A bench's own words, with the time it printed them (`[%0t] ok: …`). */
export interface BenchLine {
  time?: number
  text: string
}

const CLOCK = /(^|[_/])(clk|clock)([_/]|$)/i
const RESET = /(^|[_/])(reset|rst|rst_n|resetn)([_/]|$)/i

/** Signals of the dump's outermost scope — the testbench's own. */
function topScope(wave: Waveform): string[] {
  const root = wave.signals[0]?.scope[0]
  return wave.signals.filter(s => s.scope.length === 1 && s.scope[0] === root).map(s => s.path)
}

const UNKNOWN = /[xzu]/i

function factsFor(wave: Waveform, path: string, resetReleased: number | undefined): SignalFacts {
  const signal = wave.signals.find(s => s.path === path)!
  const series = seriesOf(wave, path)
  // A signal that was x at time 0 and never moved is still x now: ask what it
  // *held* when the reset let go, not only whether it changed to x later.
  const at = resetReleased ?? 0
  const held = levelAt(series, at)
  const unknown = held !== undefined && UNKNOWN.test(held)
    ? { time: at }
    : series.find(c => UNKNOWN.test(c.value) && c.time >= at)
  return {
    path,
    kind: signal.kind,
    width: signal.width,
    changes: series.length,
    ...(series.length > 0 ? { first: series[0].time, last: series[series.length - 1].time } : {}),
    ...(unknown ? { unknownAt: unknown.time } : {}),
  }
}

function clockFacts(wave: Waveform): ClockFacts | undefined {
  const candidates = wave.signals.filter(s => s.width === 1 && CLOCK.test(s.name))
  if (candidates.length === 0) return undefined
  // The one that toggles most is the clock the design actually runs on.
  const best = candidates
    .map(s => ({ path: s.path, series: seriesOf(wave, s.path) }))
    .sort((a, b) => b.series.length - a.series.length)[0]
  const rises = edgesOf(best.series, '1')
  const gaps = rises.slice(1).map((time, i) => time - rises[i])
  const periods = [...new Set(gaps)].sort((a, b) => a - b)
  // The commonest gap is the period it runs at; an odd one out is usually a
  // clock held through reset, which is worth saying but is not the period.
  const counted = new Map<number, number>()
  for (const gap of gaps) counted.set(gap, (counted.get(gap) ?? 0) + 1)
  const period = [...counted].sort((a, b) => b[1] - a[1])[0]?.[0]
  return {
    path: best.path,
    edges: rises.length,
    ...(period !== undefined ? { period, hertz: 1e15 / (period * wave.tick) } : {}),
    periods,
    jitter: periods.length > 1,
  }
}

function resetFacts(wave: Waveform): { path: string; releasedAt?: number } | undefined {
  const signal = wave.signals.find(s => s.width === 1 && RESET.test(s.name) && s.scope.length === 1)
  if (!signal) return undefined
  const series = seriesOf(wave, signal.path)
  // Active-high is the common case here; an active-low reset releases on the 1.
  const low = signal.name.endsWith('_n') || signal.name.endsWith('n')
  const released = edgesOf(series, low ? '1' : '0')[0]
  return { path: signal.path, ...(released !== undefined ? { releasedAt: released } : {}) }
}

/**
 * Inputs the bench drives, and whether any of them moved at the instant the
 * design samples. A bench is asked to drive on the opposite edge for a reason:
 * a signal that changes on the active edge is a race, and which side wins is
 * the simulator's business rather than the design's.
 */
function driveFacts(wave: Waveform, clock: ClockFacts | undefined): DriveFacts[] {
  if (!clock) return []
  const rises = new Set(edgesOf(seriesOf(wave, clock.path), '1'))
  const out: DriveFacts[] = []
  for (const path of topScope(wave)) {
    const signal = wave.signals.find(s => s.path === path)!
    // Only what the bench itself drives: a `reg` in its own scope. Registers
    // inside the design change on the active edge by definition.
    if (signal.kind !== 'reg' || path === clock.path) continue
    const series = seriesOf(wave, path)
    const onEdge = series.filter(c => rises.has(c.time) && c.time > 0)
    out.push({ path, changes: series.length, onEdge: onEdge.length, onEdgeAt: onEdge.slice(0, 5).map(c => c.time) })
  }
  return out
}

/**
 * valid/ready pairs, found by name: `data_out_valid` goes with `data_out_ready`.
 * A transfer is the active edge where both are high — that is when the receiver
 * takes it, and the wait before it is what the producer had to hold for.
 */
function handshakeFacts(wave: Waveform, clock: ClockFacts | undefined): HandshakeFacts[] {
  if (!clock) return []
  const rises = edgesOf(seriesOf(wave, clock.path), '1')
  const period = clock.period ?? 1
  const out: HandshakeFacts[] = []
  for (const signal of wave.signals) {
    if (!signal.name.endsWith('_valid') || signal.scope.length !== 1) continue
    const base = signal.name.slice(0, -'_valid'.length)
    const readyPath = [...signal.scope, `${base}_ready`].join('/')
    if (!wave.signals.some(s => s.path === readyPath)) continue
    const valid = seriesOf(wave, signal.path)
    const ready = seriesOf(wave, readyPath)
    const transfers = edgesOf(valid, '1').map(raised => {
      const fell = valid.find(c => c.time > raised && c.value === '0')?.time
      // What both sides were holding as the edge arrived — see levelBefore.
      const taken = rises.find(t => t > raised && levelBefore(valid, t) === '1' && levelBefore(ready, t) === '1')
      return {
        raised,
        ...(taken !== undefined ? { taken, waited: Math.round((taken - raised) / period) } : {}),
        ...(fell !== undefined ? { held: Math.round((fell - raised) / period) } : {}),
      }
    })
    out.push({ valid: signal.path, ready: readyPath, transfers })
  }
  return out
}

/**
 * How the design comes up. This is the half of a waveform a passing testbench
 * says least about: a bench that only checks outputs will happily pass while a
 * register spends the first microsecond undefined, and "it works after a reset"
 * is a different claim from "it is defined after a reset".
 */
function initFacts(wave: Waveform, all: readonly SignalFacts[], released: number | undefined): InitFacts {
  const paths = all.map(s => s.path)
  const atZero = paths.filter(path => {
    const held = levelAt(seriesOf(wave, path), 0)
    return held !== undefined && UNKNOWN.test(held)
  })
  const afterReset = all.filter(s => s.unknownAt !== undefined).map(s => {
    const series = seriesOf(wave, s.path)
    const defined = series.find(c => c.time >= s.unknownAt! && !UNKNOWN.test(c.value))
    return { path: s.path, ...(defined ? { until: defined.time } : {}) }
  })
  // The first moment nothing anywhere is x or z.
  let settledAt: number | undefined
  if (afterReset.length > 0 && afterReset.every(u => u.until !== undefined)) {
    settledAt = Math.max(...afterReset.map(u => u.until!))
  } else if (afterReset.length === 0) {
    settledAt = released ?? 0
  }
  return {
    unknownAtZero: atZero,
    unknownAfterReset: afterReset,
    ...(settledAt !== undefined ? { settledAt } : {}),
    ...(settledAt !== undefined && released !== undefined ? { settledAfter: settledAt - released } : {}),
  }
}

/**
 * The run cut into stretches, one per line the bench printed with a time. A
 * check that passed is a claim; the stretch before it is the evidence, and
 * this is what pairs the two so a reader can ask "why did that pass?" of a
 * bounded piece of waveform rather than of the whole run.
 */
function windowFacts(wave: Waveform, bench: readonly BenchLine[], facts: {
  handshakes: readonly HandshakeFacts[]
  reset?: { path: string }
  clockPeriod?: number
}, lang: Lang = 'en'): WindowFacts[] {
  const stamped = bench.filter(b => b.time !== undefined) as { time: number; text: string }[]
  if (stamped.length === 0) return []
  const reset = facts.reset ? seriesOf(wave, facts.reset.path) : []
  const windows: WindowFacts[] = []
  let from = 0
  for (const line of stamped) {
    const to = line.time
    const moved = new Map<string, number>()
    for (const change of wave.changes) {
      if (change.time < from || change.time > to) continue
      const signal = wave.signals.find(s => s.id === change.id)
      if (!signal || signal.kind === 'parameter') continue
      moved.set(signal.path, (moved.get(signal.path) ?? 0) + 1)
    }
    // What each signal did across the stretch, not merely that it was busy.
    // The clock is not news and a bench's loop counter is not hardware.
    const did = [...moved]
      .filter(([path]) => {
        const signal = wave.signals.find(sig => sig.path === path)
        return signal?.hardware === true && signal.kind !== 'parameter'
          && signal.kind !== 'integer' && !CLOCK.test(signal.name)
      })
      .sort((a, b) => b[1] - a[1])
      .map(([path, changes]) => {
        const whole = seriesOf(wave, path)
        const inside = whole.filter(c => c.time > from && c.time <= to)
        const width = wave.signals.find(sig => sig.path === path)?.width ?? 1
        const enter = levelBefore(whole, from + 1)
        const leave = levelAt(whole, to)
        const numbers = inside.map(c => (/[xzu]/i.test(c.value) ? NaN : Number.parseInt(c.value, 2)))
        const usable = numbers.filter(n => Number.isFinite(n))
        const down = usable.length > 2 && usable.every((n, i) => i === 0 || n <= usable[i - 1])
        const up = usable.length > 2 && usable.every((n, i) => i === 0 || n >= usable[i - 1])
        return {
          path,
          width,
          ...(enter !== undefined ? { from: enter } : {}),
          ...(leave !== undefined ? { to: leave } : {}),
          changes,
          ...(width === 1 ? { pulses: inside.filter(c => c.value === '1').length } : {}),
          ...(width > 1 && (down || up) && !down !== !up ? { counted: down ? ('down' as const) : ('up' as const) } : {}),
        }
      })

    // A port either side of a boundary is one wire twice; said twice it is noise.
    const seen = new Set<string>()
    const spoken = did.filter(entry => {
      const signature = `${entry.width}:${entry.from}:${entry.to}:${entry.changes}:${entry.pulses ?? ''}`
      if (seen.has(signature)) return false
      seen.add(signature)
      return true
    }).slice(0, 6)

    const transfers = facts.handshakes.flatMap(h => h.transfers
      .filter(t => t.raised >= from && t.raised <= to)
      .map(t => ({ valid: h.valid, raised: t.raised, ...(t.taken !== undefined ? { taken: t.taken } : {}), ...(t.waited !== undefined ? { waited: t.waited } : {}) })))
    windows.push({
      label: line.text,
      from,
      to,
      focus: focusOf(wave, { from, to }, facts.handshakes, facts.reset, lang),
      transfers,
      moved: [...moved].map(([path, changes]) => ({ path, changes })).sort((a, b) => b.changes - a.changes).slice(0, 8),
      did: spoken,
      reset: reset.some(c => c.time >= from && c.time <= to && c.value === '1'),
    })
    from = to
  }
  return windows
}

/** Where a reader's eye should go inside a stretch, and what it will find. */
function focusOf(wave: Waveform, window: { from: number; to: number },
                 handshakes: readonly HandshakeFacts[], reset: { path: string } | undefined,
                 lang: Lang = 'en') {
  const w = wordsIn(lang)
  const focus: { at: number; what: string; signal?: string }[] = []
  for (const h of handshakes) {
    for (const t of h.transfers) {
      if (t.raised < window.from || t.raised > window.to) continue
      focus.push({ at: t.raised, what: w.focusValidRose, signal: h.valid })
      if (t.taken !== undefined) focus.push({ at: t.taken, what: w.focusTaken(t.waited ?? 0), signal: h.ready })
    }
  }
  if (reset) {
    for (const change of seriesOf(wave, reset.path)) {
      if (change.time < window.from || change.time > window.to) continue
      focus.push({ at: change.time, what: change.value === '1' ? w.focusResetAsserted : w.focusResetReleased, signal: reset.path })
    }
  }
  return focus.sort((a, b) => a.at - b.at).slice(0, 6)
}

export function readFacts(wave: Waveform, bench: readonly BenchLine[] = [], lang: Lang = 'en'): WaveFacts {
  const clock = clockFacts(wave)
  const reset = resetFacts(wave)
  // Parameters do not move and task locals are not hardware: neither belongs
  // in "what never changed" or "what is still undefined".
  const moving = wave.signals.filter(s => s.kind !== 'parameter' && s.hardware)
  const all = [...new Set(moving.map(s => s.path))].map(path => factsFor(wave, path, reset?.releasedAt))
  const handshakes = handshakeFacts(wave, clock)
  return {
    timescale: wave.timescale,
    tick: wave.tick,
    end: wave.end,
    signals: new Set(wave.signals.map(s => s.path)).size,
    changes: wave.changes.length,
    ...(clock ? { clock } : {}),
    ...(reset ? { reset } : {}),
    init: initFacts(wave, all, reset?.releasedAt),
    drives: driveFacts(wave, clock),
    handshakes,
    windows: windowFacts(wave, bench, { handshakes, ...(reset ? { reset } : {}), ...(clock?.period !== undefined ? { clockPeriod: clock.period } : {}) }, lang),
    idle: all.filter(s => s.changes <= 1).map(s => s.path),
    unknown: all.filter(s => s.unknownAt !== undefined),
    busiest: [...all].sort((a, b) => b.changes - a.changes).slice(0, 8),
  }
}

export function readBenchLog(text: string): BenchLine[] {
  return text.split('\n').filter(line => line.trim() !== '').map(line => {
    const stamped = /^\s*\[?\s*(\d+)\s*(?:ps|ns|us)?\s*\]?\s*(.*)$/.exec(line)
    return stamped && stamped[2] !== '' ? { time: Number(stamped[1]), text: stamped[2].trim() } : { text: line.trim() }
  })
}

/** `00111100` at eight bits reads as `3c`; one bit reads as itself. */
export function asValue(value: string | undefined, width: number): string {
  if (value === undefined) return '—'
  if (width === 1 || /[xzu]/i.test(value)) return value
  const n = Number.parseInt(value, 2)
  return Number.isNaN(n) ? value : n.toString(16).padStart(Math.ceil(width / 4), '0')
}

/** Milliseconds-friendly rendering of a dump time. */
export function atTime(time: number, tick: number): string {
  const fs = time * tick
  if (fs >= 1e15) return `${(fs / 1e15).toFixed(3)} s`
  if (fs >= 1e12) return `${(fs / 1e12).toFixed(3)} ms`
  if (fs >= 1e9) return `${(fs / 1e9).toFixed(3)} µs`
  if (fs >= 1e6) return `${(fs / 1e6).toFixed(3)} ns`
  return `${(fs / 1e3).toFixed(0)} ps`
}
