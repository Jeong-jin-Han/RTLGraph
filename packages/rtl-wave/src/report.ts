// The measurements, written out twice: once for a person (`waveform.md`) and
// once for an agent (`waveform.json`). Neither says why anything happened —
// that is what `.prompt/rtlgraph/waveform/*.md` asks an agent to add, against
// the code, with line numbers.

import { atTime, type BenchLine, type WaveFacts } from './facts.ts'

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

export function reportMarkdown(report: Report): string {
  const { facts, bench, source } = report
  const at = (time: number) => atTime(time, facts.tick)
  const lines: string[] = []
  const say = (...text: string[]) => lines.push(...text)

  say('# What the waveform says', '')
  say('> Measured from `' + source.vcd + '`' + (source.simulator ? ` (${source.simulator})` : '') + '.',
    '> Every number here was read off the dump. Nothing here explains *why* —',
    '> for that, hand this file and the code to `.prompt/rtlgraph/waveform/korean.md`.', '')

  say(`Simulated to **${at(facts.end)}** — ${facts.changes} value changes across ${facts.signals} signals.`, '')

  if (facts.clock) {
    const c = facts.clock
    const period = c.period !== undefined ? `period ${at(c.period)}, ${(c.hertz! / 1e6).toFixed(3)} MHz` : 'no period to measure'
    const spread = c.jitter
      ? ` **${c.periods.length} different gaps** between edges: ${c.periods.slice(0, 5).map(p => at(p)).join(', ')}` +
        `${c.periods.length > 5 ? ' …' : ''} — a clock that stops (a reset held, a gated domain) looks like this too.`
      : ' The gap between edges never varies.'
    say(`## Clock`, '', `\`${c.path}\` — ${c.edges} rising edges, ${period}.${spread}`, '')
  }

  if (facts.reset) {
    say('## Reset', '', `\`${facts.reset.path}\`` + (facts.reset.releasedAt !== undefined
      ? ` released at **${at(facts.reset.releasedAt)}**.`
      : ' never released in this run.'), '')
  }

  // Initialization first: a bench that only checks outputs will pass while a
  // register spends the opening microsecond undefined.
  say('## Coming up', '')
  const init = facts.init
  const listed = init.unknownAtZero.slice(0, 8).map(p => `\`${p}\``).join(', ')
  say(init.unknownAtZero.length === 0
    ? 'Nothing held x or z at time 0 — every signal in the dump started from a value.'
    : `At time 0, ${init.unknownAtZero.length} signal(s) held x or z` +
      (init.unknownAtZero.length > 8 ? ` (${listed}, …)` : `: ${listed}`) +
      '. Before a reset that is ordinary; what matters is the next table.')
  if (init.unknownAfterReset.length === 0) {
    say('', 'Once the reset was released, nothing was left undefined.')
  } else {
    say('', 'Still undefined when the reset let go:', '')
    say('| Signal | Defined at |', '|---|---|')
    for (const u of init.unknownAfterReset) {
      say(`| \`${u.path}\` | ${u.until !== undefined ? at(u.until) : '**never in this run**'} |`)
    }
    say('', init.settledAt !== undefined
      ? `Everything was defined by **${at(init.settledAt)}**` +
        (init.settledAfter !== undefined ? `, ${at(init.settledAfter)} after the reset was released.` : '.')
      : 'Something stays undefined for the whole run — the rows above say which.')
  }
  say('')

  if (facts.drives.length > 0) {
    const racing = facts.drives.filter(d => d.onEdge > 0)
    say('## What the bench drives', '')
    say('| Signal | Changes | On the active edge |', '|---|---|---|')
    for (const d of facts.drives) {
      say(`| \`${d.path}\` | ${d.changes} | ${d.onEdge === 0 ? 'none' :
        `**${d.onEdge}** — first at ${d.onEdgeAt.map(t => at(t)).join(', ')}`} |`)
    }
    say('', racing.length === 0
      ? 'No bench-driven input moves at the instant the design samples, which is what driving on the opposite edge is for.'
      : '⚠️ An input that changes on the active edge is a race: which value the design sees is the simulator\'s choice, not the design\'s.', '')
  }

  for (const h of facts.handshakes) {
    say(`## Handshake \`${h.valid}\` / \`${h.ready}\``, '')
    say('| Valid rose | Taken | Waited | Held |', '|---|---|---|---|')
    for (const t of h.transfers) {
      say(`| ${at(t.raised)} | ${t.taken !== undefined ? at(t.taken) : '**never**'} | ` +
        `${t.waited !== undefined ? `${t.waited} clocks` : '—'} | ${t.held !== undefined ? `${t.held} clocks` : 'still up at the end'} |`)
    }
    say('')
  }

  if (facts.unknown.length > 0) {
    say('## Still unknown after reset', '')
    for (const s of facts.unknown) say(`- \`${s.path}\` holds x or z at ${at(s.unknownAt!)}`)
    say('')
  }

  if (facts.idle.length > 0) {
    say('## Never moved', '', facts.idle.map(p => `\`${p}\``).join(', '), '')
  }

  say('## Busiest signals', '', '| Signal | Changes | First | Last |', '|---|---|---|---|')
  for (const s of facts.busiest) {
    say(`| \`${s.path}\` | ${s.changes} | ${s.first !== undefined ? at(s.first) : '—'} | ${s.last !== undefined ? at(s.last) : '—'} |`)
  }
  say('')

  if (facts.windows.length > 0) {
    say('## Check by check', '')
    say('Each stretch runs from the previous printed line to this one, so what is',
      'listed beside a check is the evidence that check was looking at. Why it',
      'passed is a question about the code — that is what the `waveform` prompt is for.', '')
    for (const w of facts.windows) {
      say(`### ${w.label}`, '', `${at(w.from)} → ${at(w.to)}${w.reset ? ', reset asserted in this stretch' : ''}`, '')
      if (w.transfers.length > 0) {
        for (const t of w.transfers) {
          say(`- \`${t.valid}\` rose at ${at(t.raised)}` +
            (t.taken !== undefined ? `, taken at ${at(t.taken)} after ${t.waited} clocks` : ', never taken'))
        }
        say('')
      }
      say('Busiest here: ' + (w.moved.length === 0 ? 'nothing moved' :
        w.moved.map(m => `\`${m.path}\` ×${m.changes}`).join(', ')), '')
    }
  }

  if (bench.length > 0) {
    const stamped = bench.filter(b => b.time !== undefined).length
    say('## What the testbench printed', '')
    say(stamped > 0
      ? 'Times come from the bench itself (`$display("[%0t] …")`), so each line can be lined up with the dump.'
      : 'This bench printed no times, so its lines are in order but cannot be placed on the dump. A bench of ours prefixes `[%0t]`; a handed-out one usually does not.', '')
    say('| When | What it said |', '|---|---|')
    for (const line of bench) say(`| ${line.time !== undefined ? at(line.time) : '—'} | ${line.text.replace(/\|/g, '\\|')} |`)
    say('')
  }

  return lines.join('\n')
}
