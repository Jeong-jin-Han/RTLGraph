import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { BASE_REGISTRY } from '@rtlgraph/registry'
import { AGENT_FILES, BASE_MODULES, MAKE_SUBMISSION, PROMPT_KINDS, PROMPT_LANGUAGES, RUN_TB, VALIDATOR_BUNDLE } from '../src/agent/files.ts'
import { buildEnvironmentReport } from '../src/agent/environment.ts'

const ROOT = join(import.meta.dirname, '..')
const GOLDEN = join(ROOT, '../../demo/acc/acc/acc.rtlgraph-schematic.json')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const flat = (text: string) => text.replace(/\s+/g, ' ')
const spec = read('assets/agent/RTLGRAPH_SPEC.md')

test('every file the command copies exists in the extension', () => {
  for (const { from } of AGENT_FILES) assert.ok(existsSync(join(ROOT, from)), from)
  // a prompt per kind per language, plus the guide that says which to reach for
  assert.equal(AGENT_FILES.filter(f => /^\.prompt\/rtlgraph\/[a-z]+\//.test(f.to)).length, PROMPT_KINDS.length * PROMPT_LANGUAGES.length)
  assert.deepEqual(AGENT_FILES.filter(f => /README/.test(f.to) && f.to.startsWith('.prompt/')).map(f => f.to).sort(),
    ['.prompt/rtlgraph/README.korean.md', '.prompt/rtlgraph/README.md'])
  // Everything this extension writes is under its own name: nothing of ours
  // lands where another tool's files live.
  for (const { to } of AGENT_FILES) {
    assert.ok(/^\.(agent|prompt)\/rtlgraph\/|^\.base\//.test(to), `${to} is namespaced`)
  }
})

test('prompts: every kind in two languages, each pointing at a workflow the spec defines', () => {
  const workflows = [...spec.matchAll(/^## (Workflow ([A-Z]) — .+)$/gm)].map(m => [m[2], m[1]] as const)
  assert.deepEqual(workflows.map(([letter]) => letter).sort(), ['A', 'B', 'C', 'S'])
  const byLetter = Object.fromEntries(workflows)
  const expected: Record<(typeof PROMPT_KINDS)[number], string> = {
    spec: byLetter.S, // idea → specification
    rtl: byLetter.B, // specification → new RTL
    refactor: byLetter.C, // existing RTL → restructured RTL
    rtlgraph: byLetter.A, // RTL → schematic
    assignment: byLetter.A, // the same, for code that may not be touched
  }
  for (const kind of PROMPT_KINDS) {
    for (const language of PROMPT_LANGUAGES) {
      const prompt = flat(read(`assets/prompt/${kind}/${language}.md`))
      assert.ok(prompt.includes(`"${expected[kind]}"`), `${kind}/${language} names "${expected[kind]}"`)
      // Code that may not be touched: the prompt has to say so, and say where the files go.
      if (kind === 'assignment') {
        for (const needle of ['Follow the code', 'layout-follows-code']) {
          assert.ok(prompt.includes(needle), `${kind}/${language} mentions ${needle}`)
        }
      }
      // The spec workflow writes a document, not RTLGraph files, so it runs no validator.
      const needles = ['.agent/rtlgraph/SPEC.md', '.agent/rtlgraph/ENVIRONMENT.md', '<PROJECT_ROOT_ABSOLUTE_PATH>']
      for (const needle of kind === 'spec' ? [...needles, 'SPEC.md'] : [...needles, 'rtlgraph/validate.mjs']) {
        assert.ok(prompt.includes(needle), `${kind}/${language} mentions ${needle}`)
      }
    }
  }
  assert.ok(flat(read('assets/prompt/rtlgraph/korean.md')).includes('절대 수정하지 마'))
  assert.ok(read('assets/prompt/rtl/english.md').includes('REQUEST ='))
})

// The bench that decides the mark arrives late and has to be run at once, so
// the runner is shipped with the prompts and the folder split is its contract.
test('the testbench runner: two folders, the given one marked, the project folder left as it was', t => {
  assert.ok(AGENT_FILES.some(f => f.to === RUN_TB), 'run-tb.sh is copied into the workspace')
  const script = join(ROOT, 'assets/agent/run-tb.sh')
  if (spawnSync('iverilog', ['-V']).status !== 0) return t.skip('iverilog not installed')

  // A project as handed out: code at the top, no benches anywhere yet.
  const dir = mkdtempSync(join(tmpdir(), 'rtlgraph-tb-'))
  const demo = join(ROOT, '../../demo/hw')
  for (const file of ['hw_top.v', 'counter.v']) writeFileSync(join(dir, file), readFileSync(join(demo, file)))
  const run = (...args: string[]) => spawnSync('bash', [script, '--project', dir, ...args], { encoding: 'utf8' })

  const empty = run()
  assert.equal(empty.status, 0)
  assert.match(empty.stdout, /no testbench anywhere/)
  for (const folder of ['tb/given', 'tb/mine']) assert.ok(existsSync(join(dir, folder)), `${folder} is made up front`)

  // One of ours passes; the same bench in tb/given is called out as the ruler.
  writeFileSync(join(dir, 'tb/mine/tb_hw.v'), readFileSync(join(demo, 'tb_hw.v')))
  const mine = run('mine')
  assert.equal(mine.status, 0, mine.stdout)
  assert.match(mine.stdout, /PASS\s+tb\/mine\/tb_hw\.v/)
  assert.match(mine.stdout, /reached the limit 4 times/) // the simulator's own words, not ours
  assert.ok(!existsSync(join(dir, 'tb_hw.v')), 'the bench it swapped in is taken back out')

  // Asking for the one that has not arrived says so, and points at the other folder.
  const none = run('given')
  assert.match(none.stdout, /tb\/given\/ is empty — nothing has been handed out/)
  assert.match(none.stdout, /tb\/mine\/ has 1 — run: \.agent\/rtlgraph\/run-tb\.sh mine/)

  writeFileSync(join(dir, 'tb/given/tb_hw.v'), readFileSync(join(demo, 'tb_hw.v')))
  assert.match(run('given').stdout, /PASS\s+tb\/given\/tb_hw\.v\s+← the one it is marked with/)
  assert.match(run('given', '--keep').stdout, /kept tb_hw\.v in the project folder/)
  assert.ok(existsSync(join(dir, 'tb_hw.v')), '--keep leaves it where Vivado would look')

  // A design that misbehaves fails, and a bench that judges nothing is not a pass.
  writeFileSync(join(dir, 'counter.v'), readFileSync(join(demo, 'counter.v'), 'utf8').replace("Q + 1'b1", "Q + 2'd2"))
  const broken = run('mine')
  assert.equal(broken.status, 1)
  assert.match(broken.stdout, /FAIL\s+tb\/mine\/tb_hw\.v/)

  writeFileSync(join(dir, 'tb/mine/tb_quiet.v'), 'module tb_quiet; initial $display("ran"); endmodule\n')
  const quiet = run('tb/mine/tb_quiet.v'.replace(/^/, `${dir}/`))
  assert.equal(quiet.status, 0)
  assert.match(quiet.stdout, /SAID NOTHING/)
  assert.match(quiet.stdout, /no PASS\/FAIL line of its own/)
})

// A project that has been handed in once holds a second copy of its own design
// — submission/<name>/*.v — and a Vivado project holds more. Compiling those
// alongside the originals declares every module twice and nothing runs.
test('the runner ignores copies of the design that live elsewhere in the tree', t => {
  const script = join(ROOT, 'assets/agent/run-tb.sh')
  if (spawnSync('iverilog', ['-V']).status !== 0) return t.skip('iverilog not installed')
  const dir = mkdtempSync(join(tmpdir(), 'rtlgraph-copies-'))
  const demo = join(ROOT, '../../demo/hw')
  for (const file of ['hw_top.v', 'counter.v']) writeFileSync(join(dir, file), readFileSync(join(demo, file)))
  mkdirSync(join(dir, 'tb/mine'), { recursive: true })
  writeFileSync(join(dir, 'tb/mine/tb_hw.v'), readFileSync(join(demo, 'tb_hw.v')))

  // what make-submission.sh stages, and what a Vivado project keeps
  mkdirSync(join(dir, 'submission/hw_submission'), { recursive: true })
  mkdirSync(join(dir, 'Proj/Proj.sim/sim_1'), { recursive: true })
  for (const file of ['hw_top.v', 'counter.v']) {
    writeFileSync(join(dir, 'submission/hw_submission', file), readFileSync(join(demo, file)))
    writeFileSync(join(dir, 'Proj/Proj.sim/sim_1', file), readFileSync(join(demo, file)))
  }
  // and a copy somewhere no prune list would guess
  mkdirSync(join(dir, 'old'), { recursive: true })
  writeFileSync(join(dir, 'old/counter.v'), readFileSync(join(demo, 'counter.v')))

  const run = spawnSync('bash', [script, '--project', dir, 'mine'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stdout)
  assert.match(run.stdout, /PASS\s+tb\/mine\/tb_hw\.v/)
  assert.match(run.stdout, /old\/counter\.v skipped — module counter is already defined/)
  assert.match(run.stdout, /with iverilog, 2 design file\(s\)/) // the two originals, nothing else
})

test('the submission script collects the RTL, checks it elaborates, and zips it', t => {
  assert.ok(AGENT_FILES.some(f => f.to === MAKE_SUBMISSION), 'make-submission.sh is copied into the workspace')
  const script = join(ROOT, 'assets/agent/make-submission.sh')
  if (spawnSync('zip', ['-v']).status !== 0) return t.skip('zip not installed')
  const dir = mkdtempSync(join(tmpdir(), 'rtlgraph-submit-'))
  const demo = join(ROOT, '../../demo/hw')
  mkdirSync(join(dir, '.agent/rtlgraph'), { recursive: true })
  mkdirSync(join(dir, 'tb/mine'), { recursive: true })
  for (const file of ['hw_top.v', 'counter.v']) writeFileSync(join(dir, file), readFileSync(join(demo, file)))
  writeFileSync(join(dir, 'tb/mine/tb_hw.v'), readFileSync(join(demo, 'tb_hw.v')))
  const run = (...args: string[]) => spawnSync('bash', [script, '--project', dir, ...args], { encoding: 'utf8' })

  // the deliverable is the design, not the benches
  const listed = run('--list')
  assert.match(listed.stdout, /hw_top\.v/)
  assert.match(listed.stdout, /counter\.v/)
  assert.doesNotMatch(listed.stdout, /tb_hw\.v/)

  const made = run()
  assert.equal(made.status, 0, made.stdout)
  assert.ok(existsSync(join(dir, 'submission', `${basename(dir)}_submission.zip`)), 'the zip is written')
  if (spawnSync('iverilog', ['-V']).status === 0) assert.match(made.stdout, /iverilog -g2005: ok/)

  // and asking for the benches puts them in, under their folder
  assert.match(run('--with-tb', '--list').stdout, /tb_hw\.v/)
})

// A handed-out skeleton often instantiates a primitive it does not ship. Handing
// in only the handout's files then hands in something nobody can compile.
test('the submission carries what the design needs to elaborate', t => {
  const script = join(ROOT, 'assets/agent/make-submission.sh')
  if (spawnSync('iverilog', ['-V']).status !== 0) return t.skip('iverilog not installed')
  const dir = mkdtempSync(join(tmpdir(), 'rtlgraph-deps-'))
  mkdirSync(join(dir, '.agent/rtlgraph'), { recursive: true })
  mkdirSync(join(dir, '.base'), { recursive: true })
  writeFileSync(join(dir, '.base/DFF.v'), readFileSync(join(ROOT, 'assets/base/DFF.v')))
  writeFileSync(join(dir, 'top.v'), `module top (input CLK, input RST, input [3:0] D, output [3:0] Q);
  DFF #(.BW(3)) u_ff (.CLK(CLK), .RST(RST), .EN(1'b1), .D(D), .Q(Q));
endmodule
`)
  const run = (...args: string[]) => spawnSync('bash', [script, '--project', dir, ...args], { encoding: 'utf8' })

  const listed = run('--list')
  assert.match(listed.stdout, /base\/DFF\.v/, 'the primitive the design instantiates is collected')
  assert.match(listed.stdout, /added because the design does not elaborate without it: DFF/)

  const made = run()
  assert.equal(made.status, 0, made.stdout)
  assert.match(made.stdout, /iverilog -g2005: ok/)
  assert.ok(existsSync(join(dir, 'submission', `${basename(dir)}_submission/base/DFF.v`)), 'and it is staged')

  // …unless the marking project supplies its own, which is what --no-deps is for
  const bare = run('--no-deps')
  assert.equal(bare.status, 1, 'without it the staged design does not elaborate, and that is reported')
  assert.match(bare.stdout, /FAILED/)
  assert.doesNotMatch(bare.stdout, /base\/DFF\.v/)
})

test('the spec registry table matches the real registry', () => {
  for (const def of Object.values(BASE_REGISTRY)) {
    const row = spec.split('\n').find(line => line.startsWith(`| \`${def.module}\` |`))
    assert.ok(row, `spec lists ${def.module}`)
    assert.ok(row.includes(`\`${def.kind}\``), `${def.module} kind`)
    for (const port of def.ports) assert.ok(row.includes(`\`${port.name}\``), `${def.module}.${port.name}`)
  }
})

test('environment report recommends the validator and the simulator that exists', () => {
  const found = buildEnvironmentReport({
    generated: '2026-09-14T00:00:00.000Z', platform: 'linux', node: 'v22.22.1',
    verilator: 'Verilator 5.020', vivadoSettings: ['/tools/Xilinx/Vivado/2024.2/settings64.sh'],
  })
  assert.match(found, /\| Node\.js \| ✅ `v22\.22\.1` \|/)
  assert.match(found, /\| Icarus Verilog \| ❌ \| Install: `sudo apt install iverilog` \|/)
  assert.match(found, /source \/tools\/Xilinx\/Vivado\/2024\.2\/settings64\.sh/)
  assert.match(found, /verilator --lint-only -Wall/)

  const bare = buildEnvironmentReport({ generated: 'x', platform: 'win32', vivadoSettings: [] })
  assert.match(bare, /Node\.js not found/)
  assert.match(bare, /No Verilog simulator found/)
})

test('the bundled validator passes the golden graph and fails a broken one', () => {
  const run = (file: string) => spawnSync(process.execPath, [join(ROOT, VALIDATOR_BUNDLE), file], { encoding: 'utf8' })
  const ok = run(GOLDEN)
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /0 errors, 0 warnings \(plus 2 diagnostics recorded in the file\)/)

  const dir = mkdtempSync(join(tmpdir(), 'rtlgraph-validate-'))
  const graph = JSON.parse(readFileSync(GOLDEN, 'utf8'))
  graph.source.root = relative(dir, join(GOLDEN, '..'))
  graph.signals.CNT_D.driver = 'data_path.u_inc:a'
  graph.nodes.CNT_FF.origin.line = 62
  const broken = join(dir, 'acc_top.rtlgraph.json')
  writeFileSync(broken, JSON.stringify(graph))
  const bad = run(broken)
  assert.equal(bad.status, 1)
  assert.match(bad.stdout, /error endpoint \(net CNT_D\)/)
  assert.doesNotMatch(bad.stdout, /origin-mismatch/) // source checks run only on structurally valid graphs

  graph.signals.CNT_D.driver = 'data_path.u_inc:y'
  writeFileSync(broken, JSON.stringify(graph))
  const warned = run(broken)
  assert.equal(warned.status, 0)
  assert.match(warned.stdout, /warn  origin-mismatch \(seq\/acc_top\.v:62, node CNT_FF\)/)

  assert.equal(run(join(dir, 'missing.json')).status, 1)
})

test('the bundled validator follows a root into its component schematics', () => {
  const run = (file: string) => spawnSync(process.execPath, [join(ROOT, VALIDATOR_BUNDLE), file], { encoding: 'utf8' })
  const PROJECT = join(ROOT, '../../demo/acc')
  const ok = run(join(PROJECT, 'acc_top.rtlgraph.json'))
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /\+ acc\/acc\.rtlgraph-schematic\.json \(component acc\)/)
  assert.match(ok.stdout, /0 errors, 0 warnings \(plus 2 diagnostics recorded in the files\)/)

  // A copy whose child schematic is broken: the error names the file and the instance.
  const dir = mkdtempSync(join(tmpdir(), 'rtlgraph-hierarchy-'))
  const rootGraph = JSON.parse(readFileSync(join(PROJECT, 'acc_top.rtlgraph.json'), 'utf8'))
  rootGraph.source.root = relative(dir, PROJECT)
  writeFileSync(join(dir, 'acc_top.rtlgraph.json'), JSON.stringify(rootGraph))
  const child = JSON.parse(readFileSync(GOLDEN, 'utf8'))
  mkdirSync(join(dir, 'acc'))
  child.source.root = relative(join(dir, 'acc'), join(PROJECT, 'acc'))
  child.signals.CNT_D.driver = 'data_path.u_inc:a'
  writeFileSync(join(dir, 'acc/acc.rtlgraph-schematic.json'), JSON.stringify(child))
  const bad = run(join(dir, 'acc_top.rtlgraph.json'))
  assert.equal(bad.status, 1)
  assert.match(bad.stdout, /error endpoint \(node acc[^)]*net CNT_D\): acc\/acc\.rtlgraph-schematic\.json: /)

  // A box whose ports disagree with its (valid again) schematic.
  child.signals.CNT_D.driver = 'data_path.u_inc:y'
  writeFileSync(join(dir, 'acc/acc.rtlgraph-schematic.json'), JSON.stringify(child))
  rootGraph.nodes.acc.ports.EXTRA = 'in'
  writeFileSync(join(dir, 'acc_top.rtlgraph.json'), JSON.stringify(rootGraph))
  assert.match(run(join(dir, 'acc_top.rtlgraph.json')).stdout, /error hierarchy-ports \(node acc\)/)
})

test('the spec documents every field the IR has grown', () => {
  // The agent writes these files from this document alone: a field it does not
  // mention is a field no agent will ever produce.
  const types = readFileSync(join(ROOT, '../rtl-ir/src/types.ts'), 'utf8')
  const fields = ['fsm', 'rstActive', 'enActive', 'spec', 'links']
  for (const field of fields) {
    assert.ok(types.includes(`${field}?:`) || types.includes(`${field}:`), `the IR still has ${field}`)
  }
  for (const field of ['fsm', 'rstActive', 'enActive', 'spec']) {
    assert.ok(spec.includes(field), `RTLGRAPH_SPEC.md says nothing about ${field}`)
  }
  // layout.links is the reader's, not the agent's: the spec says to leave layout alone.
  assert.match(spec, /`layout`, `view` \| \*\*owned by the user and the extension/)
})

// The primitives are shipped so a project can carry its own copy; the demos use
// the same six. Two copies drift unless something says they must not.
test('the library the extension ships is the one the demos are drawn from', () => {
  for (const module of BASE_MODULES) {
    const shipped = readFileSync(join(ROOT, `assets/base/${module}.v`), 'utf8')
    const demo = readFileSync(join(ROOT, `../../demo/base/${module}.v`), 'utf8')
    assert.equal(shipped, demo, `${module}.v differs between assets/base and demo/base`)
  }
  assert.equal(AGENT_FILES.filter(f => f.to.startsWith('.base/')).length, BASE_MODULES.length + 1,
    'every primitive plus the note that says what they are')
})

// What the agent may attempt depends on what is installed. NodeGraph is the
// other half of this pair — the verification map only makes sense when it is
// there to read it — so the report says which it is, either way.
test('the report says whether NodeGraph is installed, and what that allows', () => {
  const base = { generated: 'now', platform: 'linux', vivadoSettings: [] }
  const without = buildEnvironmentReport(base)
  assert.match(without, /\| NodeGraph \| ❌ \| not installed — skip anything a prompt says about `\*\.nodegraph\.json`/)
  assert.doesNotMatch(without, /Explain the verification/)

  const with_ = buildEnvironmentReport({ ...base, nodegraph: { version: '1.0.7', spec: '/x/.agent/NODEGRAPH_SPEC.md' } })
  assert.match(with_, /\| NodeGraph \| ✅ `1\.0\.7` \| write the verification map/)
  assert.match(with_, /read its own spec first: `\/x\/\.agent\/NODEGRAPH_SPEC\.md`/)
  assert.match(with_, /- \*\*Explain the verification\*\* in a `\*\.nodegraph\.json`/)
})
