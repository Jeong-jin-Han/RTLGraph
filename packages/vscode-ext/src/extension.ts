import * as vscode from 'vscode'
import { FILTER_PRESETS, type FilterPreset } from '@rtlgraph/ir'
import { RtlGraphEditorProvider } from './editorProvider.ts'
import { PRESET_LABELS } from './webview/state.ts'
import { copyAgentSpec } from './agent/copyAgentSpec.ts'
import { exportSchematic } from './export.ts'
import { EXPORT_FORMATS, viewName, type ExportFormat } from './exportFiles.ts'

// The folder a command acts on: the one right-clicked in the Explorer, else the
// only workspace folder, else the one the user picks.
async function resolveTargetFolder(clicked: unknown): Promise<vscode.Uri | undefined> {
  if (clicked instanceof vscode.Uri) return clicked
  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length <= 1) return folders[0]?.uri
  const picked = await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Folder to copy the RTLGraph agent files into' })
  return picked?.uri
}

// Only this package imports `vscode`; everything else lives in @rtlgraph/*.
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    RtlGraphEditorProvider.register(context),

    vscode.commands.registerCommand('rtlgraph.copyAgentSpec', async (clicked?: unknown) => {
      const target = await resolveTargetFolder(clicked)
      if (!target) {
        void vscode.window.showWarningMessage('RTLGraph: open or select a folder first.')
        return undefined
      }
      try {
        const written = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'RTLGraph: writing agent files…' },
          () => copyAgentSpec(context.extensionUri, target),
        )
        void vscode.window.showInformationMessage(
          `RTLGraph: wrote .agent/ and .prompt/{rtlgraph,rtl}/{korean,english}.md in ${target.fsPath}. ` +
            'Paste .prompt/rtlgraph/korean.md (or english.md) into your agent to build a schematic of this RTL.',
        )
        return written
      } catch (err) {
        void vscode.window.showErrorMessage(`RTLGraph: could not write the agent files — ${(err as Error).message}`)
        return undefined
      }
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
            { label: 'All', description: 'SVG, PNG and PDF', formats: [...EXPORT_FORMATS] },
            { label: 'SVG', description: 'vector — edit in Inkscape or Illustrator, embed in web pages', formats: ['svg' as const] },
            { label: 'PNG', description: 'image at 2× — slides, chat, documents', formats: ['png' as const] },
            { label: 'PDF', description: 'vector — papers and reports', formats: ['pdf' as const] },
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
