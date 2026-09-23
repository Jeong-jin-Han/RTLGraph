import * as vscode from 'vscode'
import { FILTER_PRESETS, type FilterPreset } from '@rtlgraph/ir'
import { RtlGraphEditorProvider } from './editorProvider.ts'
import { PRESET_LABELS } from './webview/state.ts'
import { copyAgentSpec } from './agent/copyAgentSpec.ts'
import { WaveViewProvider } from './waveView.ts'
import { AGENT_DIR, MAKE_SUBMISSION, PROMPT_DIR, RUN_TB } from './agent/files.ts'
import { exportSchematic } from './export.ts'
import { EXPORT_FORMATS, viewName, type ExportFormat } from './exportFiles.ts'
import { collectHierarchyFiles } from './hierarchyFiles.ts'
import { openBeside, openCodeBeside } from './openCode.ts'
import { MATERIAL_ICON, withRtlgraphFiles } from './explorerIcons.ts'
import { openRequirement } from './specView.ts'
import { fsmFileName, graphFileKind, graphName, hierarchyEntries, loadHierarchy, schematicFileName } from '@rtlgraph/ir'
import type { FoldAction, FoldScope } from './protocol.ts'

// The folder a command acts on: the one right-clicked in the Explorer, else the
// only workspace folder, else the one the user picks.
async function resolveTargetFolder(clicked: unknown): Promise<vscode.Uri | undefined> {
  if (clicked instanceof vscode.Uri) return clicked
  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length <= 1) return folders[0]?.uri
  const picked = await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Folder to copy the RTLGraph agent files into' })
  return picked?.uri
}

const FOLD_SCOPES: readonly FoldScope[] = ['all', 'node', 'descendants']
const ROOT_SEARCH_DEPTH = 8

// Every prompt the workspace has, as "<branch>/<language>" with what it is for.
const PROMPT_ABOUT: Record<string, string> = {
  spec: 'an idea → SPEC.md',
  waveform: 'a simulation that ran → why it behaved that way',
  rtl: 'a spec → new RTL in the three-layer layout',
  refactor: 'existing RTL → restructured RTL',
  rtlgraph: 'existing RTL → RTLGraph, your own project',
  assignment: 'existing RTL → RTLGraph, code that may not be touched',
}

