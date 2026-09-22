// The measurements, written out twice: once for a person
// (`<bench>.waveform.md`) and once for an agent and the viewer
// (`<bench>.waveform.json`). Neither says why anything happened —
// that is what `.prompt/rtlgraph/waveform/*.md` asks an agent to add, against
// the code, with line numbers.

import { asValue, atTime, type BenchLine, type WaveFacts } from './facts.ts'
import { wordsIn, type Lang } from './words.ts'

export interface Report {
  facts: WaveFacts
  /** What the testbench printed while the dump was being written. */
  bench: readonly BenchLine[]
  /** Where the dump came from, for the reader's bearings. */
  source: { vcd: string; log?: string; simulator?: string }
}

export function reportJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`
}

export function reportMarkdown(report: Report, lang: Lang = 'en'): string {
  const { facts, bench, source } = report
  const w = wordsIn(lang)
  const at = (time: number) => atTime(time, facts.tick)
  const lines: string[] = []
  const say = (...text: string[]) => lines.push(...text)

  say(`# ${w.title}`, '')
  say(`> ${w.measuredFrom(source.vcd, source.simulator)}`, `> ${w.measuredOnly}`, `> ${w.askThePrompt}`, '')

  say(w.ranTo(at(facts.end), facts.changes, facts.signals), '')

  if (facts.clock) {
    const c = facts.clock
    const spread = c.jitter
      ? w.clockVaries(c.periods.length, c.periods.slice(0, 5).map(p => at(p)).join(', '), c.periods.length > 5)
      : w.clockSteady
    say(`## ${w.clock}`, '',
      w.clockLine(c.path, c.edges, c.period !== undefined ? at(c.period) : '—', ((c.hertz ?? 0) / 1e6).toFixed(3)) + spread, '')
  }

  if (facts.reset) {
    say(`## ${w.reset}`, '', facts.reset.releasedAt !== undefined
      ? w.resetReleased(facts.reset.path, at(facts.reset.releasedAt))
      : w.resetNeverReleased(facts.reset.path), '')
  }

  // Initialization first: a bench that only checks outputs will pass while a
  // register spends the opening microsecond undefined.
  say(`## ${w.comingUp}`, '')
  const init = facts.init
  const listed = init.unknownAtZero.slice(0, 8).map(p => `\`${p}\``).join(', ')
  say(init.unknownAtZero.length === 0
    ? w.nothingUnknownAtZero
    : w.unknownAtZero(init.unknownAtZero.length, listed, init.unknownAtZero.length > 8))
  if (init.unknownAfterReset.length === 0) {
    say('', w.nothingLeftUndefined)
  } else {
    say('', w.stillUndefined, '')
    say(`| ${w.signal} | ${w.definedAt} |`, '|---|---|')
    for (const u of init.unknownAfterReset) {
      say(`| \`${u.path}\` | ${u.until !== undefined ? at(u.until) : w.neverDefined} |`)
    }
    say('', init.settledAt !== undefined
      ? w.allDefinedBy(at(init.settledAt), init.settledAfter !== undefined ? at(init.settledAfter) : undefined)
      : w.somethingStaysUndefined)
  }
  say('')

  if (facts.drives.length > 0) {
    const racing = facts.drives.filter(d => d.onEdge > 0)
    say(`## ${w.drives}`, '')
    say(`| ${w.signal} | ${w.changes} | ${w.onActiveEdge} |`, '|---|---|---|')
    for (const d of facts.drives) {
      say(`| \`${d.path}\` | ${d.changes} | ${d.onEdge === 0 ? w.none : w.firstAt(d.onEdge, d.onEdgeAt.map(t => at(t)).join(', '))} |`)
    }
    say('', racing.length === 0 ? w.noRace : w.race, '')
  }

  for (const h of facts.handshakes) {
    say(`## ${w.handshake(h.valid, h.ready)}`, '')
    say(`| ${w.validRose} | ${w.taken} | ${w.waited} | ${w.held} |`, '|---|---|---|---|')
    for (const t of h.transfers) {
      say(`| ${at(t.raised)} | ${t.taken !== undefined ? at(t.taken) : w.never} | ` +
        `${t.waited !== undefined ? w.clocks(t.waited) : '—'} | ${t.held !== undefined ? w.clocks(t.held) : w.stillUp} |`)
    }
    say('')
  }

  if (facts.unknown.length > 0) {
    say(`## ${w.unknownAfterReset}`, '')
    for (const s of facts.unknown) say(`- \`${s.path}\` holds x or z at ${at(s.unknownAt!)}`)
    say('')
  }

  if (facts.idle.length > 0) {
    say(`## ${w.neverMoved}`, '', facts.idle.map(p => `\`${p}\``).join(', '), '')
  }

  say(`## ${w.busiest}`, '', `| ${w.signal} | ${w.changes} | ${w.first} | ${w.last} |`, '|---|---|---|---|')
  for (const s of facts.busiest) {
    say(`| \`${s.path}\` | ${s.changes} | ${s.first !== undefined ? at(s.first) : '—'} | ${s.last !== undefined ? at(s.last) : '—'} |`)
  }
  say('')

  if (facts.windows.length > 0) {
    say(`## ${w.checkByCheck}`, '')
    say(w.checkByCheckWhy, '')
    for (const window of facts.windows) {
      say(`### ${window.label}`, '',
        `${at(window.from)} → ${at(window.to)}${window.reset ? `, ${w.reset_in_stretch}` : ''}` +
        (window.source ? `  ·  \`${window.source.file}:${window.source.line}\`` : ''), '')
      for (const moment of window.focus) {
        say(`- ${at(moment.at)} — ${moment.what}${moment.signal ? ` (\`${moment.signal}\`)` : ''}`)
      }
      if (window.focus.length > 0) say('')
      if (window.did.length === 0) {
        say(w.nothingMoved, '')
      } else {
        for (const entry of window.did) {
          const name = `\`${entry.path}\``
          const from = asValue(entry.from, entry.width)
          const to = asValue(entry.to, entry.width)
          say('- ' + (entry.width === 1 && (entry.pulses ?? 0) > 1
            ? w.didPulse(name, entry.pulses!)
            : from === to ? w.didHold(name, to) : w.didChange(name, from, to, entry.changes, entry.counted)))
        }
        say('')
      }
    }
  }

  if (bench.length > 0) {
    const stamped = bench.filter(b => b.time !== undefined).length
    say(`## ${w.benchSaid}`, '')
    say(stamped > 0 ? w.benchTimed : w.benchUntimed, '')
    say(`| ${w.when} | ${w.whatItSaid} |`, '|---|---|')
    for (const line of bench) say(`| ${line.time !== undefined ? at(line.time) : '—'} | ${line.text.replace(/\|/g, '\\|')} |`)
    say('')
  }

  return lines.join('\n')
}
