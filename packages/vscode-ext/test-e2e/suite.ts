import * as vscode from 'vscode'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { RenderState } from '../src/protocol.ts'
import { AGENT_FILES, ENVIRONMENT_FILE, PROMPT_DIR, RUN_TB, VALIDATOR_FILE } from '../src/agent/files.ts'

// Loaded by VS Code via --extensionTestsPath; resolves on success, throws on failure.
// RTLGRAPH_E2E_FILE is the root file demo/acc/acc_top.rtlgraph.json: one main
// component "acc" whose schematic is acc/acc.rtlgraph-schematic.json.

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function until<T>(what: string, probe: () => Thenable<T | undefined> | T | undefined, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(200)
  }
}

const renderState = () => vscode.commands.executeCommand<RenderState | undefined>('rtlgraph._renderState')
const renderWith = (what: string, nodes: number) =>
  until(what, async () => {
    const state = await renderState()
    return state?.nodes === nodes ? state : undefined
  })
const log = (msg: string) => console.log(`[e2e] ✓ ${msg}`)

export async function run(): Promise<void> {
  const graphFile = process.env.RTLGRAPH_E2E_FILE!
  const uri = vscode.Uri.file(graphFile)

  // ── Copy Agent Spec to Workspace ──
  const folder = mkdtempSync(join(tmpdir(), 'rtlgraph-e2e-'))
  const written = await vscode.commands.executeCommand<string[]>('rtlgraph.copyAgentSpec', vscode.Uri.file(folder))
  const expected = [...AGENT_FILES.map(f => f.to), ENVIRONMENT_FILE].sort()
  assert.deepEqual([...(written ?? [])].sort(), expected)
  for (const file of expected) assert.ok(existsSync(join(folder, file)), file)
  assert.match(readFileSync(join(folder, ENVIRONMENT_FILE), 'utf8'), /^# RTLGraph — Agent Environment Report/)
  assert.equal(ENVIRONMENT_FILE, '.agent/rtlgraph/ENVIRONMENT.md') // a folder of our own, not a name others also write
  const prompts = expected.filter(f => /^\.prompt\/rtlgraph\/[a-z]+\//.test(f)).length
  const guides = expected.filter(f => /^\.prompt\/rtlgraph\/README/.test(f)).length
  const primitives = expected.filter(f => f.startsWith('.base/') && f.endsWith('.v')).length
  // The primitives are copied, not referenced: a project that instantiates DFF
  // has to carry DFF or it will not elaborate anywhere else.
  assert.equal(readFileSync(join(folder, '.base/DFF.v'), 'utf8'),
    readFileSync(join(dirname(dirname(graphFile)), 'base/DFF.v'), 'utf8'),
    'the copied library is the one the demos use')
  log(`Copy Agent Spec wrote ${expected.length} files: spec, validator, environment report, `
    + `${prompts} prompts and ${guides} guides to choosing one, ${primitives} primitives in .base/`)
  const assignment = readFileSync(join(folder, '.prompt/rtlgraph/assignment/korean.md'), 'utf8')
  assert.match(assignment, /Follow the code/)

  // The report used to be .agent/ENVIRONMENT.md, which NodeGraph writes too.
  // A leftover copy of ours is stale and removed; anyone else's is left alone.
  writeFileSync(join(folder, '.agent/ENVIRONMENT.md'), '# RTLGraph — Agent Environment Report\n\nold\n')
  await vscode.commands.executeCommand('rtlgraph.copyAgentSpec', vscode.Uri.file(folder))
  assert.ok(!existsSync(join(folder, '.agent/ENVIRONMENT.md')), 'our superseded report is removed')
  writeFileSync(join(folder, '.agent/ENVIRONMENT.md'), '# NodeGraph — Agent Environment Report\n')
  mkdirSync(join(folder, '.prompt/code'), { recursive: true })
  writeFileSync(join(folder, '.prompt/code/korean.md'), 'another tool\'s prompt\n')
  await vscode.commands.executeCommand('rtlgraph.copyAgentSpec', vscode.Uri.file(folder))
  assert.match(readFileSync(join(folder, '.agent/ENVIRONMENT.md'), 'utf8'), /^# NodeGraph/, "another tool's report is untouched")
  assert.ok(existsSync(join(folder, '.prompt/code/korean.md')), "another tool's prompts are untouched")
  log('everything we write is under .agent/rtlgraph/ and .prompt/rtlgraph/; only our own leftovers are cleaned up')

  // Running the command again must not undo a primitive the project adapted to
  // its own code — the UART assignment's DFF takes BITWIDTH, and overwriting it
  // leaves a project that no longer elaborates.
  const adapted = readFileSync(join(folder, '.base/DFF.v'), 'utf8').replace(/\bBW\b/g, 'BITWIDTH')
  writeFileSync(join(folder, '.base/DFF.v'), adapted)
  writeFileSync(join(folder, '.prompt/rtlgraph/assignment/korean.md'), 'edited by hand\n')
  await vscode.commands.executeCommand<string[]>('rtlgraph.copyAgentSpec', vscode.Uri.file(folder))
  assert.equal(readFileSync(join(folder, '.base/DFF.v'), 'utf8'), adapted, '.base/DFF.v kept as the project adapted it')
  assert.match(readFileSync(join(folder, '.prompt/rtlgraph/assignment/korean.md'), 'utf8'), /Follow the code/, 'prompts are refreshed')
  log('a second Copy Agent Spec refreshes the prompts and leaves the adapted .base/DFF.v alone')

  // The runner ships with them, and it has to be executable to be of any use.
  assert.ok((statSync(join(folder, RUN_TB)).mode & 0o111) !== 0, 'run-tb.sh is executable')
  const madeFolders = spawnSync('bash', [join(folder, RUN_TB), 'given'], { encoding: 'utf8' })
  assert.match(madeFolders.stdout, /tb\/given\/ is empty/)
  for (const made of ['tb/given', 'tb/mine']) assert.ok(existsSync(join(folder, made)), `${made} is there, waiting`)
  log('run-tb.sh makes tb/given and tb/mine, and says which one is empty')

  // The prompts are picked by branch and the path goes to the clipboard, which is
  // how they are used: pasted into an agent.
  const copied = await vscode.commands.executeCommand<string>('rtlgraph.copyPromptPath', { kind: 'assignment', folder })
  assert.equal(copied, join(folder, PROMPT_DIR, 'assignment/english.md'))
  assert.equal(await vscode.env.clipboard.readText(), copied)
  log(`Copy Prompt Path puts ${PROMPT_DIR}/assignment/english.md on the clipboard`)

  // The waveform view: a report opens as a drawing, and the drawing knows the
  // places worth going to — how it came up, then a marker per check.
  const waveReport = join(dirname(dirname(graphFile)), 'uart-p01/waveform/tb_uart_corner.waveform.json')
  if (existsSync(waveReport)) {
    // RTLGRAPH_SHOT_LANG lets a screenshot show the other language without
    // restarting VS Code in a different locale.
    if (process.env.RTLGRAPH_SHOT_LANG) {
      await vscode.workspace.getConfiguration('rtlgraph').update('language', process.env.RTLGRAPH_SHOT_LANG, true)
    }
    const waveDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(waveReport))
    await vscode.commands.executeCommand('vscode.openWith', waveDoc.uri, 'rtlgraph.waveform')
    await sleep(1500)
    const tab = vscode.window.tabGroups.all.flatMap(g => g.tabs).find(t => t.label === 'tb_uart_corner.waveform.json')
    assert.ok(tab, 'the report opens in a tab of its own name')
    assert.equal((tab?.input as { viewType?: string })?.viewType?.endsWith('rtlgraph.waveform'), true,
      'and it opens as the waveform view rather than as JSON')
    // RTLGRAPH_SHOT=<file>: photograph the view rather than describing it.
    if (process.env.RTLGRAPH_SHOT) {
      await sleep(2500)
      spawnSync('import', ['-window', 'root', process.env.RTLGRAPH_SHOT])
    }
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    log('tb_uart_corner.waveform.json opens in the waveform view')
  } else {
    log('no waveform report built here; skipping the waveform view')
  }

  // The palette can run the two shipped scripts. The command opens a terminal,
  // so what it returns is the script it found — that it resolved the namespaced
  // path at all is the thing worth pinning.
  const ran = await vscode.commands.executeCommand<string>('rtlgraph.runTestbenches', { which: 'mine', folder })
  assert.equal(ran, join(folder, RUN_TB))
  const terminal = vscode.window.terminals.find(t => t.name.includes('run-tb.sh'))
  assert.ok(terminal, 'a terminal is opened for the run')
  terminal?.dispose()
  log('Run the Testbenches finds .agent/rtlgraph/run-tb.sh and runs it in a terminal')

  const validate = spawnSync('node', [join(folder, VALIDATOR_FILE), graphFile], { encoding: 'utf8' })
  assert.equal(validate.status, 0, validate.stdout + validate.stderr)
  log('the copied validator runs on its own: ' + validate.stdout.trim().split('\n').pop()!.trim())

  // ── custom editor on the root file ──
  await vscode.commands.executeCommand('vscode.open', uri)
  const tab = await until('the custom editor tab', () => {
    const active = vscode.window.tabGroups.activeTabGroup.activeTab
    return active?.input instanceof vscode.TabInputCustom ? active : undefined
  })
  assert.equal((tab.input as vscode.TabInputCustom).viewType, 'rtlgraph.editor')
  log('*.rtlgraph.json opens in the RTLGraph editor by default')

  const first = await until('the first render', renderState)
  assert.deepEqual(first, { filter: { comb: ['data', 'control'], seq: ['reg', 'fsm'] }, nodes: 17, signals: 23, dim: 0, unfolded: ['acc'], editing: false, goals: 0 })
  log('the root opens its one main component: 5 root elements + 12 inside the frame, 4 + 15 nets + 4 frame connectors')

  await vscode.commands.executeCommand('rtlgraph.setPreset', 'datapath')
  const datapath = await until('the datapath render', async () => {
    const state = await renderState()
    return state && state.dim > 0 ? state : undefined
  })
  assert.deepEqual([datapath.filter, datapath.nodes, datapath.signals], [{ comb: ['data'], seq: ['reg'] }, 17, 23])
  log(`the datapath preset fades what it passes over instead of removing it (${datapath.dim} of 40 faded, nothing cut)`)

  // ── export the current (datapath, unfolded) view; a folder of its own leaves the user's exports alone ──
  await vscode.workspace.getConfiguration('rtlgraph').update('export.folder', '.out-e2e-${name}', vscode.ConfigurationTarget.Global)
  const outDir = join(dirname(graphFile), '.out-e2e-acc_top')
  try {
    const exported = await vscode.commands.executeCommand<string[]>('rtlgraph.export', ['svg', 'png', 'pdf'])
    assert.deepEqual(exported, ['svg', 'png', 'pdf'].map(ext => join(outDir, `acc_top.datapath.${ext}`)))
    const svg = readFileSync(exported[0], 'utf8')
    const [, , width, height] = /viewBox="(-?\d+) (-?\d+) (\d+) (\d+)"/.exec(svg)!.slice(1).map(Number)
    // the wrapper root is left out of a figure: ids are the component's own
    assert.ok(svg.includes('data-node-id="data_path.u_mux"'))
    assert.ok(!svg.includes('data-node-id="acc"'), 'the wrapper root is left out of a figure')
    assert.match(svg, /<g class="node control dim" data-node-id="control_path"/) // greyed, not cut
    const png = readFileSync(exported[1])
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [width * 2, height * 2])
    const pdf = readFileSync(exported[2], 'latin1')
    assert.ok(pdf.startsWith('%PDF-1.4') && pdf.includes(`/MediaBox [0 0 ${width} ${height}]`))
    log(`Export wrote acc_top.datapath.{svg,png,pdf} with the frame open (PNG ${width * 2}×${height * 2}, PDF ${width}×${height} pt)`)
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }

  // ── fold / unfold ──
  assert.equal(await vscode.commands.executeCommand('rtlgraph.fold'), 'all')
  const folded = await renderWith('the folded render', 5)
  assert.deepEqual(folded.unfolded, [])
  log('Fold with nothing selected folds the whole hierarchy (5 elements left)')

  assert.equal(await vscode.commands.executeCommand('rtlgraph.unfold', { instance: 'acc', scope: 'node' }), 'node')
  assert.deepEqual((await renderWith('the unfolded render', 17)).unfolded, ['acc'])
  assert.equal(await vscode.commands.executeCommand('rtlgraph.fold', { instance: 'acc', scope: 'descendants' }), 'descendants')
  await renderWith('the render folded again', 5)
  log('a selected component folds and unfolds on its own or with everything inside')

  await vscode.commands.executeCommand('rtlgraph.fitView')

  await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  await until('the editor to close', async () => ((await renderState()) === undefined ? true : undefined))
  await vscode.commands.executeCommand('vscode.open', uri)
  const reopened = await until('the render after reopening', renderState)
  assert.deepEqual([reopened.filter, reopened.unfolded, reopened.nodes], [{ comb: ['data'], seq: ['reg'] }, [], 5])
  log('the chosen filter and fold state survive closing and reopening the file')

  const document = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
  assert.ok(document && !document.isDirty)
  log('viewing, filtering and folding never dirtied the document')

  // ── three levels: demo/sys ──
  const deep = vscode.Uri.file(join(dirname(dirname(graphFile)), 'sys/sys_top.rtlgraph.json'))
  await vscode.commands.executeCommand('vscode.open', deep)
  const untilFold = (what: string, unfolded: string[]) =>
    until(what, async () => {
      const state = await renderState()
      return state && JSON.stringify(state.unfolded) === JSON.stringify(unfolded) ? state : undefined
    })

  const deepOpen = await untilFold('the nested root to open its main component', ['sys'])
  assert.ok(deepOpen.nodes > 0)
  await vscode.commands.executeCommand('rtlgraph.unfold')
  const all = await untilFold('every level open', ['sys', 'sys/u_host', 'sys/u_dev', 'sys/u_dev/u_inbuf'])
  log(`three levels open at once: ${all.nodes} elements, ${all.signals} nets, deepest is sys/u_dev/u_inbuf`)

  await vscode.commands.executeCommand('rtlgraph.fold', { instance: 'sys/u_dev', scope: 'descendants' })
  const branch = await untilFold('one branch folded', ['sys', 'sys/u_host'])
  assert.ok(branch.nodes < all.nodes)
  await vscode.commands.executeCommand('rtlgraph.unfold', { instance: 'sys/u_dev/u_inbuf', scope: 'node' })
  await untilFold('unfolding a deep box opens the way to it', ['sys', 'sys/u_host', 'sys/u_dev', 'sys/u_dev/u_inbuf'])
  log('folding a branch and reopening the box two levels down both work')

  // Opening a box shows one level: what was open inside it is not brought back.
  await vscode.commands.executeCommand('rtlgraph.fold', { instance: 'sys/u_dev', scope: 'node' })
  await untilFold('the branch folded on its own', ['sys', 'sys/u_host'])
  await vscode.commands.executeCommand('rtlgraph.unfold', { instance: 'sys/u_dev', scope: 'node' })
  await untilFold('reopening it shows one level', ['sys', 'sys/u_host', 'sys/u_dev'])
  log('a box reopens to one level, not to whatever was open inside it before')

  const nested = await vscode.commands.executeCommand<string>('rtlgraph.openComponent', 'sys/u_dev/u_inbuf')
  assert.equal(nested, join(dirname(deep.fsPath), 'sys/dev/inbuf/inbuf.rtlgraph-schematic.json'))
  log('Open Component Schematic reaches a component two levels down')

  // ── back out of a component, three folders deep, a level at a time ──
  await until('the nested schematic to draw', renderState)
  const upOne = await vscode.commands.executeCommand<string>('rtlgraph.openPrevious', { step: 'up' })
  assert.equal(upOne, join(dirname(deep.fsPath), 'sys/dev/dev.rtlgraph-schematic.json'), 'inbuf -> dev, not straight to the root')
  await until('the schematic one level out', renderState)
  const upAgain = await vscode.commands.executeCommand<string>('rtlgraph.openPrevious', { step: 'up' })
  assert.equal(upAgain, join(dirname(deep.fsPath), 'sys/sys.rtlgraph-schematic.json'), 'dev -> sys')
  await until('the main component', renderState)
  const outToRoot = await vscode.commands.executeCommand<string>('rtlgraph.openPrevious', { step: 'up' })
  assert.equal(outToRoot, deep.fsPath, 'and the step above the main component is the root')
  log('Prev walks out of inbuf/ one level at a time: dev, sys, then the root')

  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(join(dirname(deep.fsPath), 'sys/dev/inbuf/inbuf.rtlgraph-schematic.json')))
  await until('the nested schematic again', renderState)
  const backToRoot = await vscode.commands.executeCommand<string>('rtlgraph.openPrevious', { step: 'root' })
  assert.equal(backToRoot, deep.fsPath)
  // As it was left: u_inbuf went back to folded when u_dev was folded and opened again.
  await untilFold('the root again, as it was left', ['sys', 'sys/u_host', 'sys/u_dev'])
  log('and the other choice goes all the way out to sys_top.rtlgraph.json')

  // ── open a component's own schematic ──
  await vscode.commands.executeCommand('vscode.open', uri)
  await until('the acc root again', renderState)
  const child = await vscode.commands.executeCommand<string>('rtlgraph.openComponent', 'acc')
  assert.equal(child, join(dirname(graphFile), 'acc/acc.rtlgraph-schematic.json'))
  const childState = await renderWith('the component schematic', 12)
  assert.deepEqual(childState, { filter: { comb: ['data', 'control'], seq: ['reg', 'fsm'] }, nodes: 12, signals: 15, dim: 0, unfolded: [], editing: false, goals: 0 })
  log('Open Component Schematic shows acc/acc.rtlgraph-schematic.json on its own (12 elements, 15 nets)')

  // ── the code behind a box ──
  await vscode.commands.executeCommand('vscode.open', uri)
  await until('the acc root once more', renderState)
  assert.equal(vscode.window.tabGroups.all.length, 1, 'one group so far')
  const code = await vscode.commands.executeCommand<string>('rtlgraph.openCode', 'acc')
  assert.equal(code, `${join(dirname(graphFile), 'acc/seq/acc_top.v')}:3`)
  const opened = vscode.window.activeTextEditor
  assert.equal(opened?.document.uri.fsPath, join(dirname(graphFile), 'acc/seq/acc_top.v'))
  assert.equal(opened?.selection.start.line, 2, 'the cursor is on the line the box came from')
  // Beside the drawing, not on top of it: the schematic keeps its own group.
  assert.equal(vscode.window.tabGroups.all.length, 2, 'a group was made to the right')
  assert.equal(opened?.viewColumn, vscode.ViewColumn.Two)
  log('Open Code jumps from a box to the line of Verilog it came from, beside the schematic')

  // Jumping again goes to the same group instead of splitting the window further.
  await vscode.commands.executeCommand('rtlgraph.openCode', 'acc')
  assert.equal(vscode.window.tabGroups.all.length, 2, 'and keeps using that group')

  // The files kept in a folder of their own: the jump has to climb out of it, and
  // the box is two levels down.
  const lab = vscode.Uri.file(join(dirname(dirname(graphFile)), 'lab/rtlgraph/lab_top.rtlgraph.json'))
  await vscode.commands.executeCommand('vscode.open', lab)
  await until('the lab root', renderState)
  const deepCode = await vscode.commands.executeCommand<string>('rtlgraph.openCode', 'lab/u_shift/q_reg')
  assert.equal(deepCode, `${join(dirname(dirname(graphFile)), 'lab/src/shift_reg.v')}:11`)
  log('Open Code climbs out of rtlgraph/ to ../src for a box two levels down')

  // ── the requirement a box is there for ──
  const demoDir = dirname(dirname(graphFile))
  const pwmRoot = vscode.Uri.file(join(demoDir, 'pwm/pwm_top.rtlgraph.json'))
  await vscode.commands.executeCommand('vscode.open', pwmRoot)
  await until('the pwm root drawn', renderState)
  const groupsBefore = vscode.window.tabGroups.all.length
  const brief = await vscode.commands.executeCommand<
    { path: string; page?: number; pages?: number; found?: boolean; error?: string }>('rtlgraph.openSpec', 'pwm')
  assert.equal(brief.error, undefined, `the reader failed: ${brief.error}`)
  assert.equal(brief.path, join(demoDir, 'pwm/spec/pwm_brief.pdf'))
  assert.equal(brief.page, 1)
  assert.equal(brief.pages, 1, `the reader read the document, not just the file name (got ${JSON.stringify(brief)})`)
  assert.equal(brief.found, true, 'and found the sentence the box quotes')
  const briefTab = await until('the brief to open', () =>
    vscode.window.tabGroups.all.flatMap(group => group.tabs.map(tab => ({ group, tab })))
      .find(({ tab }) => tab.label.endsWith('pwm_brief.pdf')))
  assert.ok(vscode.window.tabGroups.all.length >= groupsBefore, 'it opened beside, not over the drawing')
  assert.notEqual(briefTab.group.viewColumn, vscode.window.tabGroups.activeTabGroup.viewColumn === 1 ? 0 : 1)
  log('Open Requirement opens the brief the design was asked for, beside the drawing')

  // A box that quotes no sentence is still part of a design built from a brief,
  // so it opens the document — just without a page to jump to.
  const whole = await vscode.commands.executeCommand<{ path: string; page?: number; found?: boolean }>(
    'rtlgraph.openSpec', 'pwm/PERIOD_FF')
  assert.equal(whole.path, join(demoDir, 'pwm/spec/pwm_brief.pdf'))
  assert.equal(whole.page, undefined, 'nothing was quoted, so no page is claimed')
  assert.equal(whole.found, false)
  log('a box that quotes nothing opens the brief itself, with no page')

  // The file icon rides on a language of our own: if the association stops
  // matching, these files silently go back to the plain JSON icon in the tab.
  for (const [path, mine] of ([
    ['pwm/pwm_top.rtlgraph.json', true],
    ['pwm/pwm/pwm.rtlgraph-schematic.json', true],
    ['pwm/pwm/pwm.rtlgraph-fsm.json', true],
    ['uart-p01/waveform/tb_uart_corner.waveform.json', true],
    ['pwm/pwm/seq/pwm_top.v', false],
  ] as const).filter(([path]) => existsSync(join(demoDir, path)))) {
    const opened = await vscode.workspace.openTextDocument(vscode.Uri.file(join(demoDir, path)))
    if (mine) assert.equal(opened.languageId, 'rtlgraph', `${path} is not associated with RTLGraph`)
    else assert.notEqual(opened.languageId, 'rtlgraph', `${path} must not be claimed by RTLGraph`)
  }
  log('every *.rtlgraph*.json is bound to the RTLGraph language, and nothing else is')

  // ── state machines: demo/pwm, three levels with a machine at two of them ──
  const demo = demoDir
  const pwmSchematic = vscode.Uri.file(join(demo, 'pwm/pwm/pwm.rtlgraph-schematic.json'))
  await vscode.commands.executeCommand('vscode.open', pwmSchematic)
  await until('the pwm schematic', renderState)
  const machine = await vscode.commands.executeCommand<string>('rtlgraph.openFsm')
  assert.equal(machine, join(demo, 'pwm/pwm/pwm.rtlgraph-fsm.json'))
  const diagram = await until('the state diagram', async () => {
    const state = await renderState()
    return state?.fsm ? state : undefined
  })
  assert.deepEqual(diagram.fsm, { states: 3, transitions: 5 })
  assert.equal(diagram.nodes, 3, 'one group per state')
  assert.equal(diagram.signals, 6, 'one per transition, plus the reset arrow')
  log('a *.rtlgraph-fsm.json file opens as a diagram: 3 states, 5 transitions')

  const back = await vscode.commands.executeCommand<string>('rtlgraph.openSchematic')
  assert.equal(back, pwmSchematic.fsPath)
  await until('the schematic again', async () => {
    const state = await renderState()
    return state && state.fsm === undefined ? state : undefined
  })
  log('Schematic walks back from the machine to the component it belongs to')

  // A machine is a figure of its own: no filter in its name, and no hierarchy.
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(machine))
  await until('the diagram again', async () => (await renderState())?.fsm)
  const fsmOut = join(demo, 'pwm/pwm/.out-e2e-pwm')
  const drawn = await vscode.commands.executeCommand<string[]>('rtlgraph.export', ['svg', 'xlsx'])
  try {
    assert.deepEqual(drawn, [join(fsmOut, 'pwm.fsm.svg'), join(fsmOut, 'pwm.fsm.xlsx')])
    const svg = readFileSync(drawn![0], 'utf8')
    assert.ok(svg.includes('>IDLE<') && svg.includes('>the core is activated<'))
    // The workbook is a zip whose directory names the five parts a sheet needs.
    const book = readFileSync(drawn![1])
    assert.deepEqual([...book.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04])
    const inside = book.toString('latin1')
    assert.ok(inside.includes('xl/worksheets/sheet3.xml') && inside.includes('the core is activated'))
    log('Export writes pwm.fsm.svg and pwm.fsm.xlsx: the diagram and the table it was built from')
  } finally {
    rmSync(fsmOut, { recursive: true, force: true })
  }

  // ── the control tables of a whole design ──
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(join(demo, 'pwm/pwm_top.rtlgraph.json')))
  await until('the pwm root', renderState)
  const bookOut = join(demo, 'pwm/.out-e2e-pwm_top')
  const tables = await vscode.commands.executeCommand<string[]>('rtlgraph.export', ['xlsx'])
  try {
    assert.deepEqual(tables, [join(bookOut, 'pwm_top.control.xlsx')])
    const inside = readFileSync(tables![0]).toString('latin1')
    // Every level's control blocks are in it, named by the instance they belong to.
    for (const what of ['pwm signals', 'pwm/u_pulse', 'pwm/u_pulse/u_cnt', 'the counter has run out']) {
      assert.ok(inside.includes(what), what)
    }
    log('Export writes pwm_top.control.xlsx with every control block of the three levels')
  } finally {
    rmSync(bookOut, { recursive: true, force: true })
  }
}
