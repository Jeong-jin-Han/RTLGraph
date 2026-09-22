// `.agent/rtlgraph/wave.mjs` — read a dump, write what it says.
//
// Bundled the same way the validator is: one dependency-free file the agent can
// run without installing anything.
//
//   node .agent/rtlgraph/wave.mjs <dump.vcd> [--log <bench output>] [--out <folder>]
//
// Writes <bench>.waveform.md (for a person) and <bench>.waveform.json (for an
// agent, and for the viewer) beside the dump, or in --out. The name comes from
// the dump's, so a project with several benches gets one report each and the
// editor tabs say which is which — the same habit as *.rtlgraph.json.
//
// It measures; it never explains. The explanation is the job of
// .prompt/rtlgraph/waveform/*.md, which reads the .waveform.json and the code.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { parseVcd, readFacts, readBenchLog, reportMarkdown, reportJson } from '@rtlgraph/wave'

const args = process.argv.slice(2)
const flag = (name: string) => {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))

if (files.length !== 1) {
  console.error('usage: node wave.mjs <dump.vcd> [--log <bench output>] [--out <folder>]')
  process.exit(2)
}

const vcdPath = resolve(files[0])
const logPath = flag('--log')
const outDir = resolve(flag('--out') ?? dirname(vcdPath))

let wave
try {
  wave = parseVcd(readFileSync(vcdPath, 'utf8'))
} catch (err) {
  console.error(`wave: ${vcdPath}: ${(err as Error).message}`)
  process.exit(1)
}

const bench = logPath ? readBenchLog(readFileSync(resolve(logPath), 'utf8')) : []

const report = {
  facts: readFacts(wave, bench),
  bench,
  // Relative to the report, because that is how the viewer finds the dump again.
  source: { vcd: relative(outDir, vcdPath) || basename(vcdPath), ...(logPath ? { log: basename(logPath) } : {}) },
}

mkdirSync(outDir, { recursive: true })
const stem = basename(vcdPath, extname(vcdPath))
const md = join(outDir, `${stem}.waveform.md`)
const json = join(outDir, `${stem}.waveform.json`)
writeFileSync(md, reportMarkdown(report))
writeFileSync(json, reportJson(report))

const { facts } = report
const races = facts.drives.filter(d => d.onEdge > 0).length
console.log(`${basename(vcdPath)}: ${facts.changes} changes, ${facts.signals} signals, to ${facts.end} ticks`)
if (facts.clock?.period) console.log(`  clock   ${facts.clock.path} every ${facts.clock.period} ticks (${(facts.clock.hertz! / 1e6).toFixed(3)} MHz)`)
for (const h of facts.handshakes) {
  const taken = h.transfers.filter(t => t.taken !== undefined).length
  console.log(`  handshake ${h.valid}: ${h.transfers.length} raised, ${taken} taken`)
}
if (races > 0) console.log(`  ⚠️ ${races} bench-driven signal(s) change on the active clock edge`)
if (facts.unknown.length > 0) console.log(`  ⚠️ ${facts.unknown.length} signal(s) still x/z after reset`)
console.log(`  wrote ${md}`)
console.log(`  wrote ${json}`)
