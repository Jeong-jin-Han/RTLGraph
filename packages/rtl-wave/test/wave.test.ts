import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { askFor, buildView, citationsIn, stimulusFor, edgesOf, locateCheck, locateSignal, matchAnalysis, parseAnalysis, wordsIn, levelAt, levelBefore, parseVcd, readBenchLog, readFacts, reportMarkdown, seriesOf } from '../src/index.ts'

// A dump written by hand, so every fact below has a known answer. Two clock
// periods of 10 ns, a reset released at 15 ns, a handshake whose valid clears
// on the very edge that takes it, and one input that changes on the edge.
const VCD = `$date Tue Sep 22 2026 $end
$version hand-written $end
$timescale 1ns $end
$scope module tb $end
$var reg 1 ! clk $end
$var reg 1 " reset $end
$var reg 1 # data_out_ready $end
$var wire 1 $ data_out_valid $end
$var wire 8 % data_out [7:0] $end
$var parameter 32 & WIDTH $end
$var reg 1 ' late $end
$scope module dut $end
$var wire 1 ! clk $end
$var reg 4 ( count $end
$var wire 1 ) stuck $end
$upscope $end
$upscope $end
$enddefinitions $end
#0
0!
1"
0#
0$
bxxxxxxxx %
b100000 &
0'
b0000 (
x)
#5
1!
#10
0!
#15
0"
#20
1!
b0001 (
#25
0!
#30
1!
1$
b10100101 %
b0010 (
#35
0!
1#
#40
1!
0$
b0011 (
#45
0!
0#
#50
1!
1'
b0100 (
#55
0!
#60
1!
`

test('the reader takes a dump apart: scopes, aliases, vectors, times', () => {
  const wave = parseVcd(VCD)
  assert.equal(wave.timescale, '1ns')
  assert.equal(wave.tick, 1e6) // femtoseconds in a nanosecond
  assert.equal(wave.end, 60)

  // clk is declared twice under two scopes and shares one id: both paths, one series.
  const clk = wave.signals.filter(s => s.name === 'clk')
  assert.deepEqual(clk.map(s => s.path), ['tb/clk', 'tb/dut/clk'])
  assert.equal(clk[0].id, clk[1].id)
  assert.equal(seriesOf(wave, 'tb/clk').length, seriesOf(wave, 'tb/dut/clk').length)

  const data = seriesOf(wave, 'tb/data_out')
  assert.equal(data[0].value, 'xxxxxxxx')
  assert.equal(data[1].value, '10100101')
  assert.deepEqual(edgesOf(seriesOf(wave, 'tb/clk'), '1'), [5, 20, 30, 40, 50, 60])
})

// The trap that made the first version of this report say every transfer was
// missed: a dump records the value at T *after* everything at T has settled,
// but edge-triggered logic sees what was there going in.
test('a value at an edge is the value going into it, not the one left after', () => {
  const wave = parseVcd(VCD)
  const valid = seriesOf(wave, 'tb/data_out_valid')
  assert.equal(levelAt(valid, 40), '0', 'after the edge at 40 the flag has cleared')
  assert.equal(levelBefore(valid, 40), '1', 'going into that edge it was still up')
})

