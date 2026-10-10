import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { BASE_REGISTRY } from '@rtlgraph/registry'
import { AGENT_FILES, BASE_MODULES, COMPONENT_DIR, ENVIRONMENT_FILE, filesFor, MAKE_SUBMISSION, PROMPT_CHAINS, PROMPT_KINDS, PROMPT_LANGUAGES, RECIPE_DIR, RUN_TB, VALIDATOR_BUNDLE, GITATTRIBUTES } from '../src/agent/files.ts'
import { buildEnvironmentReport } from '../src/agent/environment.ts'

const ROOT = join(import.meta.dirname, '..')
const GOLDEN = join(ROOT, '../../demo/acc/acc/acc.rtlgraph-schematic.json')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const flat = (text: string) => text.replace(/\s+/g, ' ')
const spec = read('assets/agent/RTLGRAPH_SPEC.md')

// A shell script checked out with CRLF does not run under Cygwin or MSYS, and
// run-tb.sh is a shell script. The four lines that prevent it ship with the
// agent files rather than being written out by an agent every time.
test('a project with no .gitattributes gets one, and keeps its own', () => {
  const ours = read('assets/agent/gitattributes')
  assert.match(ours, /^\*\.sh\s+text eol=lf$/m, 'scripts stay LF wherever they are checked out')
  assert.match(ours, /^\* text=auto$/m)
  assert.match(ours, /Copy Agent Spec/, 'and it says it will not be written over')
  assert.ok(AGENT_FILES.some(f => f.to === GITATTRIBUTES), 'it is one of the copied files')
  assert.ok(filesFor({}).some(f => f.to === GITATTRIBUTES))
})