async function promptsIn(folder: vscode.Uri): Promise<{ label: string; description: string; uri: vscode.Uri }[]> {
  const root = vscode.Uri.joinPath(folder, PROMPT_DIR)
  let kinds: [string, vscode.FileType][] = []
  try {
    kinds = await vscode.workspace.fs.readDirectory(root)
  } catch {
    return []
  }
  const out: { label: string; description: string; uri: vscode.Uri }[] = []
  for (const [kind, type] of kinds) {
    if (type !== vscode.FileType.Directory) continue
    for (const [file, kindOfFile] of await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(root, kind))) {
      if (kindOfFile !== vscode.FileType.File || !file.endsWith('.md')) continue
      out.push({
        label: `${kind}/${file.replace(/\.md$/, '')}`,
        description: PROMPT_ABOUT[kind] ?? '',
        uri: vscode.Uri.joinPath(root, kind, file),
      })
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

const exists = async (uri: vscode.Uri) => {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch {
    return false
  }
}

// The machine files a schematic can reach: whatever its nodes name, and the one
// named after the file itself. Only the ones actually on disk are offered.
async function machinesOf(document: vscode.TextDocument): Promise<vscode.Uri[]> {
  const named = new Set<string>()
  try {
    const graph = JSON.parse(document.getText()) as { nodes?: Record<string, { fsm?: unknown }> }
    for (const node of Object.values(graph.nodes ?? {})) if (typeof node.fsm === 'string') named.add(node.fsm)
  } catch {
    // an unreadable file still has a name; fall through to the sibling
  }
  named.add(fsmFileName(graphName(document.uri.path)))
  const candidates = [...named].map(path => vscode.Uri.joinPath(document.uri, '..', path))
  const found = await Promise.all(candidates.map(exists))
  return candidates.filter((_, i) => found[i])
}

// The hierarchy that contains `file`: its root, and every entry of it. The
// schematics sit in folders under the root, so look in this folder and then
// upwards.
async function findHierarchyOf(
  file: vscode.Uri,
): Promise<{ rootUri: vscode.Uri; entries: { instance: string; uri: vscode.Uri }[] } | undefined> {
  const read = async (uri: vscode.Uri) => {
    const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
    if (open) return open.getText()
    try {
      return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
    } catch {
      return undefined
    }
  }
  let dir = vscode.Uri.joinPath(file, '..')
  for (let up = 0; up < ROOT_SEARCH_DEPTH; up++) {
    let found: [string, vscode.FileType][] = []
    try {
      found = await vscode.workspace.fs.readDirectory(dir)
    } catch {
      return undefined
    }
    for (const [name, type] of found) {
      if (type !== vscode.FileType.File || graphFileKind(name) !== 'system') continue
      const rootUri = vscode.Uri.joinPath(dir, name)
      if (rootUri.toString() === file.toString()) return undefined // this is the root
      const text = await read(rootUri)
      if (text === undefined) continue
      const { files } = await collectHierarchyFiles(name, text, path => read(vscode.Uri.joinPath(dir, path)))
      const { root } = loadHierarchy(name, path => files[path])
      const entries = hierarchyEntries(root).map(e => ({ instance: e.instance, uri: vscode.Uri.joinPath(dir, e.path) }))
      if (entries.some(e => e.uri.toString() === file.toString())) return { rootUri, entries }
    }
    const parent = vscode.Uri.joinPath(dir, '..')
    if (parent.toString() === dir.toString()) return undefined
    dir = parent
  }
  return undefined
}

const findRootOf = async (file: vscode.Uri) => (await findHierarchyOf(file))?.rootUri

// The file one step out: the schematic of the component this one sits inside,
// or the root when there is nothing between them. Walking out a level at a time
// is how a reader came in, and jumping straight to the root loses their place.
async function findParentOf(file: vscode.Uri): Promise<vscode.Uri | undefined> {
  const found = await findHierarchyOf(file)
  if (!found) return undefined
  const here = found.entries.find(e => e.uri.toString() === file.toString())
  if (here === undefined) return undefined
  const above = here.instance.split('/').slice(0, -1).join('/')
  return found.entries.find(e => e.instance === above)?.uri ?? found.rootUri
}

// Returns the scope applied, or undefined when nothing was done.
async function foldCommand(action: FoldAction, args: unknown): Promise<FoldScope | undefined> {
  const state = RtlGraphEditorProvider.activeRenderState()
  if (!state) {
    void vscode.window.showWarningMessage('RTLGraph: open a schematic first.')
    return undefined
  }
  const given = (typeof args === 'object' && args !== null ? args : {}) as { instance?: unknown; scope?: unknown }
  let scope = FOLD_SCOPES.find(s => s === given.scope)
  const instance = scope === 'all' ? undefined : typeof given.instance === 'string' ? given.instance : state.selected
  if (instance === undefined) scope = 'all'
  else if (scope === undefined) {
    const verb = action === 'fold' ? 'Fold' : 'Unfold'
    const picked = await vscode.window.showQuickPick(
      [
        { label: `${verb} ${instance} only`, description: 'one level: components inside it go back to folded', scope: 'node' as const },
        { label: `${verb} ${instance} and everything inside`, description: 'every component nested in it as well', scope: 'descendants' as const },
      ],
      { placeHolder: `${verb} the selected component` },
    )
    scope = picked?.scope
  }
  if (scope === undefined) return undefined
  RtlGraphEditorProvider.postToActive({ type: 'fold', action, scope, ...(instance !== undefined ? { instance } : {}) })
  return scope
}

// A command may be called with nothing (ask), a string (the arguments to pass),
// a folder Uri (the Explorer's right-click), or both in an object.
function scriptArgs(args: unknown): { which?: string; folder?: vscode.Uri } {
  if (typeof args === 'string') return { which: args }
  if (args instanceof vscode.Uri) return { folder: args }
  if (typeof args === 'object' && args !== null) {
    const given = args as { which?: unknown; folder?: unknown }
    return {
      ...(typeof given.which === 'string' ? { which: given.which } : {}),
      ...(given.folder instanceof vscode.Uri
        ? { folder: given.folder }
        : typeof given.folder === 'string'
          ? { folder: vscode.Uri.file(given.folder) }
          : {}),
    }
  }
  return {}
}

// The two shipped scripts, run where the user can watch them: a terminal, in the
// project that holds them. Anything that prints a verdict belongs on screen —
// swallowing it into a notification would hide the simulator's own words, which
// are the point.
async function runShippedScript(script: string, args: string, where?: vscode.Uri): Promise<string | undefined> {
  const found = where ? await projectsUnder(where, script) : (await Promise.all(
    (vscode.workspace.workspaceFolders ?? []).map(f => projectsUnder(f.uri, script)))).flat()
  if (found.length === 0) {
    void vscode.window.showWarningMessage(
      `RTLGraph: no ${script} here yet — run "Copy Agent Spec to Workspace" first.`)
    return undefined
  }
  // A workspace can hold several projects (this repository's own demo/ folder
  // does), so ask rather than guessing which one was meant.
  const folder = found.length === 1 ? found[0] : (await vscode.window.showQuickPick(
    found.map(uri => ({ label: uri.path.split('/').pop() ?? uri.fsPath, description: uri.fsPath, uri })),
    { placeHolder: 'Which project?' },
  ))?.uri
  if (!folder) return undefined
  const path = vscode.Uri.joinPath(folder, script)
  const terminal = vscode.window.createTerminal({ name: `RTLGraph: ${script.split('/').pop()}`, cwd: folder })
  terminal.show()
  terminal.sendText(`"${path.fsPath}"${args ? ` ${args}` : ''}`)
  return path.fsPath
}

/** Folders at or one level under `root` that carry the given shipped script. */
async function projectsUnder(root: vscode.Uri, script: string): Promise<vscode.Uri[]> {
  const has = async (folder: vscode.Uri) => {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder, script))
      return true
    } catch {
      return false
    }
  }
  if (await has(root)) return [root]
  let children: [string, vscode.FileType][] = []
  try {
    children = await vscode.workspace.fs.readDirectory(root)
  } catch {
    return []
  }
  const out: vscode.Uri[] = []
  for (const [name, type] of children) {
    if (type !== vscode.FileType.Directory || name.startsWith('.')) continue
    const child = vscode.Uri.joinPath(root, name)
    if (await has(child)) out.push(child)
  }
  return out
}

