import * as vscode from 'vscode'
import { randomBytes } from 'node:crypto'
import type { HostToWebview, RenderState, WebviewToHost } from './protocol.ts'
import { normalizeFilter } from './webview/state.ts'
import { webviewHtml } from './webview/html.ts'

interface Panel {
  webview: vscode.Webview
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

  private readonly context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext) {
    this.context = context
  }

  resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
    const { webview } = webviewPanel
    const panel: Panel = { webview }
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist')
    webview.options = { enableScripts: true, localResourceRoots: [dist] }
    webview.html = webviewHtml({
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js')).toString(),
      cspSource: webview.cspSource,
      nonce: randomBytes(16).toString('base64'),
    })

    const filterKey = `rtlgraph.filter:${document.uri.toString()}`
    const sendDocument = () => {
      const message: HostToWebview = { type: 'load', text: document.getText(), filter: normalizeFilter(this.context.workspaceState.get(filterKey)) }
      void webview.postMessage(message)
    }

    const subscriptions = [
      webview.onDidReceiveMessage((message: WebviewToHost) => {
        if (message.type === 'ready') sendDocument()
        else if (message.type === 'rendered') panel.rendered = message.state
        else if (message.type === 'setFilter') {
          const filter = normalizeFilter(message.filter)
          if (filter) void this.context.workspaceState.update(filterKey, filter)
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
      if (RtlGraphEditorProvider.active === panel) RtlGraphEditorProvider.active = undefined
    })
  }
}
