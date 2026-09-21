import * as vscode from 'vscode'
import { execSync } from 'node:child_process'
import { chmodSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { AGENT_FILES, ENVIRONMENT_FILE } from './files.ts'
import { buildEnvironmentReport, PROBES, type Companion, type EnvironmentFacts, type ProbedTool } from './environment.ts'

// First stdout line of a version command, or undefined when the tool is missing.
function probe(command: string): string | undefined {
  try {
    const out = execSync(command, { timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return out.split(/\r?\n/).map(line => line.trim()).find(Boolean)
  } catch {
    return undefined
  }
}

// Vivado is often installed but not on PATH; look for its settings script.
function vivadoSettings(): string[] {
  const script = process.platform === 'win32' ? 'settings64.bat' : 'settings64.sh'
  const bases = process.platform === 'win32' ? ['C:\\Xilinx'] : ['/tools/Xilinx', '/opt/Xilinx']
  const list = (dir: string) => {
    try {
      return readdirSync(dir)
    } catch {
      return []
    }
  }
  const found = bases.flatMap(base => [
    ...list(join(base, 'Vivado')).map(version => join(base, 'Vivado', version, script)), // <= 2024.x
    ...list(base).map(version => join(base, version, 'Vivado', script)), // >= 2025.1
  ])
  return [...new Set(found.filter(existsSync))].sort()
}

export function collectEnvironment(): EnvironmentFacts {
  const facts: EnvironmentFacts = { generated: new Date().toISOString(), platform: process.platform, vivadoSettings: vivadoSettings() }
  for (const tool of Object.keys(PROBES) as ProbedTool[]) facts[tool] = probe(PROBES[tool])
  facts.nodegraph = companion('JeongjinHan.nodegraph', '.agent/NODEGRAPH_SPEC.md')
  return facts
}

// An extension this one can work with, and where its own agent spec is, so the
// agent reads that rather than guessing at its file format.
function companion(id: string, spec: string): Companion | undefined {
  const found = vscode.extensions.getExtension(id)
  if (!found) return undefined
  const version = (found.packageJSON as { version?: string }).version ?? 'unknown'
  const path = vscode.Uri.joinPath(found.extensionUri, spec).fsPath
  return { version, ...(existsSync(path) ? { spec: path } : {}) }
}

export interface CopyResult {
  written: string[]
  /** `.base/` files left as they were, because the project had adapted them. */
  kept: string[]
}

// The prompts tell the agent to adapt a primitive to the code that instantiates
// it — the UART assignment's DFF takes BITWIDTH where the stock one takes BW —
// so overwriting `.base/` on the next run would break a project that elaborates.
async function adapted(extensionUri: vscode.Uri, from: string, to: string, at: vscode.Uri): Promise<boolean> {
  if (!to.startsWith('.base/') || !to.endsWith('.v')) return false
  try {
    const there = await vscode.workspace.fs.readFile(at)
    const ours = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, from))
    return Buffer.compare(Buffer.from(there), Buffer.from(ours)) !== 0
  } catch {
    return false // not there yet, or unreadable: write it
  }
}

// Opt-in: only runs from the command, never on activation, so nothing lands in a
// repository the user did not choose.
export async function copyAgentSpec(extensionUri: vscode.Uri, target: vscode.Uri): Promise<CopyResult> {
  const write = async (to: string, bytes: Uint8Array) => {
    const destination = vscode.Uri.joinPath(target, to)
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(destination, '..'))
    await vscode.workspace.fs.writeFile(destination, bytes)
  }
  const written: string[] = []
  const kept: string[] = []
  for (const { from, to } of AGENT_FILES) {
    const destination = vscode.Uri.joinPath(target, to)
    if (await adapted(extensionUri, from, to, destination)) {
      kept.push(to)
      written.push(to)
      continue
    }
    await write(to, await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, from)))
    // A script nobody can run is a script nobody uses; fs.writeFile has no mode.
    if (to.endsWith('.sh') && destination.scheme === 'file') {
      try {
        chmodSync(destination.fsPath, 0o755)
      } catch {
        // a filesystem without modes (a Windows share, say) — the file is still there
      }
    }
    written.push(to)
  }
  await write(ENVIRONMENT_FILE, new TextEncoder().encode(buildEnvironmentReport(collectEnvironment())))
  written.push(ENVIRONMENT_FILE)
  await removeOurOldReport(target)
  return { written, kept }
}

// Until 0.1.1 the report was `.agent/ENVIRONMENT.md`, a name NodeGraph writes as
// well — whoever ran last won, and the prompts could end up reading the other
// extension's report. The file moved; a copy of ours left behind is stale, so it
// goes. One written by anything else is left exactly where it is.
const OLD_REPORT = '.agent/ENVIRONMENT.md'
const OUR_HEADER = '# RTLGraph — Agent Environment Report'

async function removeOurOldReport(target: vscode.Uri): Promise<void> {
  const old = vscode.Uri.joinPath(target, OLD_REPORT)
  try {
    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(old))
    if (text.startsWith(OUR_HEADER)) await vscode.workspace.fs.delete(old)
  } catch {
    // not there, or not readable — nothing to tidy
  }
}