/** Which language's prompts to write: the one asked for, or both when not. */
function promptLanguages(): ('korean' | 'english')[] | undefined {
  const said = vscode.workspace.getConfiguration('rtlgraph').get<string>('language')
  if (said === 'korean') return ['korean']
  if (said === 'english') return ['english']
  return undefined
}

// Only this package imports `vscode`; everything else lives in @rtlgraph/*.
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    RtlGraphEditorProvider.register(context),
    WaveViewProvider.register(context),

    vscode.commands.registerCommand('rtlgraph.copyAgentSpec', async (clicked?: unknown) => {
      const target = await resolveTargetFolder(clicked)
      if (!target) {
        void vscode.window.showWarningMessage('RTLGraph: open or select a folder first.')
        return undefined
      }
      try {
        const { written, kept, cleared } = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'RTLGraph: writing agent files…' },
          () => copyAgentSpec(context.extensionUri, target, promptLanguages()),
        )
        void vscode.window.showInformationMessage(
          `RTLGraph: wrote ${AGENT_DIR}/ and ${PROMPT_DIR}/{spec,rtl,refactor,rtlgraph,assignment}/{korean,english}.md in ${target.fsPath}. ` +
            `Paste ${PROMPT_DIR}/rtlgraph/korean.md (or english.md) into your agent to build a schematic of this RTL.` +
            (cleared.length > 0 ? ` Cleared from the older layout: ${cleared.join(', ')}.` : '') +
            // A primitive this project adapted to its own code is the project's, not ours.
            (kept.length > 0 ? ` Left as they were: ${kept.join(', ')} — this project had adapted them.` : ''),
        )
        return written
      } catch (err) {
        void vscode.window.showErrorMessage(`RTLGraph: could not write the agent files — ${(err as Error).message}`)
        return undefined
      }
    }),

    // Run the benches: no argument runs both folders, "given" only the one the
    // work is marked with.
    vscode.commands.registerCommand('rtlgraph.runTestbenches', async (args?: unknown) => {
      const { which, folder } = scriptArgs(args)
      const picked = which ?? (await vscode.window.showQuickPick(
        [
          { label: 'both', description: 'tb/given/ and tb/mine/', value: '' },
          { label: 'both, and read the waveform', description: 'also dumps it and measures it into waveform/', value: '--wave' },
          { label: 'given', description: 'only the bench the work is marked with', value: 'given' },
          { label: 'mine', description: 'only the benches written for this project', value: 'mine' },
        ],
        { placeHolder: 'Which testbenches?' },
      ))?.value
      if (picked === undefined) return undefined
      return runShippedScript(RUN_TB, picked, folder)
    }),

    // Collect what is handed in, check it still elaborates, zip it.
    vscode.commands.registerCommand('rtlgraph.makeSubmission', async (args?: unknown) => {
      const { which, folder } = scriptArgs(args)
      const picked = which !== undefined ? { value: which } : await vscode.window.showQuickPick(
        [
          { label: 'list only', description: 'print what would go in, write nothing', value: '--list' },
          { label: 'the RTL', description: 'what the handout asks for', value: '' },
          { label: 'the RTL and the benches', description: 'adds tb/mine/', value: '--with-tb' },
          { label: 'everything', description: 'benches, .base/, RTLGraph JSON, the handout', value: '--all' },
        ],
        { placeHolder: 'What goes in the zip?' },
      )
      if (!picked) return undefined
      return runShippedScript(MAKE_SUBMISSION, picked.value, folder)
    }),

    // Optional argument: the formats to write, e.g. ['svg', 'pdf']; without it, ask.
    vscode.commands.registerCommand('rtlgraph.export', async (formats?: unknown) => {
      const source = RtlGraphEditorProvider.activeExportSource()
      if (!source) {
        void vscode.window.showWarningMessage('RTLGraph: open a *.rtlgraph.json schematic first.')
        return undefined
      }
      let chosen: ExportFormat[] | undefined = Array.isArray(formats)
        ? EXPORT_FORMATS.filter(format => formats.includes(format))
        : undefined
      if (!chosen || chosen.length === 0) {
        const picked = await vscode.window.showQuickPick(
          [
            { label: 'All', description: 'SVG, PNG, PDF and the tables as XLSX', formats: [...EXPORT_FORMATS] },
            { label: 'SVG', description: 'vector — edit in Inkscape or Illustrator, embed in web pages', formats: ['svg' as const] },
            { label: 'PNG', description: 'image at 2× — slides, chat, documents', formats: ['png' as const] },
            { label: 'PDF', description: 'vector — papers and reports', formats: ['pdf' as const] },
            { label: 'XLSX', description: 'the tables behind it — control signals, truth tables, a machine', formats: ['xlsx' as const] },
          ],
          { placeHolder: `Export the current view (${viewName(source.filter)})` },
        )
        chosen = picked?.formats
      }
      if (!chosen) return undefined
      const formatsToWrite = chosen
      try {
        const { files, warnings } = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'RTLGraph: exporting…' },
          () => exportSchematic(source, formatsToWrite),
        )
        for (const warning of warnings) void vscode.window.showWarningMessage(`RTLGraph: ${warning}`)
        const folder = vscode.workspace.asRelativePath(vscode.Uri.joinPath(files[0], '..'))
        void vscode.window
          .showInformationMessage(`RTLGraph: exported ${files.map(f => f.path.split('/').pop()).join(', ')} to ${folder}`, 'Reveal in File Explorer')
          .then(choice => {
            if (choice) void vscode.commands.executeCommand('revealFileInOS', files[0])
          })
        return files.map(f => f.fsPath)
      } catch (err) {
        void vscode.window.showErrorMessage(`RTLGraph: export failed — ${(err as Error).message}`)
        return undefined
      }
    }),

    // Optional argument { instance?, scope? }; without it, act on the selected box
    // (asking whether to include what is inside) or, with nothing selected, on all.
    vscode.commands.registerCommand('rtlgraph.fold', (args?: unknown) => foldCommand('fold', args)),
    vscode.commands.registerCommand('rtlgraph.unfold', (args?: unknown) => foldCommand('unfold', args)),

    // Optional argument: the instance path; without it, the selected box.
    vscode.commands.registerCommand('rtlgraph.openComponent', async (instance?: unknown) => {
      const target = typeof instance === 'string' ? instance : RtlGraphEditorProvider.activeRenderState()?.selected
      if (target === undefined) {
        void vscode.window.showWarningMessage('RTLGraph: select a component box first.')
        return undefined
      }
      const uri = RtlGraphEditorProvider.activeComponentUri(target)
      if (!uri) {
        void vscode.window.showWarningMessage(`RTLGraph: ${target} has no readable schematic.`)
        return undefined
      }
      await vscode.commands.executeCommand('vscode.open', uri)
      return uri.fsPath
    }),

    // Walks back out of a component schematic to the root that contains it.
    // One step out of a component, with the root as the other way. The reader
    // came in a level at a time; going back the same way keeps their place.
    vscode.commands.registerCommand('rtlgraph.openPrevious', async (args?: unknown) => {
      const document = RtlGraphEditorProvider.activeDocument()
      if (!document) {
        void vscode.window.showWarningMessage('RTLGraph: open a schematic first.')
        return undefined
      }
      const given = (typeof args === 'object' && args !== null ? args : { step: args }) as { step?: unknown }
      const asked = given.step === 'up' || given.step === 'root' ? given.step : undefined
      const [up, rootUri] = await Promise.all([findParentOf(document.uri), findRootOf(document.uri)])
      if (!up && !rootUri) {
        void vscode.window.showWarningMessage('RTLGraph: nothing above this schematic.')
        return undefined
      }
      let step = asked
      if (step === undefined) {
        // Only one place to go when the component sits directly under the root.
        if (!up || !rootUri || up.toString() === rootUri.toString()) step = 'up'
        else {
          const picked = await vscode.window.showQuickPick(
            [
              { label: `Up to ${graphName(up.path)}`, description: 'the component this one sits inside', step: 'up' as const },
              { label: `Out to ${graphName(rootUri.path)}`, description: 'the root of the hierarchy', step: 'root' as const },
            ],
            { placeHolder: 'Leave this schematic' },
          )
          step = picked?.step
        }
      }
      if (step === undefined) return undefined
      const target = step === 'root' ? rootUri ?? up : up ?? rootUri
      if (!target) return undefined
      await vscode.commands.executeCommand('vscode.open', target)
      return target.fsPath
    }),

    vscode.commands.registerCommand('rtlgraph.openRoot', async () => {
      const document = RtlGraphEditorProvider.activeDocument()
      if (!document) {
        void vscode.window.showWarningMessage('RTLGraph: open a schematic first.')
        return undefined
      }
      const rootUri = await findRootOf(document.uri)
      if (!rootUri) {
        void vscode.window.showWarningMessage('RTLGraph: no root file above this schematic.')
        return undefined
      }
      await vscode.commands.executeCommand('vscode.open', rootUri)
      return rootUri.fsPath
    }),

    // A component and its machine are two files side by side; these are the two
    // ways between them. The machine a node names wins over the one named after
    // the file, because a component may hold more than one.
    vscode.commands.registerCommand('rtlgraph.openFsm', async () => {
      const document = RtlGraphEditorProvider.activeDocument()
      if (!document) {
        void vscode.window.showWarningMessage('RTLGraph: open a schematic first.')
        return undefined
      }
      const machines = await machinesOf(document)
      if (machines.length === 0) {
        void vscode.window.showWarningMessage('RTLGraph: this component has no state machine file.')
        return undefined
      }
      const picked = machines.length === 1
        ? machines[0]
        : (await vscode.window.showQuickPick(
            machines.map(uri => ({ label: uri.path.split('/').pop()!, uri })),
            { placeHolder: 'RTLGraph state machine' },
          ))?.uri
      if (!picked) return undefined
      await vscode.commands.executeCommand('vscode.open', picked)
      return picked.fsPath
    }),

    vscode.commands.registerCommand('rtlgraph.openSchematic', async () => {
      const document = RtlGraphEditorProvider.activeDocument()
      if (!document || graphFileKind(document.uri.path) !== 'fsm') {
        void vscode.window.showWarningMessage('RTLGraph: open a state machine first.')
        return undefined
      }
      const uri = vscode.Uri.joinPath(document.uri, '..', schematicFileName(graphName(document.uri.path)))
      if (!(await exists(uri))) {
        void vscode.window.showWarningMessage(`RTLGraph: ${uri.path.split('/').pop()} is not there.`)
        return undefined
      }
      await vscode.commands.executeCommand('vscode.open', uri)
      return uri.fsPath
    }),

    // The prompts, by the branch of work they are for. The path lands on the
    // clipboard because that is how they are used: pasted into an agent as a file
    // to read, not opened here.
    // Optional argument { kind?, folder? }: the branch to take without asking, and
    // where to look when the prompts are not in an open folder.
    // The Explorer's icon belongs to the reader's icon theme; this offers to tell
    // the common one about RTLGraph's files. See explorerIcons.ts.
    vscode.commands.registerCommand('rtlgraph.markFiles', async () => {
      const theme = vscode.workspace.getConfiguration('workbench').get<string>('iconTheme')
      if (theme !== 'material-icon-theme') {
        void vscode.window.showInformationMessage(
          `RTLGraph: the Explorer's icons come from your file icon theme (${theme ?? 'none'}), and RTLGraph's own mark is already on its tabs. ` +
          'This command can only teach Material Icon Theme about *.rtlgraph.json.')
        return undefined
      }
      const settings = vscode.workspace.getConfiguration('material-icon-theme')
      const wanted = withRtlgraphFiles(settings.get<Record<string, string>>('files.associations'))
      if (!wanted) {
        void vscode.window.showInformationMessage('RTLGraph: Material Icon Theme already marks RTLGraph files.')
        return undefined
      }
      const yes = 'Add it'
      const answer = await vscode.window.showInformationMessage(
        `RTLGraph: mark *.rtlgraph.json in the Explorer with Material's "${MATERIAL_ICON}" icon? This changes your settings.`,
        yes, 'Cancel')
      if (answer !== yes) return undefined
      await settings.update('files.associations', wanted, vscode.ConfigurationTarget.Global)
      return wanted
    }),

    vscode.commands.registerCommand('rtlgraph.copyPromptPath', async (args?: unknown) => {
      const given = (typeof args === 'object' && args !== null ? args : { kind: args }) as { kind?: unknown; folder?: unknown }
      const kind = typeof given.kind === 'string' ? given.kind : undefined
      const where = given.folder instanceof vscode.Uri
        ? [given.folder]
        : typeof given.folder === 'string'
          ? [vscode.Uri.file(given.folder)]
          : (vscode.workspace.workspaceFolders ?? []).map(f => f.uri)
      const found = (await Promise.all(where.map(promptsIn))).flat()
      if (found.length === 0) {
        void vscode.window.showWarningMessage(`RTLGraph: no ${PROMPT_DIR} folder here yet — run "Copy Agent Spec to Workspace" first.`)
        return undefined
      }
      const wanted = kind !== undefined ? found.find(p => p.label.startsWith(`${kind}/`)) : undefined
      const picked = wanted ?? (await vscode.window.showQuickPick(found, { placeHolder: 'Which prompt? The path goes to the clipboard' }))
      if (!picked) return undefined
      await vscode.env.clipboard.writeText(picked.uri.fsPath)
      void vscode.window.showInformationMessage(`RTLGraph: copied ${picked.label} — paste the path into your agent.`)
      return picked.uri.fsPath
    }),

    // The code behind what is drawn. Optional argument: the node id (the webview's
    // right-click menu passes what was clicked); without it, the selected box.
    vscode.commands.registerCommand('rtlgraph.openCode', async (id?: unknown) => {
      const target = typeof id === 'string' ? id : RtlGraphEditorProvider.activeRenderState()?.selected
      if (target === undefined) {
        void vscode.window.showWarningMessage('RTLGraph: select a box first.')
        return undefined
      }
      const at = RtlGraphEditorProvider.activeSource({ node: target })
      if (!at) {
        void vscode.window.showWarningMessage(`RTLGraph: ${target} does not say which line of the code it came from.`)
        return undefined
      }
      await openCodeBeside(at.uri, at.line, RtlGraphEditorProvider.activeDocument())
      return `${at.uri.fsPath}:${at.line}`
    }),

    // The document the design was asked for, at the requirement this box is here
    // for. Optional argument: the node id; without it, the selected box.
    vscode.commands.registerCommand('rtlgraph.openSpec', async (id?: unknown) => {
      const target = typeof id === 'string' ? id : RtlGraphEditorProvider.activeRenderState()?.selected
      if (target === undefined) {
        void vscode.window.showWarningMessage('RTLGraph: select a box first.')
        return undefined
      }
      const at = RtlGraphEditorProvider.activeSpec({ node: target })
      if (!at) {
        void vscode.window.showWarningMessage(`RTLGraph: ${target} names no requirement.`)
        return undefined
      }
      // What comes back says what the reader ended up looking at: the page the
      // sentence is really on, which is not always the page the JSON guessed.
      const shown = await openRequirement(context, at, RtlGraphEditorProvider.activeDocument())
      if (shown?.error) void vscode.window.showWarningMessage(`RTLGraph: ${shown.error}`)
      return { path: at.uri.fsPath, page: shown?.page ?? at.page, pages: shown?.pages, found: shown?.found, error: shown?.error }
    }),

    vscode.commands.registerCommand('rtlgraph.fitView', () => RtlGraphEditorProvider.postToActive({ type: 'fitView' })),

    vscode.commands.registerCommand('rtlgraph.setPreset', async (preset?: string) => {
      let key = preset !== undefined && Object.hasOwn(FILTER_PRESETS, preset) ? (preset as FilterPreset) : undefined
      if (key === undefined) {
        const picked = await vscode.window.showQuickPick(
          Object.entries(PRESET_LABELS).map(([value, label]) => ({ label, value: value as FilterPreset })),
          { placeHolder: 'RTLGraph view preset' },
        )
        key = picked?.value
      }
      if (key !== undefined) RtlGraphEditorProvider.postToActive({ type: 'setFilter', filter: FILTER_PRESETS[key] })
    }),

    // Internal: what the active schematic last drew (used by the end-to-end test).
    vscode.commands.registerCommand('rtlgraph._renderState', () => RtlGraphEditorProvider.activeRenderState()),
  )
}

export function deactivate(): void {}
