// The waveform viewer: a `*.waveform.json` opens as a drawing rather than as
// JSON, the way a `*.rtlgraph.json` does. Both are the project's own files and
// live with the project — never inside `.agent/`, which holds what the Copy
// Agent Spec command wrote and nothing else.
//
// The measurements live in the JSON; the shapes live in the dump beside it. The
// host reads both and hands the webview one payload, because a webview cannot
// read files and a dump is too big to want to parse twice.

import * as vscode from 'vscode'
import { buildView, langOf, parseVcd, readFacts, wordsIn, type Lang, type WaveView } from '@rtlgraph/wave'
import { webviewHtml } from './webview/html.ts'

interface StoredWindow {
  label: string
  source?: { file: string; line: number; text: string }
}

interface Place { file: string; line: number; text: string }

interface StoredReport {
  facts?: { windows?: StoredWindow[] }
  bench?: { time?: number; text: string }[]
  /** Signal name → the line of RTL that drives it, worked out when written. */
  signals?: Record<string, Place>
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

    const lang = langOf(vscode.workspace.getConfiguration('rtlgraph').get<string>('language') === 'korean'
      ? 'ko'
      : vscode.workspace.getConfiguration('rtlgraph').get<string>('language') === 'english'
        ? 'en'
        : vscode.env.language)
    const send = async () => {
      const view = await this.read(document, lang)
      void panel.webview.postMessage(view
        ? { type: 'wave', view, words: wordsIn(lang) }
        : { type: 'waveError', message: wordsIn(lang).noDump(document.uri.path.split('/').pop() ?? '') })
    }
    const watcher = vscode.workspace.onDidSaveTextDocument(saved => {
      if (saved.uri.toString() === document.uri.toString()) void send()
    })
    panel.onDidDispose(() => watcher.dispose())
    panel.webview.onDidReceiveMessage((message: { type?: string; file?: string; line?: number }) => {
      if (message?.type === 'ready') void send()
      // A check knows the line that printed it; opening it beside the drawing is
      // the whole point of recording it.
      if (message?.type === 'openCode' && typeof message.file === 'string') {
        const target = vscode.Uri.joinPath(document.uri, '..', message.file)
        const at = Math.max((message.line ?? 1) - 1, 0)
        void vscode.window.showTextDocument(target, {
          viewColumn: vscode.ViewColumn.Beside,
          preview: false,
          selection: new vscode.Range(at, 0, at, 0),
        })
      }
    })
    await send()
  }

  /** The report plus the dump it names, turned into what the view draws. */
  private async read(document: vscode.TextDocument, lang: Lang = 'en'): Promise<WaveView | undefined> {
    let report: StoredReport
    try {
      report = JSON.parse(document.getText()) as StoredReport
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
    // written by an older build, and the dump is the thing that is true. The one
    // thing the dump cannot know is which line of the testbench printed a check —
    // that was worked out against the bench's source when the report was
    // written — so it is carried across rather than recomputed.
    const facts = readFacts(wave, report.bench ?? [], lang)
    for (const window of facts.windows) {
      const stored = report.facts?.windows?.find(w => w.label === window.label)
      if (stored?.source) Object.assign(window, { source: stored.source })
    }
    const view = buildView(wave, facts, 20, lang)
    for (const trace of view.traces) {
      const place = report.signals?.[trace.name]
      if (place) Object.assign(trace, { source: place })
    }
    return view
  }
}
