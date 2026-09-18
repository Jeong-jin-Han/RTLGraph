import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
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

// What an RTLGraph tab is marked with, wherever we own the tab: the drawing, the
// state diagram, and the document reader below. Drawn for a tab's size rather
// than scaled down from the marketplace logo.
export const tabIcon = (context: vscode.ExtensionContext): vscode.Uri =>
  vscode.Uri.joinPath(context.extensionUri, 'resources', 'file-icon.svg')

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
    panel.iconPath = tabIcon(context)
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
  })
  return report
}

// pdf.js's own viewer, served out of the extension with three changes: a CSP a
// webview will accept, a <base> so its relative assets resolve to webview URIs,
// and our bridge script (which finds the quoted sentence and hands it to the
// viewer's find controller). Nothing else about the viewer is touched.
function pageOf(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const web = vscode.Uri.joinPath(context.extensionUri, 'dist/pdfjs-viewer/web')
  const base = `${webview.asWebviewUri(web).toString()}/`
  const nonce = randomBytes(16).toString('base64')
  const csp = [
    `default-src 'none'`,
    // 'wasm-unsafe-eval' is the viewer's own requirement: it decodes some images
    // with WebAssembly.
    `script-src ${webview.cspSource} 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    // The worker is fetched as text and started from a blob — a webview's
    // resources are not same-origin, so it cannot be started from its URI.
    `worker-src blob:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `img-src ${webview.cspSource} blob: data:`,
    `media-src blob:`,
    `font-src ${webview.cspSource} data:`,
    `connect-src ${webview.cspSource} blob: data:`,
  ].join('; ')

  const settings = JSON.stringify({
    worker: webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist/pdfjs-viewer/build/pdf.worker.mjs')).toString(),
    fonts: `${webview.asWebviewUri(vscode.Uri.joinPath(web, 'standard_fonts')).toString()}/`,
    cmaps: `${webview.asWebviewUri(vscode.Uri.joinPath(web, 'cmaps')).toString()}/`,
  })

  return readFileSync(vscode.Uri.joinPath(web, 'viewer.html').fsPath, 'utf8')
    .replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, `<meta http-equiv="Content-Security-Policy" content="${csp}">`)
    .replace('<head>', `<head>\n    <base href="${base}">`)
    .replace('</head>', `  <style>
      /* VS Code gives a webview's body a side padding of its own. The viewer is
         laid out to fill the window, so that padding pushed its toolbar right and
         cut the buttons off the right-hand edge. */
      html, body { margin: 0 !important; padding: 0 !important; width: 100%; height: 100%; overflow: hidden }
      /* One line of ours under the viewer's toolbar: which sentence this was
         opened for, and whether the document still says it. */
      /* A strip above the viewer's own toolbar, so nothing of pdf.js is covered. */
      #rtlgraph-note { position: absolute; top: 0; left: 0; right: 0; height: 22px; z-index: 100002;
        box-sizing: border-box; padding: 0 10px; line-height: 21px;
        font: 12px var(--vscode-font-family, sans-serif);
        background: var(--vscode-editorWidget-background, #2b2b2b); color: var(--vscode-foreground, #ddd);
        border-bottom: 1px solid var(--vscode-panel-border, #444);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
      #rtlgraph-note.miss, #rtlgraph-note.loose { color: var(--vscode-editorWarning-foreground, #e2b03a) }
      /* The viewer is height:100%, so making room for the strip means taking the
         same 22px off its height — shifting it alone cut the bottom off. */
      #outerContainer { position: relative; top: 22px; height: calc(100% - 22px) }
    </style>
    <script nonce="${nonce}">window.__RTLGRAPH__ = ${settings};</script>
    <script type="module" nonce="${nonce}" src="bridge.mjs"></script>
  </head>`)
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
