import * as vscode from 'vscode'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { RenderState } from '../src/protocol.ts'
import { AGENT_FILES, ENVIRONMENT_FILE } from '../src/agent/files.ts'

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
  const prompts = expected.filter(f => f.startsWith('.prompt/')).length
  log(`Copy Agent Spec wrote ${expected.length} files: spec, validator, environment report, ${prompts} prompts`)

  const validate = spawnSync('node', [join(folder, '.agent/rtlgraph-validate.mjs'), graphFile], { encoding: 'utf8' })
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
  assert.deepEqual(first, { filter: { flow: ['data', 'control'], time: ['comb', 'reg', 'fsm'] }, nodes: 17, signals: 23, dim: 0, unfolded: ['acc'], editing: false, goals: 0 })
  log('the root opens its one main component: 5 root elements + 12 inside the frame, 4 + 15 nets + 4 frame connectors')

  await vscode.commands.executeCommand('rtlgraph.setPreset', 'datapath')
  const datapath = await until('the datapath render', async () => {
    const state = await renderState()
    return state && state.dim > 0 ? state : undefined
  })
  assert.deepEqual([datapath.filter, datapath.nodes, datapath.signals], [{ flow: ['data'], time: ['comb', 'reg', 'fsm'] }, 17, 23])
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
  assert.deepEqual([reopened.filter, reopened.unfolded, reopened.nodes], [{ flow: ['data'], time: ['comb', 'reg', 'fsm'] }, [], 5])
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

  const nested = await vscode.commands.executeCommand<string>('rtlgraph.openComponent', 'sys/u_dev/u_inbuf')
  assert.equal(nested, join(dirname(deep.fsPath), 'sys/dev/inbuf/inbuf.rtlgraph-schematic.json'))
  log('Open Component Schematic reaches a component two levels down')

  // ── back out of a component, three folders deep, to the root ──
  await until('the nested schematic to draw', renderState)
  const backToRoot = await vscode.commands.executeCommand<string>('rtlgraph.openRoot')
  assert.equal(backToRoot, deep.fsPath)
  await untilFold('the root again, as it was left', ['sys', 'sys/u_host', 'sys/u_dev', 'sys/u_dev/u_inbuf'])
  log('Root walks back out of inbuf/ to sys_top.rtlgraph.json')

  // ── open a component's own schematic ──
  await vscode.commands.executeCommand('vscode.open', uri)
  await until('the acc root again', renderState)
  const child = await vscode.commands.executeCommand<string>('rtlgraph.openComponent', 'acc')
  assert.equal(child, join(dirname(graphFile), 'acc/acc.rtlgraph-schematic.json'))
  const childState = await renderWith('the component schematic', 12)
  assert.deepEqual(childState, { filter: { flow: ['data', 'control'], time: ['comb', 'reg', 'fsm'] }, nodes: 12, signals: 15, dim: 0, unfolded: [], editing: false, goals: 0 })
  log('Open Component Schematic shows acc/acc.rtlgraph-schematic.json on its own (12 elements, 15 nets)')
}