test('what the facts say about a design nobody has explained yet', () => {
  const facts = readFacts(parseVcd(VCD))

  assert.equal(facts.clock?.path, 'tb/clk')
  assert.equal(facts.clock?.period, 10)
  assert.equal(facts.clock?.hertz, 1e8)
  assert.deepEqual(facts.clock?.periods, [10, 15]) // 5 → 20 is the gap while reset is held
  assert.equal(facts.clock?.jitter, true, 'and that gap is worth saying out loud')
  assert.equal(facts.reset?.path, 'tb/reset')
  assert.equal(facts.reset?.releasedAt, 15)

  // the handshake: raised at 30, taken on the edge at 40, held two clocks
  assert.equal(facts.handshakes.length, 1)
  assert.deepEqual(facts.handshakes[0].transfers, [{ raised: 30, taken: 40, waited: 1, held: 1 }])

  // one bench-driven input moves on an active edge; the others do not
  const late = facts.drives.find(d => d.path === 'tb/late')
  assert.equal(late?.onEdge, 1)
  assert.deepEqual(late?.onEdgeAt, [50])
  assert.equal(facts.drives.find(d => d.path === 'tb/data_out_ready')?.onEdge, 0)
  // a register inside the design is not the bench's drive, however it moves
  assert.equal(facts.drives.some(d => d.path.startsWith('tb/dut/')), false)

  // x after reset is worth naming; a parameter that never moves is not
  assert.deepEqual(facts.unknown.map(s => s.path), ['tb/data_out', 'tb/dut/stuck'])
  assert.ok(facts.idle.includes('tb/dut/stuck'))
  assert.equal(facts.idle.includes('tb/WIDTH'), false, 'parameters are not signals that failed to move')
  assert.equal(facts.busiest[0].path, 'tb/clk')

  // initialization: what was undefined, and for how long
  assert.deepEqual(facts.init.unknownAtZero, ['tb/data_out', 'tb/dut/stuck'])
  assert.deepEqual(facts.init.unknownAfterReset, [
    { path: 'tb/data_out', until: 30 },   // the bus takes 15 ns after reset to mean anything
    { path: 'tb/dut/stuck' },             // and this one never does
  ])
  assert.equal(facts.init.settledAt, undefined, 'a run with something permanently x never settles')
})

test('the run is cut into stretches, one per check the bench printed', () => {
  const bench = readBenchLog('[30] ok: a byte arrived\n[50] ok: and the next one\n')
  const facts = readFacts(parseVcd(VCD), bench)
  assert.deepEqual(facts.windows.map(w => [w.label, w.from, w.to]), [
    ['ok: a byte arrived', 0, 30],
    ['ok: and the next one', 30, 50],
  ])
  // the transfer that the first check is about falls inside the first stretch
  assert.deepEqual(facts.windows[0].transfers, [{ valid: 'tb/data_out_valid', raised: 30, taken: 40, waited: 1 }])
  assert.equal(facts.windows[0].reset, true, 'the reset is asserted at the start of the run')
  assert.equal(facts.windows[1].reset, false)
  assert.equal(facts.windows[0].moved[0].path, 'tb/clk')

  // a bench that printed no times gets no stretches rather than invented ones
  assert.deepEqual(readFacts(parseVcd(VCD), readBenchLog('ok: no time here\n')).windows, [])
})

