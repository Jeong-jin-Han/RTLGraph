import * as vscode from 'vscode'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RenderState } from '../src/protocol.ts'
import { AGENT_FILES, ENVIRONMENT_FILE } from '../src/agent/files.ts'

// Loaded by VS Code via --extensionTestsPath; resolves on success, throws on failure.

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
  log(`Copy Agent Spec wrote ${expected.length} files: spec, validator, environment report, 4 prompts`)

  const validate = spawnSync('node', [join(folder, '.agent/rtlgraph-validate.mjs'), graphFile], { encoding: 'utf8' })
  assert.equal(validate.status, 0, validate.stdout + validate.stderr)
  log('the copied validator runs on its own: ' + validate.stdout.trim().split('\n').pop()!.trim())

  // ── custom editor ──
  await vscode.commands.executeCommand('vscode.open', uri)
  const tab = await until('the custom editor tab', () => {
    const active = vscode.window.tabGroups.activeTabGroup.activeTab
    return active?.input instanceof vscode.TabInputCustom ? active : undefined
  })
  assert.equal((tab.input as vscode.TabInputCustom).viewType, 'rtlgraph.editor')
  log('*.rtlgraph.json opens in the RTLGraph editor by default')

  const first = await until('the first render', renderState)
  assert.deepEqual(first, { filter: { flow: ['data', 'control'], time: ['comb', 'seq'] }, nodes: 12, signals: 15 })
  log('webview parsed, laid out and drew 12 nodes and 15 nets (CLK hidden)')

  await vscode.commands.executeCommand('rtlgraph.setPreset', 'datapath')
  const datapath = await until('the datapath render', async () => {
    const state = await renderState()
    return state?.nodes === 8 ? state : undefined
  })
  assert.deepEqual(datapath, { filter: { flow: ['data'], time: ['comb', 'seq'] }, nodes: 8, signals: 7 })
  log('datapath preset leaves the 8 elements and 7 nets of slide p.31')

  await vscode.commands.executeCommand('rtlgraph.fitView')

  await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  await until('the editor to close', async () => ((await renderState()) === undefined ? true : undefined))
  await vscode.commands.executeCommand('vscode.open', uri)
  const reopened = await until('the render after reopening', renderState)
  assert.deepEqual(reopened.filter, { flow: ['data'], time: ['comb', 'seq'] })
  log('the chosen filter survives closing and reopening the file')

  const document = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
  assert.ok(document && !document.isDirty)
  log('viewing and filtering never dirtied the document')
}
