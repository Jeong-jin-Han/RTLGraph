import * as vscode from 'vscode'
import { randomBytes } from 'node:crypto'
import { FILTER_PRESETS } from '@rtlgraph/ir'
import type { HostToWebview, RenderState, WebviewToHost } from './protocol.ts'
import type { ExportSource } from './export.ts'
import { normalizeFilter } from './webview/state.ts'
import { webviewHtml } from './webview/html.ts'

const RASTER_TIMEOUT_MS = 20_000

interface Panel {
  webview: vscode.Webview
  source: () => ExportSource
  rendered?: RenderState
}

// Read-only schematic view of a *.rtlgraph.json document. The webview does the
// parsing, layout and rendering; the host only forwards text and remembers the
// filter per file in workspaceState, so looking at a graph never modifies it.
export class RtlGraphEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'rtlgraph.editor'
  private static active: Panel | undefined

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(RtlGraphEditorProvider.viewType, new RtlGraphEditorProvider(context), {
      webviewOptions: { retainContextWhenHidden: true },
    })
  }

  static postToActive(message: HostToWebview): boolean {
    const panel = RtlGraphEditorProvider.active
    if (panel) void panel.webview.postMessage(message)
    return panel !== undefined
  }

  static activeRenderState(): RenderState | undefined {
    return RtlGraphEditorProvider.active?.rendered
  }

  static activeExportSource(): ExportSource | undefined {
    return RtlGraphEditorProvider.active?.source()
  }

  private readonly context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext) {
    this.context = context
  }

  resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
    const { webview } = webviewPanel
    const filterKey = `rtlgraph.filter:${document.uri.toString()}`
    const storedFilter = () => normalizeFilter(this.context.workspaceState.get(filterKey))

    const rasters = new Map<number, { resolve: (bytes: Uint8Array) => void; reject: (err: Error) => void }>()
    let nextRaster = 1
    const rasterize = (scale: number) =>
      new Promise<Uint8Array>((resolve, reject) => {
        const id = nextRaster++
        const timer = setTimeout(() => {
          rasters.delete(id)
          reject(new Error('the schematic view did not answer'))
        }, RASTER_TIMEOUT_MS)
        rasters.set(id, {
          resolve: bytes => (clearTimeout(timer), resolve(bytes)),
          reject: err => (clearTimeout(timer), reject(err)),
        })
        const message: HostToWebview = { type: 'rasterize', id, scale }
        void webview.postMessage(message)
      })

    const panel: Panel = {
      webview,
      source: () => ({ document, filter: panel.rendered?.filter ?? storedFilter() ?? FILTER_PRESETS.all, rasterize }),
    }

    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist')
    webview.options = { enableScripts: true, localResourceRoots: [dist] }
    webview.html = webviewHtml({
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js')).toString(),
      cspSource: webview.cspSource,
      nonce: randomBytes(16).toString('base64'),
    })

    const sendDocument = () => {
      const message: HostToWebview = { type: 'load', text: document.getText(), filter: storedFilter() }
      void webview.postMessage(message)
    }

    const subscriptions = [
      webview.onDidReceiveMessage((message: WebviewToHost) => {
        if (message.type === 'ready') sendDocument()
        else if (message.type === 'rendered') panel.rendered = message.state
        else if (message.type === 'setFilter') {
          const filter = normalizeFilter(message.filter)
          if (filter) void this.context.workspaceState.update(filterKey, filter)
        } else if (message.type === 'export') {
          RtlGraphEditorProvider.active = panel
          void vscode.commands.executeCommand('rtlgraph.export')
        } else if (message.type === 'raster') {
          const pending = rasters.get(message.id)
          rasters.delete(message.id)
          if (message.base64 !== undefined) pending?.resolve(Buffer.from(message.base64, 'base64'))
          else pending?.reject(new Error(message.error ?? 'PNG rendering failed'))
        }
      }),
      // An agent rewriting the JSON (or a manual edit) shows up immediately.
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.toString() === document.uri.toString() && event.contentChanges.length > 0) sendDocument()
      }),
      webviewPanel.onDidChangeViewState(event => {
        if (event.webviewPanel.active) RtlGraphEditorProvider.active = panel
      }),
    ]
    RtlGraphEditorProvider.active = panel

    webviewPanel.onDidDispose(() => {
      for (const s of subscriptions) s.dispose()
      for (const pending of rasters.values()) pending.reject(new Error('the schematic was closed'))
      if (RtlGraphEditorProvider.active === panel) RtlGraphEditorProvider.active = undefined
    })
  }
}