test('the report says what it measured, and says it measured nothing else', () => {
  const facts = readFacts(parseVcd(VCD))
  const bench = readBenchLog('[30] ok: a byte arrived\nPASS: 0 mismatches\n')
  const md = reportMarkdown({ facts: readFacts(parseVcd(VCD), bench), bench, source: { vcd: 'x.vcd' } })
  assert.match(md, /Nothing here explains \*why\*/)
  assert.match(md, /100\.000 MHz/)
  assert.match(md, /\*\*2 different gaps\*\*/)
  assert.match(md, /\| 30\.000 ns \| 40\.000 ns \| 1 clocks \| 1 clocks \|/)
  assert.match(md, /⚠️ An input that changes on the active edge is a race/)
  assert.match(md, /\| 30\.000 ns \| ok: a byte arrived \|/)
  assert.match(md, /\| — \| PASS: 0 mismatches \|/)
  assert.match(md, /## Coming up/)
  assert.match(md, /`tb\/dut\/stuck` \| \*\*never in this run\*\*/)
  assert.match(md, /### ok: a byte arrived/)
})

test('a bench line carries its time when the bench printed one', () => {
  const lines = readBenchLog('[ 1065000 ] ok: held\nok: no timestamp here\n\n')
  assert.deepEqual(lines, [{ time: 1065000, text: 'ok: held' }, { text: 'ok: no timestamp here' }])
})

test('a file that is not a dump is refused by name', () => {
  assert.throws(() => parseVcd('hello'), /no \$enddefinitions/)
  assert.throws(() => parseVcd('$enddefinitions $end\n#0\n1!\n'), /no \$timescale/)
})

// The end of the chain: a real simulator's dump, read by the bundled CLI.
test('a real dump, from iverilog, through the shipped reader', t => {
  const root = join(import.meta.dirname, '../../..')
  const cli = join(root, 'packages/vscode-ext/dist/agent/rtlgraph-wave.mjs')
  if (!existsSync(cli)) return t.skip('run `npm run build -w rtlgraph` first')
  try {
    execFileSync('iverilog', ['-V'], { stdio: 'ignore' })
  } catch {
    return t.skip('iverilog not installed')
  }
  const dir = mkdtempSync(join(tmpdir(), 'rtlgraph-wave-'))
  // The bench is never edited to be watched: a module beside it does the dumping.
  writeFileSync(join(dir, 'dumper.v'),
    `module rtlgraph_dumper;\n  initial begin\n    $dumpfile("${join(dir, 'wave.vcd')}");\n    $dumpvars(0, tb_hw);\n  end\nendmodule\n`)
  const demo = join(root, 'demo/hw')
  execFileSync('iverilog', ['-g2005', '-o', join(dir, 'a.out'),
    join(demo, 'tb_hw.v'), join(demo, 'hw_top.v'), join(demo, 'counter.v'), join(dir, 'dumper.v')])
  const printed = execFileSync('vvp', ['-n', join(dir, 'a.out')], { encoding: 'utf8' })
  writeFileSync(join(dir, 'bench.log'), printed)

  // --report asks for the prose twin as well; without it only the JSON is written
  execFileSync(process.execPath,
    [cli, join(dir, 'wave.vcd'), '--log', join(dir, 'bench.log'), '--out', dir, '--project', dir, '--report'],
    { encoding: 'utf8' })
  // named after the dump, so several benches do not overwrite one another
  const report = JSON.parse(readFileSync(join(dir, 'wave.waveform.json'), 'utf8'))
  assert.ok(report.facts.clock.period > 0, 'a clock was found and measured')
  assert.equal(report.facts.clock.periods.length, 1, 'and it does not jitter')
  assert.ok(report.facts.changes > 100)
  assert.ok(report.bench.some((line: { text: string }) => line.text.includes('PASS')), 'the bench log came along')
  // The simulator prints where the project happens to sit today; a report that
  // quotes that cannot be copied anywhere. Inside the project, paths are the
  // project's own — the dumpfile line is the one that always carries one.
  assert.ok(report.bench.some((line: { text: string }) => line.text.includes('wave.vcd')), 'the dump is named')
  assert.equal(JSON.stringify(report).includes(dir), false, `no absolute path survived: ${dir}`)
  assert.match(readFileSync(join(dir, 'wave.waveform.md'), 'utf8'), /^# What the waveform says/)
})

test('the view picks what a screen can hold, and what a check is about', () => {
  const bench = readBenchLog('[30] ok: a byte arrived\n[50] ok: and the next one\n')
  const wave = parseVcd(VCD)
  const view = buildView(wave, readFacts(wave, bench), 4)

  // the handshake first, then the reset, then the bench's other ports
  const opens = view.traces.filter(t => t.primary).map(t => t.path)
  assert.deepEqual(opens, ['tb/data_out_ready', 'tb/data_out_valid', 'tb/reset', 'tb/data_out'])
  assert.equal(view.traces[0].bench, true)

  // the clock is there to be switched on, never on by default — and it is the
  // one the measurements found, not everything whose name says "clock"
  const clock = view.traces.find(t => t.role === 'clock')
  assert.equal(clock?.name, 'clk')
  assert.equal(clock?.primary, false)
  // a parameter is a variable, not a signal; a task local is not there at all
  assert.equal(view.traces.find(t => t.name === 'WIDTH')?.role, 'variable')
  assert.equal(view.traces.some(t => t.path.startsWith('tb/expect')), false)

  // the first place to jump to is how it came up; then one per check
  assert.deepEqual(view.markers.map(m => [m.kind, m.label, m.from, m.to]), [
    ['init', 'Coming up', 0, 30],
    ['check', 'ok: a byte arrived', 0, 30],
    ['check', 'ok: and the next one', 30, 50],
  ])
  assert.match(view.markers[0].notes.join(' '), /reset released at 15/)
  assert.match(view.markers[1].notes.join(' '), /1 transfer\(s\) taken/)

  // a trace carries its values, starting from what it held at time 0
  const valid = view.traces.find(t => t.path === 'tb/data_out_valid')!
  assert.deepEqual(valid.points, [[0, '0'], [30, '1'], [40, '0']])
})

// A check reaches the report as words; the reader's next question is where they
// were printed. The answer is findable without parsing Verilog.
test('a printed check is traced back to the line that printed it', () => {
  const bench = [
    'module tb;',
    '    task check(input [7:0] wanted, input [255:0] what);',
    '        $display("[%0t]   ok: %0s (%h)", $time, what, data_out);',
    '    endtask',
    '    initial begin',
    '        check(8\'h3C, "held while data_out_ready is low");',
    '        $display("[%0t]   ok: cleared once taken", $time);',
    '        $display("%0d", errors);',
    '    end',
    'endmodule',
  ].join('\n')

  // printed by a task: the caller's wording wins over the task's format string
  assert.deepEqual(locateCheck(bench, '[1450000]   ok: held while data_out_ready is low (3c)'),
    { line: 6, text: 'check(8\'h3C, "held while data_out_ready is low");' })

  // printed in place, brackets and all — the time and the specifiers are stripped
  assert.equal(locateCheck(bench, '[1480000]   ok: cleared once taken')?.line, 7)

  // nothing to go on: no line rather than a plausible one
  assert.equal(locateCheck(bench, '[10] 42'), undefined)
  assert.equal(locateCheck(bench, 'ok: something this bench never says'), undefined)
})

// Matching every instant of a waveform to code is hopeless; matching a signal
// to the line that drives it is not, and that is the jump a reader wants.
test('a signal is traced to the line that drives it, not merely declares it', () => {
  const rtl = [
    'module rx (input clk, output [7:0] data_out, output data_out_valid);',
    '    reg has_byte;',
    '    reg [9:0] rx_shift;',
    '    assign data_out_valid = has_byte;',
    '    always @(posedge clk) begin',
    '        rx_shift <= {serial_in, rx_shift[9:1]};',
    '    end',
    'endmodule',
  ].join('\n')

  assert.deepEqual(locateSignal(rtl, 'data_out_valid'),
    { line: 4, text: 'assign data_out_valid = has_byte;', kind: 'continuous' })
  // the clocked assignment beats the declaration two lines above it
  assert.deepEqual(locateSignal(rtl, 'rx_shift')?.kind, 'clocked')
  assert.equal(locateSignal(rtl, 'rx_shift')?.line, 6)
  // only a declaration to offer, and it says so
  assert.deepEqual(locateSignal(rtl, 'has_byte'), { line: 2, text: 'reg has_byte;', kind: 'declaration' })
  // a name the file never mentions gets nothing
  assert.equal(locateSignal(rtl, 'nowhere'), undefined)
  // and a name inside another word is not a match
  assert.equal(locateSignal('reg has_byte_next;\n', 'has_byte'), undefined)
})

test('the report can be written in Korean without translating what the code says', () => {
  const bench = readBenchLog('[30] ok: a byte arrived\n')
  const facts = readFacts(parseVcd(VCD), bench)
  const ko = reportMarkdown({ facts, bench, source: { vcd: 'x.vcd' } }, 'ko')
  assert.match(ko, /^# 파형이 말하는 것/)
  assert.match(ko, /## 깨어나는 과정/)
  assert.match(ko, /## 체크별로/)
  // names, times and what the bench printed stay exactly as they were
  assert.match(ko, /`tb\/data_out_valid`/)
  assert.match(ko, /30\.000 ns/)
  assert.match(ko, /ok: a byte arrived/)
  assert.equal(wordsIn('en').comingUp, 'Coming up')
})

// The other half of the pair: an agent writes why, in a file a person can read,
// and it has to find its way back to the instants it is about.
test('an analysis is matched to the places it explains, and nothing is guessed', () => {
  const analysis = parseAnalysis([
    '# tb_x — why',
    '',
    'Numbers from the report, claims against the code.',
    '',
    '## 깨어나는 과정',
    'Reset clears the four registers (`rx.v:58`).',
    '',
    '## ok: held while data_out_ready is low (3c)',
    'It waits because the clearing branch needs ready (`rx.v:86-87`).',
    '',
    '## ok: nothing the bench ever printed',
    'Left over.',
  ].join('\n'))

  assert.equal(analysis.preamble, 'Numbers from the report, claims against the code.')
  assert.equal(analysis.sections.length, 3)

  const places = [
    { id: 'init', label: 'Coming up', kind: 'init' as const },
    { id: 'check-1', label: 'ok: held while data_out_ready is low (3c)', kind: 'check' as const },
    { id: 'check-2', label: 'ok: cleared once taken', kind: 'check' as const },
  ]
  const { matched, spare } = matchAnalysis(analysis, places)
  assert.match(matched.get('init')!.body, /Reset clears/)
  assert.match(matched.get('check-1')!.body, /clearing branch/)
  assert.equal(matched.has('check-2'), false, 'a check nobody wrote about gets nothing')
  assert.deepEqual(spare.map(s => s.heading), ['ok: nothing the bench ever printed'],
    'and a section about nothing is kept rather than pinned on a check')

  // the citations in it are what make it checkable
  assert.deepEqual(citationsIn('waits because of (`rx.v:86-87`) and `top.v:9`'), [
    { text: 'rx.v:86-87', file: 'rx.v', line: 86 },
    { text: 'top.v:9', file: 'top.v', line: 9 },
  ])
})

// The request the view copies: one check, its own numbers, and the rule that
// nothing else may be invented.
test('a request asks about one place and carries that place\'s measurements', () => {
  const place = {
    id: 'check-2', label: 'ok: cleared once taken', kind: 'check' as const,
    from: 1450000, to: 1480000, notes: [], watch: [],
    focus: [{ at: 1465000, what: 'taken after 40 clock(s)', signal: 'tb/data_out_ready' }],
  }
  const window = {
    did: [{ path: 'tb/rx/has_byte', width: 1, from: '1', to: '0', changes: 1, pulses: 0 }],
    source: { file: '../tb/mine/tb_uart_corner.v', line: 79, text: 'else $display("ok: cleared once taken");' },
  }
  const asked = askFor({
    analysis: 'tb_uart_corner.waveform-analysis.md',
    report: 'tb_uart_corner.waveform.json',
    place, window: window as never, tick: 1000, project: '/w/uart',
  }, 'ko')

  assert.match(asked, /## ok: cleared once taken/, 'the heading the view will match on')
  assert.match(asked, /tb_uart_corner\.waveform-analysis\.md 에 \*\*절 하나를 덧붙여\*\*/)
  assert.match(asked, /1\.465 µs — taken after 40 clock\(s\)/, 'the measured instant, in the dump\'s own numbers')
  assert.match(asked, /tb\/rx\/has_byte: 1 → 0/)
  assert.match(asked, /tb_uart_corner\.v:79/, 'and where the check was printed')
  assert.match(asked, /반올림하지도/, 'with the rule that keeps it checkable')
  assert.match(asked, /이 절 하나만 쓰고 끝내/, 'one section, not the whole document')

  // the same request in English names the same things
  const english = askFor({ analysis: 'a.md', report: 'r.json', place, tick: 1000 }, 'en')
  assert.match(english, /append one section/)
  assert.match(english, /## ok: cleared once taken/)
})

// A card that says only what happened leaves the reader asking "from what?".
// The answer is in the bench, a few lines above the line that closed the stretch.
test('how a check was driven is read off the bench, plumbing left out', () => {
  const bench = [
    'initial begin',                            // 1
    '    repeat (4) @(negedge clk);',           // 2 — plumbing: a plain wait
    '    reset = 0;',                           // 3
    '    @(negedge clk);',                      // 4 — plumbing
    '',                                         // 5
    '    // 1. a byte stands until it is taken',// 6
    '    frame(8\'h3C);',                       // 7
    '    repeat (SYMBOL * 4) @(negedge clk);',  // 8 — deliberate idling, kept
    '    check(8\'h3C, "held while ready is low");', // 9
    '    take;',                                // 10
    '    frame(8\'hA5);',                       // 11
    '    check(8\'hA5, "first of two");',       // 12
  ].join('\n')

  const first = { line: 9, text: 'check(8\'h3C, "held while ready is low");' }
  assert.deepEqual(stimulusFor(bench, undefined, first).map(s => s.text), [
    'reset = 0;',
    'frame(8\'h3C);',
    'repeat (SYMBOL * 4) @(negedge clk);',
  ])

  // between two checks, only what ran in between
  assert.deepEqual(stimulusFor(bench, first, { line: 12, text: '' }).map(s => s.text), ['take;', 'frame(8\'hA5);'])
})