// A chain names the prompts it runs and the scripts it calls. Every one of
// those paths has to be a file the command actually writes: the assignment
// prompt pointed at `.agent/NODEGRAPH_SPEC.md` for a release, and an agent
// following it found nothing there and carried on without the companion.
// The English prompt fell six rules behind the Korean without anything
// noticing: a reader in one language was being told to do a different job.
// Structure is what can be compared mechanically — the sections and the
// numbered rules — and it is what drifts first.
test('the two languages of a prompt have the same shape', () => {
  const shape = (text: string) => ({
    sections: [...text.matchAll(/^## /gm)].length,
    rules: [...text.matchAll(/^\d+\. \*\*/gm)].length,
    tables: [...text.matchAll(/^\|[^|]+\|/gm)].length > 0,
  })
  for (const kind of [...PROMPT_KINDS.map(k => `${COMPONENT_DIR}/${k}`), ...PROMPT_CHAINS.map(c => `${RECIPE_DIR}/${c}`)]) {
    const ko = shape(read(`assets/prompt/${kind}/korean.md`))
    const en = shape(read(`assets/prompt/${kind}/english.md`))
    assert.deepEqual(en, ko, `${kind}: the two languages have drifted apart`)
  }
})

// The three chains were left behind for two weeks while the component prompts
// and the runner moved on. Each thing a chain has to pass on is one line here.
test('every chain carries what the runner and the reader need', () => {
  for (const chain of PROMPT_CHAINS) {
    for (const language of PROMPT_LANGUAGES) {
      const text = read(`assets/prompt/${RECIPE_DIR}/${chain}/${language}.md`)
      for (const [what, mark] of [
        ['what a failed compile means', 'RTLGRAPH_VENDOR_SRC'],
        ['the dump depth for a big design', '--wave-depth'],
        ['checking the specification in the reader', '📖'],
      ] as const) {
        assert.ok(text.includes(mark), `${chain}/${language} says nothing about ${what}`)
      }
    }
  }
})

test('every path the prompts name is a file that gets written', () => {
  // ENVIRONMENT.md is written by the command rather than copied, so it is not
  // in the file list, but a prompt may name it.
  const written = new Set([...filesFor({}).map(f => f.to), ENVIRONMENT_FILE])
  // Ours only: `.agent/nodegraph/SPEC.md` is the companion's file, written by
  // the companion, and a prompt is right to name it.
  const ours = /`?(\.(?:agent|prompt)\/rtlgraph\/[\w./-]+|\.base\/[\w./-]+)`?/g
  const missing: string[] = []
  for (const kind of [...PROMPT_KINDS.map(k => `${COMPONENT_DIR}/${k}`), ...PROMPT_CHAINS.map(c => `${RECIPE_DIR}/${c}`)]) {
    for (const language of PROMPT_LANGUAGES) {
      const text = read(`assets/prompt/${kind}/${language}.md`)
      for (const [, found] of text.matchAll(ours)) {
        const named = found.replace(/\.$/, '') // a path at the end of a sentence
        // Folders and the two the prompts tell an agent to make are not files.
        if (named.endsWith('/') || /\/(given|mine)$/.test(named)) continue
        if (!written.has(named)) missing.push(`${kind}/${language}: ${named}`)
      }
    }
  }
  assert.deepEqual(missing, [], 'a prompt naming a path nothing writes sends an agent looking')
})

test('every file the command copies exists in the extension', () => {
  for (const { from } of AGENT_FILES) assert.ok(existsSync(join(ROOT, from)), from)
  // a prompt per kind per language, plus the guide that says which to reach for
  // Two shelves: one prompt per job under components/, the chains under recipe/.
  assert.equal(AGENT_FILES.filter(f => f.to.startsWith(`.prompt/rtlgraph/${COMPONENT_DIR}/`)).length,
    PROMPT_KINDS.length * PROMPT_LANGUAGES.length)
  assert.equal(AGENT_FILES.filter(f => f.to.startsWith(`.prompt/rtlgraph/${RECIPE_DIR}/`)).length,
    PROMPT_CHAINS.length * PROMPT_LANGUAGES.length)
  assert.deepEqual(AGENT_FILES.filter(f => /README/.test(f.to) && f.to.startsWith('.prompt/')).map(f => f.to).sort(),
    ['.prompt/rtlgraph/README.korean.md', '.prompt/rtlgraph/README.md'])
  // Everything this extension writes is under its own name: nothing of ours
  // lands where another tool's files live.
  for (const { to } of AGENT_FILES) {
    // `.gitattributes` is the one exception, and it has to be: git reads it
    // at the root of the working tree and nowhere else.
    if (to === GITATTRIBUTES) continue
    assert.ok(/^\.(agent|prompt)\/rtlgraph\/|^\.base\//.test(to), `${to} is namespaced`)
  }
})

test('prompts: every kind in two languages, each pointing at a workflow the spec defines', () => {
  const workflows = [...spec.matchAll(/^## (Workflow ([A-Z]) — .+)$/gm)].map(m => [m[2], m[1]] as const)
  assert.deepEqual(workflows.map(([letter]) => letter).sort(), ['A', 'B', 'C', 'R', 'S', 'W'])
  const byLetter = Object.fromEntries(workflows)
  const expected: Record<(typeof PROMPT_KINDS)[number], string> = {
    spec: byLetter.S, // idea → specification
    rtl: byLetter.B, // specification → new RTL
    refactor: byLetter.C, // existing RTL → restructured RTL
    rtlgraph: byLetter.A, // RTL → schematic
    assignment: byLetter.A, // the same, for code that may not be touched
    waveform: byLetter.W, // a dump that exists → why the run looks like that
    codespec: byLetter.R, // code nobody documented → a specification of it
  }
  for (const kind of PROMPT_KINDS) {
    for (const language of PROMPT_LANGUAGES) {
      const prompt = flat(read(`assets/prompt/${COMPONENT_DIR}/${kind}/${language}.md`))
      assert.ok(prompt.includes(`"${expected[kind]}"`), `${kind}/${language} names "${expected[kind]}"`)
      // Code that may not be touched: the prompt has to say so, and say where the files go.
      if (kind === 'assignment') {
        for (const needle of ['Follow the code', 'layout-follows-code']) {
          assert.ok(prompt.includes(needle), `${kind}/${language} mentions ${needle}`)
        }
      }
      // The spec workflow writes a document, not RTLGraph files, so it runs no validator.
      const needles = ['.agent/rtlgraph/SPEC.md', '.agent/rtlgraph/ENVIRONMENT.md', '<PROJECT_ROOT_ABSOLUTE_PATH>']
      // spec writes a document and waveform reads one: neither produces
      // RTLGraph JSON, so neither runs the validator.
      const extra = kind === 'spec'
        ? ['SPEC.md']
        : kind === 'waveform'
          ? ['waveform.json', 'run-tb.sh --wave']
          // codespec writes prose about code it may not touch: no JSON, no validator
          : kind === 'codespec'
            ? ['00-format.md', 'sim/']
            : ['rtlgraph/validate.mjs']
      for (const needle of [...needles, ...extra]) {
        assert.ok(prompt.includes(needle), `${kind}/${language} mentions ${needle}`)
      }
    }
  }
  assert.ok(flat(read(`assets/prompt/${COMPONENT_DIR}/rtlgraph/korean.md`)).includes('절대 수정하지 마'))
  assert.ok(read(`assets/prompt/${COMPONENT_DIR}/rtl/english.md`).includes('REQUEST ='))
})

// A chain is one paste that walks an agent through several prompts in order.
// Its whole value is that the order and the stopping points are written down
// rather than remembered, so what it names has to keep existing.
test('every chain names real prompts, real scripts, and where to stop', () => {
  for (const chain of PROMPT_CHAINS) {
    for (const language of PROMPT_LANGUAGES) {
      const text = read(`assets/prompt/${RECIPE_DIR}/${chain}/${language}.md`)
      assert.match(text, /<PROJECT_ROOT_ABSOLUTE_PATH>/, `${chain}/${language} asks for the project`)
      // every prompt it chains is a prompt that exists, in the same language
      const named = [...text.matchAll(/\.prompt\/rtlgraph\/components\/([a-z-]+)\/(korean|english)\.md/g)]
      const scripts = [...text.matchAll(/\.agent\/rtlgraph\/([a-z-]+\.sh)/g)]
      // A chain is worth its own file only if it joins steps: marking day is one
      // prompt and two script runs, which is still a sequence nobody should have
      // to remember.
      assert.ok(named.length >= 1 && scripts.length >= 1 && named.length + scripts.length >= 3,
        `${chain}/${language} joins prompts and scripts: ${named.length} + ${scripts.length}`)
      for (const [, kind, said] of named) {
        assert.ok((PROMPT_KINDS as readonly string[]).includes(kind), `${chain} names prompt ${kind}`)
        assert.equal(said, language, `${chain}/${language} stays in one language`)
      }
      // and every script it runs is one the copy command actually writes
      for (const [, script] of text.matchAll(/\.agent\/rtlgraph\/([a-z-]+\.sh)/g)) {
        assert.ok(AGENT_FILES.some(f => f.to.endsWith(script)), `${chain} runs ${script}, which is shipped`)
      }
      // a chain that never stops is a chain that hands back 30 minutes of work
      assert.ok(text.includes('⏸'), `${chain}/${language} marks where to stop`)
      // …and one that carries on past a failure explains a run that did not pass
      assert.match(text, language === 'korean' ? /실패하면/ : /If a step fails/,
        `${chain}/${language} says what a failed step means`)
    }
  }
})

// The three things this extension produces that are prose rather than data —
// the comments in the RTL, the waveform analysis and the specification — fail
// the same way, so one section governs them, and a prompt that writes any of
// them has to point at it.
test('the prompts that write prose point at the writing principles', () => {
  const heading = 'Writing a reader can follow'
  assert.ok(spec.includes(`## ${heading}`), 'the spec defines them')
  // Constructive means checkable: every principle carries what to look for.
  // Counted inside that section alone — other sections table things too.
  const section = spec.slice(spec.indexOf(`## ${heading}`)).split('\n---')[0]
  const rows = [...section.matchAll(/^\| \d+ \| \*\*(.+?)\*\* \|/gm)].map(m => m[1])
  assert.equal(rows.length, 8, `eight principles, found ${rows}`)
  assert.match(section, /\| 6b \| \*\*Mark little\*\*/, 'and the one about marking too much')
  // The count is quoted in the prompts, so the section has to say the same
  // number it has — 6b sits outside it and is named separately.
  assert.match(section, /The eight principles below \(plus 6b/, 'the section counts itself honestly')
  assert.ok(section.includes('the specification Workflow R writes'),
    'and the specification is one of the things it governs')
  assert.ok(spec.includes('Curse of Knowledge') && spec.includes('People Can Follow'), 'and says where they came from')

  for (const kind of ['rtl', 'refactor', 'assignment', 'waveform', 'codespec'] as const) {
    for (const language of PROMPT_LANGUAGES) {
      assert.ok(flat(read(`assets/prompt/${COMPONENT_DIR}/${kind}/${language}.md`)).includes(heading),
        `${kind}/${language} points at "${heading}"`)
    }
  }
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

// A project that carries files nobody opens is a project people stop reading.
test('only the language asked for, and only the primitives the code uses', () => {
  const all = filesFor()
  assert.deepEqual(all.map(f => f.to).sort(), AGENT_FILES.map(f => f.to).sort(), 'asked nothing, carry everything')

  const korean = filesFor({ languages: ['korean'] })
  const prompts = korean.filter(f => f.to.startsWith('.prompt/')).map(f => f.to)
  assert.equal(prompts.some(to => /\/english\.md$|\/README\.md$/.test(to)), false, `no English prompts: ${prompts}`)
  assert.equal(korean.filter(f => f.to.startsWith('.prompt/')).length,
    PROMPT_KINDS.length + PROMPT_CHAINS.length + 1,
    'one per branch, one per chain, plus the guide')
  assert.ok(korean.some(f => f.to.endsWith('README.korean.md')), 'and the guide is the Korean one')

  const one = filesFor({ primitives: ['DFF'] })
  assert.deepEqual(one.filter(f => /^\.base\/.*\.v$/.test(f.to)).map(f => f.to), ['.base/DFF.v'])
  assert.ok(one.some(f => f.to === '.base/README.md'), 'the note that says what they are stays')
  // everything that is not a prompt or a primitive is always copied
  assert.equal(one.some(f => f.to === '.agent/rtlgraph/SPEC.md'), true)
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

// The brief is named once, in the root, and a schematic that names none inherits
// it. Checking each file on its own held every child to naming it again, which
// made a real user repeat a long "../../../.." path in eight files.
test('the bundled validator lets a component schematic inherit the brief of its root', () => {
  const run = (file: string) => spawnSync(process.execPath, [join(ROOT, VALIDATOR_BUNDLE), file], { encoding: 'utf8' })
  const PROJECT = join(ROOT, '../../demo/uart-p01')
  const dir = mkdtempSync(join(tmpdir(), 'rtlgraph-spec-'))
  const names = [
    'uart.rtlgraph.json', // the root comes first: it is the file the validator is given
    'uart.rtlgraph-schematic.json',
    'uart_transmitter.rtlgraph-schematic.json',
    'uart_receiver.rtlgraph-schematic.json',
  ]
  const copy = (strip: (name: string) => boolean) => {
    for (const name of names) {
      const graph = JSON.parse(readFileSync(join(PROJECT, 'rtlgraph', name), 'utf8'))
      graph.source.root = relative(dir, PROJECT)
      if (strip(name)) delete graph.source.spec
      writeFileSync(join(dir, name), JSON.stringify(graph))
    }
    return run(join(dir, names[0]))
  }

  // The demo repeats the document in every child; taking it out of the children
  // is what the spec says is allowed.
  const inherited = copy(name => name !== names[0])
  assert.equal(inherited.status, 0, inherited.stdout + inherited.stderr)
  assert.doesNotMatch(inherited.stdout, /spec-file/, 'the children quote the document the root names')

  // Named nowhere at all, and the quotes have no document again.
  const nowhere = copy(() => true)
  assert.equal(nowhere.status, 1)
  assert.match(nowhere.stdout, /error spec-file/)
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

// The handout and we are both allowed to call a bench `tb_uart.v`, and the
// reports are named after the bench: the second run overwrote the first, and
// since the marking one runs first, the report that survived was ours. So
// waveform/ mirrors tb/ — where a result came from is structural.
test('waveform/ mirrors tb/, so two benches of one name keep their reports', t => {
  const script = join(ROOT, 'assets/agent/run-tb.sh')
  const reader = join(ROOT, VALIDATOR_BUNDLE.replace('rtlgraph-validate', 'rtlgraph-wave'))
  if (spawnSync('iverilog', ['-V']).status !== 0) return t.skip('iverilog not installed')
  if (!existsSync(reader)) return t.skip('run `npm run build -w rtlgraph` first')

  const dir = mkdtempSync(join(tmpdir(), 'rtlgraph-twin-'))
  const demo = join(ROOT, '../../demo/hw')
  for (const file of ['hw_top.v', 'counter.v']) writeFileSync(join(dir, file), readFileSync(join(demo, file)))
  mkdirSync(join(dir, 'tb/given'), { recursive: true })
  mkdirSync(join(dir, 'tb/mine'), { recursive: true })
  for (const where of ['tb/given', 'tb/mine']) {
    writeFileSync(join(dir, where, 'tb_hw.v'), readFileSync(join(demo, 'tb_hw.v')))
  }
  // Run it the way it ships — from the project's own .agent/rtlgraph — since
  // that is how it finds wave.mjs beside itself.
  mkdirSync(join(dir, '.agent/rtlgraph'), { recursive: true })
  writeFileSync(join(dir, '.agent/rtlgraph/wave.mjs'), readFileSync(reader))
  writeFileSync(join(dir, '.agent/rtlgraph/run-tb.sh'), readFileSync(script))

  const run = spawnSync('bash', [join(dir, '.agent/rtlgraph/run-tb.sh'), '--project', dir, '--wave'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stdout)
  for (const side of ['given', 'mine']) {
    assert.ok(existsSync(join(dir, `waveform/${side}/tb_hw.waveform.json`)), `${side} kept its own report`)
    assert.ok(existsSync(join(dir, `waveform/${side}/tb_hw.vcd`)), `${side} kept its own dump`)
  }
  assert.equal(existsSync(join(dir, 'waveform/tb_hw.waveform.json')), false, 'nothing lands loose')
  // the report still finds what it cites, one level further down
  const report = JSON.parse(readFileSync(join(dir, 'waveform/given/tb_hw.waveform.json'), 'utf8'))
  assert.match(report.source.bench, /^\.\.\/\.\.\/tb\/given\/tb_hw\.v$/)
})
