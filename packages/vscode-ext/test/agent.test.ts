import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { BASE_REGISTRY } from '@rtlgraph/registry'
import { AGENT_FILES, BASE_MODULES, PROMPT_KINDS, PROMPT_LANGUAGES, VALIDATOR_BUNDLE } from '../src/agent/files.ts'
import { buildEnvironmentReport } from '../src/agent/environment.ts'

const ROOT = join(import.meta.dirname, '..')
const GOLDEN = join(ROOT, '../../demo/acc/acc/acc.rtlgraph-schematic.json')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const flat = (text: string) => text.replace(/\s+/g, ' ')
const spec = read('assets/agent/RTLGRAPH_SPEC.md')

test('every file the command copies exists in the extension', () => {
  for (const { from } of AGENT_FILES) assert.ok(existsSync(join(ROOT, from)), from)
  assert.equal(AGENT_FILES.filter(f => f.to.startsWith('.prompt/')).length, PROMPT_KINDS.length * PROMPT_LANGUAGES.length)
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
      const needles = ['.agent/RTLGRAPH_SPEC.md', '.agent/ENVIRONMENT.md', '<PROJECT_ROOT_ABSOLUTE_PATH>']
      for (const needle of kind === 'spec' ? [...needles, 'SPEC.md'] : [...needles, 'rtlgraph-validate.mjs']) {
        assert.ok(prompt.includes(needle), `${kind}/${language} mentions ${needle}`)
      }
    }
  }
  assert.ok(flat(read('assets/prompt/rtlgraph/korean.md')).includes('절대 수정하지 마'))
  assert.ok(read('assets/prompt/rtl/english.md').includes('REQUEST ='))
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
