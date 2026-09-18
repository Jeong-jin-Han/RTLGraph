import * as vscode from 'vscode'
import { columnRightOf } from './tabs.ts'
import { openBeside } from './openCode.ts'

// The panel that shows a requirement inside the document it was written in.
//
// `vscode.open` on a PDF gives "the file is not displayed in the text editor",
// so following a `spec` link used to end at a file name. This opens the document
// in a webview beside the drawing, with the quoted sentence found and painted —
// one panel, reused, so following one link after another does not fill the
// window with copies of the same handout.

const groupOf = (document: vscode.TextDocument | undefined): number | undefined => {
  if (!document) return vscode.window.tabGroups.activeTabGroup.viewColumn
  const holding = vscode.window.tabGroups.all
    .find(group => group.tabs.some(tab => (tab.input as { uri?: vscode.Uri }).uri?.toString() === document.uri.toString()))
  return (holding ?? vscode.window.tabGroups.activeTabGroup).viewColumn
}

let panel: vscode.WebviewPanel | undefined
let showing: string | undefined // the folder the open panel is allowed to read from

export interface SpecTarget {
  uri: vscode.Uri
  page?: number
  quote?: string
}

// What the panel reports back once it has the document open: how many pages it
// has, which page the sentence turned out to be on, and whether it was found at
// all. The command hands this on, so a caller (and the end-to-end test) learns
// what the reader is looking at rather than only what was asked for.
export interface SpecShown {
  pages: number
  page?: number
  found: boolean
  error?: string
}

let waiting: ((result: SpecShown | undefined) => void) | undefined

export async function showSpec(
  context: vscode.ExtensionContext,
  at: SpecTarget,
  schematic: vscode.TextDocument | undefined,
): Promise<SpecShown | undefined> {
  const folder = vscode.Uri.joinPath(at.uri, '..')
  const columns = vscode.window.tabGroups.all.map(group => group.viewColumn)
  const column = columnRightOf(columns, groupOf(schematic)) ?? vscode.ViewColumn.Beside

  // A webview may only read from the roots it was made with, and the document
  // can be anywhere, so a panel pointed at another folder is made again.
  if (panel && showing !== folder.toString()) {
    panel.dispose()
    panel = undefined
  }
  if (!panel) {
    panel = vscode.window.createWebviewPanel('rtlgraph.spec', 'Requirement', { viewColumn: column, preserveFocus: true }, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri, folder],
    })
    panel.onDidDispose(() => (panel = undefined))
    panel.webview.onDidReceiveMessage((message: { type: string } & SpecShown) => {
      if (message.type !== 'shown') return
      waiting?.({ pages: message.pages, page: message.page, found: message.found, error: message.error })
      waiting = undefined
    })
    panel.webview.html = pageOf(panel.webview, context)
    showing = folder.toString()
  } else panel.reveal(column, true)

  const name = at.uri.path.split('/').pop() ?? 'document'
  panel.title = name
  // A document that will not open must not leave the caller waiting for ever.
  const report = new Promise<SpecShown | undefined>(resolve => {
    waiting = resolve
    setTimeout(() => {
      if (waiting === resolve) waiting = undefined
      resolve(undefined)
    }, 20_000)
  })
  await panel.webview.postMessage({
    type: 'show',
    src: panel.webview.asWebviewUri(at.uri).toString(),
    name,
    quote: at.quote,
    page: at.page,
    fonts: `${panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist/pdfjs/standard_fonts')).toString()}/`,
    cmaps: `${panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist/pdfjs/cmaps')).toString()}/`,
  })
  return report
}

function pageOf(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist/pdfview.js'))
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} blob: data:`,
    `style-src 'unsafe-inline'`,
    `script-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `connect-src ${webview.cspSource}`,
  ].join('; ')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  :root { color-scheme: light dark }
  body { margin: 0; font: 12px var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); display: flex; flex-direction: column; height: 100vh }
  #bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border);
         background: var(--vscode-editorWidget-background); flex: none }
  #title { font-weight: 600 }
  #status { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .85 }
  #status.miss { color: var(--vscode-editorWarning-foreground) }
  #status.loose { color: var(--vscode-editorWarning-foreground) }
  button { background: transparent; color: inherit; border: 1px solid var(--vscode-panel-border);
           border-radius: 3px; padding: 1px 7px; cursor: pointer; font: inherit }
  button:hover { background: var(--vscode-toolbar-hoverBackground) }
  #pages { flex: 1; overflow: auto; padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 12px }
  .sheet { position: relative; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.35) }
  .sheet canvas { display: block }
  .marks { position: absolute; inset: 0; pointer-events: none }
  .mark { position: absolute; background: rgba(255, 186, 0, .38); outline: 1px solid rgba(214, 138, 0, .9);
          border-radius: 2px; mix-blend-mode: multiply }
  .mark.loose { background: rgba(255, 120, 0, .22); outline-style: dashed }
  .flash .mark { animation: pulse 1.1s ease-out 2 }
  @keyframes pulse { 0%, 100% { background: rgba(255, 186, 0, .38) } 50% { background: rgba(255, 186, 0, .8) } }
</style>
</head>
<body>
  <div id="bar" hidden>
    <span id="title"></span>
    <span id="status"></span>
    <button id="zoom-out" title="Smaller">−</button>
    <span id="zoom">100%</span>
    <button id="zoom-in" title="Larger">+</button>
  </div>
  <div id="pages"></div>
  <script type="module" src="${script}"></script>
</body>
</html>`
}

// Following a `spec` link. A PDF goes to the viewer above — VS Code would only
// say it is binary — and anything else (a Markdown spec, a text file) opens the
// way the code does, since an editor can already show it.
export async function openRequirement(
  context: vscode.ExtensionContext,
  at: SpecTarget,
  schematic: vscode.TextDocument | undefined,
): Promise<SpecShown | undefined> {
  const name = at.uri.path.split('/').pop() ?? 'the document'
  if (at.uri.path.toLowerCase().endsWith('.pdf')) return showSpec(context, at, schematic)
  await openBeside(at.uri, schematic)
  void vscode.window.showInformationMessage(
    at.quote === undefined ? `RTLGraph: ${name} — the brief this design was asked for` : `RTLGraph: page ${at.page ?? '?'} — "${at.quote}"`,
  )
  return undefined
}
