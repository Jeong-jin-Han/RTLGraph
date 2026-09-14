import * as vscode from 'vscode'
import { FILTER_PRESETS, type FilterPreset } from '@rtlgraph/ir'
import { RtlGraphEditorProvider } from './editorProvider.ts'
import { PRESET_LABELS } from './webview/state.ts'

// Only this package imports `vscode`; everything else lives in @rtlgraph/*.
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    RtlGraphEditorProvider.register(context),
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
