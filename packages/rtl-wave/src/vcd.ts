// A VCD reader. Value-change dumps are the one thing every simulator agrees on,
// so this is how a waveform reaches the rest of the tool — iverilog writes one
// with $dumpvars, Vivado's xsim with its own log_vcd.
//
// Deliberately small: the header (what the signals are) and the body (what they
// did, in order). Nothing here interprets anything; facts.ts does that.

export interface WaveSignal {
  /** The dump's own short id. Several signals can share one — aliases of the same net. */
  id: string
  /** Dotted path from the dump's root, e.g. `tb_uart_corner/rx/bit_counter`. */
  path: string
  name: string
  /** The scope the declaration sat in, outermost first. */
  scope: readonly string[]
  width: number
  /** `wire`, `reg`, `parameter`, `integer`, … as the dump declares it. */
  kind: string
  /**
   * True when every scope on the way here is a module — real hardware. A dump
   * also carries a testbench's task and function locals (`$scope task send`),
   * which are bookkeeping and would otherwise drown the findings.
   */
  hardware: boolean
}

export interface WaveChange {
  /** In the dump's own time unit — see `Waveform.tick`. */
  time: number
  id: string
  /** `0` `1` `x` `z`, or the bits of a vector, most significant first. */
  value: string
}

export interface Waveform {
  /** One dump tick, in femtoseconds, so two dumps can be compared. */
  tick: number
  /** What `$timescale` said, verbatim (`1ps`). */
  timescale: string
  signals: readonly WaveSignal[]
  changes: readonly WaveChange[]
  /** The last time any signal changed. */
  end: number
}

const UNITS: Record<string, number> = { s: 1e15, ms: 1e12, us: 1e9, ns: 1e6, ps: 1e3, fs: 1 }

export function parseVcd(text: string): Waveform {
  const cut = text.indexOf('$enddefinitions')
  if (cut < 0) throw new Error('not a VCD: no $enddefinitions')
  const header = text.slice(0, cut)
  const body = text.slice(text.indexOf('$end', cut) + 4)

  const scaleMatch = /\$timescale\s+(\d+)\s*([munpf]?s)\s*\$end/.exec(header)
  if (!scaleMatch) throw new Error('not a VCD: no $timescale')
  const timescale = `${scaleMatch[1]}${scaleMatch[2]}`
  const tick = Number(scaleMatch[1]) * (UNITS[scaleMatch[2]] ?? 1)

  const signals: WaveSignal[] = []
  const scope: string[] = []
  const kinds: string[] = []
  for (const line of header.split('\n')) {
    const trimmed = line.trim()
    const opened = /^\$scope\s+(\w+)\s+(\S+)/.exec(trimmed)
    if (opened) {
      kinds.push(opened[1])
      scope.push(opened[2])
      continue
    }
    if (trimmed.startsWith('$upscope')) {
      scope.pop()
      kinds.pop()
      continue
    }
    // $var <kind> <width> <id> <name> [bit range] $end — the range is part of
    // the name in some writers, so it is dropped rather than parsed.
    const declared = /^\$var\s+(\w+)\s+(\d+)\s+(\S+)\s+(\S+)/.exec(trimmed)
    if (!declared) continue
    const name = declared[4]
    signals.push({
      id: declared[3],
      name,
      scope: [...scope],
      path: [...scope, name].join('/'),
      width: Number(declared[2]),
      kind: declared[1],
      hardware: kinds.every(k => k === 'module'),
    })
  }

  const changes: WaveChange[] = []
  let time = 0
  let end = 0
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    if (line.startsWith('#')) {
      const at = Number(line.slice(1))
      if (Number.isFinite(at)) time = at
      continue
    }
    if (line.startsWith('$')) continue // $dumpvars, $end, $comment …
    if (line[0] === 'b' || line[0] === 'B' || line[0] === 'r' || line[0] === 'R') {
      const space = line.search(/\s/)
      if (space < 0) continue
      changes.push({ time, id: line.slice(space).trim(), value: line.slice(1, space) })
    } else {
      changes.push({ time, id: line.slice(1).trim(), value: line[0].toLowerCase() })
    }
    end = time
  }
  return { tick, timescale, signals, changes, end }
}

/** Every change of one signal, in order. */
export function seriesOf(wave: Waveform, path: string): WaveChange[] {
  const signal = wave.signals.find(s => s.path === path)
  if (!signal) return []
  return wave.changes.filter(c => c.id === signal.id)
}

/** The value a signal held at `time` (`undefined` before its first change). */
export function levelAt(series: readonly WaveChange[], time: number): string | undefined {
  let held: string | undefined
  for (const change of series) {
    if (change.time > time) break
    held = change.value
  }
  return held
}

/**
 * The value a signal held *going into* `time` — the last change strictly
 * before it. This is what edge-triggered logic sees: a dump records the value
 * at T after everything at T has settled, so a flag that clears on the same
 * edge that reads it already reads as cleared in `levelAt`.
 */
export function levelBefore(series: readonly WaveChange[], time: number): string | undefined {
  let held: string | undefined
  for (const change of series) {
    if (change.time >= time) break
    held = change.value
  }
  return held
}

/** The times a one-bit signal went to `value`. */
export function edgesOf(series: readonly WaveChange[], value: '0' | '1'): number[] {
  const times: number[] = []
  let previous: string | undefined
  for (const change of series) {
    if (change.value === value && previous !== value) times.push(change.time)
    previous = change.value
  }
  return times
}
