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

// Opt-in: only runs from the command, never on activation, so nothing lands in a
// repository the user did not choose.
export async function copyAgentSpec(extensionUri: vscode.Uri, target: vscode.Uri): Promise<string[]> {
  const write = async (to: string, bytes: Uint8Array) => {
    const destination = vscode.Uri.joinPath(target, to)
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(destination, '..'))
    await vscode.workspace.fs.writeFile(destination, bytes)
  }
  const written: string[] = []
  for (const { from, to } of AGENT_FILES) {
    await write(to, await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, from)))
    // A script nobody can run is a script nobody uses; fs.writeFile has no mode.
    const destination = vscode.Uri.joinPath(target, to)
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
  return written
}
