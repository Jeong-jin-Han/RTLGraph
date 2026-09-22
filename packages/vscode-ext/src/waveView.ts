// The waveform viewer: a `*.waveform.json` opens as a drawing rather than as
// JSON, the way a `*.rtlgraph.json` does. Both are the project's own files and
// live with the project — never inside `.agent/`, which holds what the Copy
// Agent Spec command wrote and nothing else.
//
// The measurements live in the JSON; the shapes live in the dump beside it. The
// host reads both and hands the webview one payload, because a webview cannot
// read files and a dump is too big to want to parse twice.

import * as vscode from 'vscode'
import { buildView, parseVcd, readFacts, type WaveView } from '@rtlgraph/wave'
import { webviewHtml } from './webview/html.ts'

interface StoredReport {
  facts?: { tick?: number }
  source?: { vcd?: string }
}

export class WaveViewProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'rtlgraph.waveform'

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      WaveViewProvider.viewType,
      new WaveViewProvider(context),
      { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: false },
    )
  }

  private readonly context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext) {
    this.context = context
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    panel.webview.options = { enableScripts: true, localResourceRoots: [this.context.extensionUri] }
    panel.iconPath = {
      light: vscode.Uri.joinPath(this.context.extensionUri, 'resources/icon.png'),
      dark: vscode.Uri.joinPath(this.context.extensionUri, 'resources/icon.png'),
    }
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist/wave.js'))
    panel.webview.html = webviewHtml({
      scriptUri: script.toString(),
      cspSource: panel.webview.cspSource,
      nonce: String(Math.random()).slice(2),
    })

    const send = async () => {
      const view = await this.read(document)
      void panel.webview.postMessage(view
        ? { type: 'wave', view }
        : { type: 'waveError', message: `No dump for ${document.uri.path.split('/').pop()} — run \`.agent/rtlgraph/run-tb.sh --wave\` again.` })
    }
    const watcher = vscode.workspace.onDidSaveTextDocument(saved => {
      if (saved.uri.toString() === document.uri.toString()) void send()
    })
    panel.onDidDispose(() => watcher.dispose())
    panel.webview.onDidReceiveMessage((message: { type?: string }) => {
      if (message?.type === 'ready') void send()
    })
    await send()
  }

  /** The report plus the dump it names, turned into what the view draws. */
  private async read(document: vscode.TextDocument): Promise<WaveView | undefined> {
    let report: StoredReport & { bench?: { time?: number; text: string }[] }
    try {
      report = JSON.parse(document.getText()) as StoredReport & { bench?: { time?: number; text: string }[] }
    } catch {
      return undefined
    }
    const name = report.source?.vcd ?? 'wave.vcd'
    const dump = vscode.Uri.joinPath(document.uri, '..', name)
    let text: string
    try {
      text = new TextDecoder().decode(await vscode.workspace.fs.readFile(dump))
    } catch {
      return undefined
    }
    const wave = parseVcd(text)
    // The facts are recomputed rather than trusted: the JSON may have been
    // written by an older build, and the dump is the thing that is true.
    return buildView(wave, readFacts(wave, report.bench ?? []))
  }
}
