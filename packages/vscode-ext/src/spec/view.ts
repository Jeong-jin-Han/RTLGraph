// The specification reader.
//
// A spec is read far more often than it is edited, and the thing a reader
// wants from it — "show me this scenario running" — cannot be reached from
// VS Code's own markdown preview: a code lens only exists in a text editor.
// So this is the preview, with the walks in it.
//
// One panel, reused. The host reads the document and the scenarios in it and
// hands both over; every decision about what to show is in the webview, and
// every decision about where to go is here.

import * as vscode from 'vscode'
import { langOf } from '@rtlgraph/wave'
import { webviewHtml } from '../webview/html.ts'
import { prefixesIn, walksIn, type Walk } from './steps.ts'
import { onWalkMoved, sourceOf, WalkSession, words } from './walk.ts'

/** The format file's `rx:` → `uart_receiver.v`, read from beside the document. */
async function prefixesFor(doc: vscode.TextDocument): Promise<Map<string, string>> {
  const here = vscode.Uri.joinPath(doc.uri, '..')
  for (const name of ['00-format.md', '0-format.md', 'format.md']) {
    try {
      const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(here, name)))
      const found = prefixesIn(text)
      if (found.size > 0) return found
    } catch {
      // not that one
    }
  }
  return prefixesIn(doc.getText())
}

export class SpecPreview {
  private static panel: vscode.WebviewPanel | undefined
  private static showing: vscode.Uri | undefined
  /** Test hook: what the panel was last sent. */
  static sent: unknown

  static async open(context: vscode.ExtensionContext, doc: vscode.TextDocument): Promise<void> {
    const name = doc.uri.path.split('/').pop() ?? 'spec'
    if (!SpecPreview.panel) {
      const panel = vscode.window.createWebviewPanel('rtlgraph.spec', name, vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      })
      panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources/icon.png')
      panel.webview.html = webviewHtml({
        scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist/spec.js')).toString(),
        cspSource: panel.webview.cspSource,
        nonce: String(Math.random()).slice(2),
        mathUri: panel.webview
          .asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist/katex/katex.min.css'))
          .toString(),
      })
      SpecPreview.panel = panel
      SpecPreview.listen(panel)
    }
    SpecPreview.panel.title = name
    SpecPreview.showing = doc.uri
    SpecPreview.panel.reveal(SpecPreview.panel.viewColumn ?? vscode.ViewColumn.One, true)
    await SpecPreview.send(doc)
  }

  /** Whether the panel is on the document that has just changed. */
  private static shows(uri: vscode.Uri): boolean {
    return SpecPreview.showing?.toString() === uri.toString()
  }

  private static async send(doc: vscode.TextDocument): Promise<void> {
    const panel = SpecPreview.panel
    if (!panel) return
    const prefixes = await prefixesFor(doc)
    const walks: Walk[] = walksIn(doc.getText(), prefixes)
    const setting = vscode.workspace.getConfiguration('rtlgraph').get<string>('language')
    const message = {
      type: 'spec',
      name: doc.uri.path.split('/').pop(),
      text: doc.getText(),
      walks,
      prefixes: Object.fromEntries(prefixes),
      at: WalkSession.where(),
      lang: langOf(setting === 'korean' ? 'ko' : setting === 'english' ? 'en' : vscode.env.language),
    }
    SpecPreview.sent = message
    // Never awaited: the promise settles when the webview answers, and a
    // webview that does not would hang whoever opened it.
    void panel.webview.postMessage(message)
  }

  /** The document this panel is on, reopened rather than kept hold of. */
  private static async document(): Promise<vscode.TextDocument | undefined> {
    return SpecPreview.showing ? vscode.workspace.openTextDocument(SpecPreview.showing) : undefined
  }

  private static listen(panel: vscode.WebviewPanel): void {
    const parts: vscode.Disposable[] = []

    // The document is edited in another tab, or written by an agent in another
    // window: either way the reader should not have to reopen this.
    parts.push(vscode.workspace.onDidChangeTextDocument(event => {
      if (SpecPreview.shows(event.document.uri)) void SpecPreview.send(event.document)
    }))
    parts.push(vscode.workspace.onDidSaveTextDocument(saved => {
      if (SpecPreview.shows(saved.uri)) void SpecPreview.send(saved)
    }))
    // As the walk moves, the step list marks where it is.
    parts.push(onWalkMoved(at => void panel.webview.postMessage({ type: 'at', at })))

    parts.push(panel.webview.onDidReceiveMessage(async (message: {
      type?: string; id?: string; index?: number; by?: number; file?: string; line?: number; href?: string
    }) => {
      const doc = await SpecPreview.document()
      if (!doc) return
      switch (message.type) {
        case 'walk':
          if (typeof message.id === 'string') {
            // Already walking this scenario? Then the click is a step, not a
            // restart: restarting would rebuild both panes for nothing.
            const at = WalkSession.where()
            if (at?.id === message.id) WalkSession.goto(message.index ?? 0)
            else await WalkSession.start(doc, message.id, message.index ?? 0)
          }
          return
        case 'step':
          WalkSession.step(message.by ?? 1)
          return
        case 'stop':
          WalkSession.stopCurrent()
          return
        case 'open': {
          if (typeof message.file !== 'string') return
          const uri = await sourceOf(doc.uri, message.file)
          if (!uri) {
            void vscode.window.showWarningMessage(`RTLGraph: could not find ${message.file}.`)
            return
          }
          const at = Math.max((message.line ?? 1) - 1, 0)
          const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri),
            { viewColumn: vscode.ViewColumn.Two, preview: true, preserveFocus: true })
          editor.revealRange(new vscode.Range(at, 0, at, 0), vscode.TextEditorRevealType.InCenter)
          editor.selection = new vscode.Selection(at, 0, at, 0)
          return
        }
        case 'source':
          await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false })
          return
        case 'link':
          if (typeof message.href === 'string') {
            const target = /^[a-z]+:\/\//.test(message.href)
              ? vscode.Uri.parse(message.href)
              : vscode.Uri.joinPath(doc.uri, '..', message.href)
            await vscode.commands.executeCommand('vscode.open', target)
          }
          return
        case 'ready':
          await SpecPreview.send(doc)
      }
    }))

    panel.onDidDispose(() => {
      for (const part of parts) part.dispose()
      SpecPreview.panel = undefined
      SpecPreview.showing = undefined
    })
  }

  /** The command: this document if it is one, else ask which. */
  static async fromCommand(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
    const doc = uri
      ? await vscode.workspace.openTextDocument(uri)
      : vscode.window.activeTextEditor?.document
    if (doc?.languageId === 'markdown') return SpecPreview.open(context, doc)
    // From a preview, or from nowhere: the same search the walk uses.
    const { askForWalk } = await import('./walk.ts')
    const chosen = await askForWalk(doc)
    if (chosen) return SpecPreview.open(context, await vscode.workspace.openTextDocument(chosen.spec))
    void vscode.window.showWarningMessage(`RTLGraph: ${words().none}`)
  }
}
