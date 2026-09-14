import * as vscode from 'vscode'
import { randomBytes } from 'node:crypto'
import { FILTER_PRESETS, hierarchyEntries, loadHierarchy } from '@rtlgraph/ir'
import type { HostToWebview, RenderState, WebviewToHost } from './protocol.ts'
import type { ExportSource } from './export.ts'
import { collectHierarchyFiles } from './hierarchyFiles.ts'
import { normalizeFilter } from './webview/state.ts'
import { webviewHtml } from './webview/html.ts'

const RASTER_TIMEOUT_MS = 20_000
const RELOAD_DELAY_MS = 100

interface Panel {
  webview: vscode.Webview
  document: vscode.TextDocument
  source: () => ExportSource
  componentUri: (instance: string) => vscode.Uri | undefined
  rendered?: RenderState
}

// Read-only schematic view of a root or component schematic file. The host reads
// the file and every component schematic it reaches and forwards their text; the
// webview does the parsing, layout and rendering. The filter and the open
// components are remembered per file in workspaceState, so looking at a graph
// never modifies it.
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

  static activeComponentUri(instance: string): vscode.Uri | undefined {
    return RtlGraphEditorProvider.active?.componentUri(instance)
  }

  static activeDocument(): vscode.TextDocument | undefined {
    return RtlGraphEditorProvider.active?.document
  }

  private readonly context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext) {
    this.context = context
  }

  resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
    const { webview } = webviewPanel
    const filterKey = `rtlgraph.filter:${document.uri.toString()}`
    const foldKey = `rtlgraph.fold:${document.uri.toString()}`
    const storedFilter = () => normalizeFilter(this.context.workspaceState.get(filterKey))
    const storedFold = () => {
      const value = this.context.workspaceState.get(foldKey)
      return Array.isArray(value) && value.every(v => typeof v === 'string') ? (value as string[]) : undefined
    }

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

    const rootName = document.uri.path.split('/').pop()!
    const fileUri = (path: string) => vscode.Uri.joinPath(document.uri, '..', path)
    let files: Record<string, string> = {}
    let tracked = new Set<string>() // child schematic URIs, readable or not

    const panel: Panel = {
      webview,
      document,
      source: () => ({
        document,
        filter: panel.rendered?.filter ?? storedFilter() ?? FILTER_PRESETS.all,
        unfolded: panel.rendered?.unfolded ?? storedFold() ?? [],
        root: rootName,
        files: { ...files, [rootName]: document.getText() },
        rasterize,
      }),
      componentUri: instance => {
        const { root } = loadHierarchy(rootName, path => (path === rootName ? document.getText() : files[path]))
        const entry = hierarchyEntries(root).find(e => e.instance === instance)
        return entry && entry.instance !== '' ? fileUri(entry.path) : undefined
      },
    }

    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist')
    webview.options = { enableScripts: true, localResourceRoots: [dist] }
    webview.html = webviewHtml({
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js')).toString(),
      cspSource: webview.cspSource,
      nonce: randomBytes(16).toString('base64'),
    })

    // Open editors may hold unsaved changes to a child; prefer them over the disk.
    const readChild = async (path: string) => {
      const uri = fileUri(path)
      const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
      if (open) return open.getText()
      try {
        return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
      } catch {
        return undefined
      }
    }

    let generation = 0
    const sendDocument = async () => {
      const mine = ++generation
      const collected = await collectHierarchyFiles(rootName, document.getText(), readChild)
      if (mine !== generation) return // a newer reload started meanwhile
      files = collected.files
      tracked = new Set(collected.requested.map(path => fileUri(path).toString()))
      const message: HostToWebview = { type: 'load', root: rootName, files, filter: storedFilter(), unfolded: storedFold() }
      void webview.postMessage(message)
    }
    let reloadTimer: ReturnType<typeof setTimeout> | undefined
    const reloadSoon = () => {
      clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => void sendDocument(), RELOAD_DELAY_MS)
    }
    const onChildChanged = (uri: vscode.Uri) => {
      if (tracked.has(uri.toString())) reloadSoon()
    }
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.rtlgraph-schematic.json')

    const subscriptions = [
      watcher,
      webview.onDidReceiveMessage((message: WebviewToHost) => {
        if (message.type === 'ready') void sendDocument()
        else if (message.type === 'rendered') panel.rendered = message.state
        else if (message.type === 'setFilter') {
          const filter = normalizeFilter(message.filter)
          if (filter) void this.context.workspaceState.update(filterKey, filter)
        } else if (message.type === 'setFold') {
          if (Array.isArray(message.unfolded)) void this.context.workspaceState.update(foldKey, message.unfolded)
        } else if (message.type === 'command') {
          RtlGraphEditorProvider.active = panel
          void vscode.commands.executeCommand(message.command)
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
      // An agent rewriting a JSON file (or a manual edit) shows up immediately.
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.contentChanges.length === 0) return
        if (event.document.uri.toString() === document.uri.toString()) void sendDocument()
        else onChildChanged(event.document.uri)
      }),
      watcher.onDidChange(onChildChanged),
      watcher.onDidCreate(onChildChanged),
      watcher.onDidDelete(onChildChanged),
      webviewPanel.onDidChangeViewState(event => {
        if (event.webviewPanel.active) RtlGraphEditorProvider.active = panel
      }),
    ]
    RtlGraphEditorProvider.active = panel

    webviewPanel.onDidDispose(() => {
      clearTimeout(reloadTimer)
      for (const s of subscriptions) s.dispose()
      for (const pending of rasters.values()) pending.reject(new Error('the schematic was closed'))
      if (RtlGraphEditorProvider.active === panel) RtlGraphEditorProvider.active = undefined
    })
  }
}
