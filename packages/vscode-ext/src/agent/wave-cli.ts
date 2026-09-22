// `.agent/rtlgraph/wave.mjs` — read a dump, write what it says.
//
// Bundled the same way the validator is: one dependency-free file the agent can
// run without installing anything.
//
//   node .agent/rtlgraph/wave.mjs <dump.vcd> [--log <output>] [--bench <tb.v>]
//                                  [--project <dir>] [--lang en|ko] [--out <folder>]
//
// Writes <bench>.waveform.md (for a person) and <bench>.waveform.json (for an
// agent, and for the viewer) beside the dump, or in --out. The name comes from
// the dump's, so a project with several benches gets one report each and the
// editor tabs say which is which — the same habit as *.rtlgraph.json.
//
// It measures; it never explains. The explanation is the job of
// .prompt/rtlgraph/waveform/*.md, which reads the .waveform.json and the code.

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import {
  langOf, locateCheck, locateSignal, parseVcd, readFacts, readBenchLog, reportMarkdown, reportJson, stimulusFor,
} from '@rtlgraph/wave'

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
const benchPath = flag('--bench')

const lang = langOf(flag('--lang'))
const facts = readFacts(wave, bench, lang)

// Where each printed line came from, so the reader can go from a check to the
// line that made it. Paths are relative to the report: the pair travels together.
if (benchPath) {
  const source = readFileSync(resolve(benchPath), 'utf8')
  const file = relative(outDir, resolve(benchPath))
  let previous
  for (const window of facts.windows) {
    const found = locateCheck(source, window.label)
    if (!found) continue
    Object.assign(window, { source: { file, ...found }, stimulus: stimulusFor(source, previous, found) })
    previous = found
  }
}

// Where each signal is driven, so a trace can be clicked back to the line that
// makes it. Matching every instant to code is hopeless; matching a signal is not.
const SKIP = new Set(['.git', 'node_modules', '.rtlgraph-build', 'waveform', 'submission', 'build', 'dist'])
function designFiles(dir: string, depth = 0): string[] {
  if (depth > 6) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry.endsWith('.sim') || entry.endsWith('.cache') || entry.endsWith('.runs')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...designFiles(path, depth + 1))
    else if (/\.(v|sv)$/.test(entry)) out.push(path)
  }
  return out
}

const projectDir = flag('--project')
const signals: Record<string, { file: string; line: number; text: string }> = {}
// The best answer is the line that *drives* the signal in the design. A
// testbench declares the same names to wire the design up, and answering with
// that teaches the reader nothing, so design files and driving statements win.
const STRENGTH = { clocked: 0, continuous: 1, blocking: 2, declaration: 3 } as const
const isBench = (path: string) => /(^|\/)(tb|TB)_|_tb\.(s?v)$|\/tb\//.test(path)
if (projectDir) {
  const files = designFiles(resolve(projectDir)).map(path => ({ path, text: readFileSync(path, 'utf8') }))
  const names = new Set(wave.signals.filter(s => s.hardware).map(s => s.name))
  for (const name of names) {
    let best: { score: number; file: string; line: number; text: string } | undefined
    for (const file of files) {
      const found = locateSignal(file.text, name)
      if (!found) continue
      const score = (isBench(file.path) ? 10 : 0) + STRENGTH[found.kind ?? 'declaration']
      if (!best || score < best.score) {
        best = { score, file: relative(outDir, file.path), line: found.line, text: found.text }
      }
    }
    if (best) signals[name] = { file: best.file, line: best.line, text: best.text }
  }
}

const report = {
  facts,
  signals,
  bench,
  // Relative to the report, because that is how the viewer finds the dump again.
  source: { vcd: relative(outDir, vcdPath) || basename(vcdPath), ...(logPath ? { log: basename(logPath) } : {}) },
}

mkdirSync(outDir, { recursive: true })
const stem = basename(vcdPath, extname(vcdPath))
const md = join(outDir, `${stem}.waveform.md`)
const json = join(outDir, `${stem}.waveform.json`)
writeFileSync(md, reportMarkdown(report, lang))
writeFileSync(json, reportJson(report))

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
