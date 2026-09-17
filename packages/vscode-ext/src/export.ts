import * as vscode from 'vscode'
import { graphFileKind, hierarchyEntries, loadHierarchy, validateFsmGraph, type FsmGraph, type ViewFilter } from '@rtlgraph/ir'
import { renderFsmPdf, renderFsmSvg, renderHierarchyPdf, renderHierarchySvg } from '@rtlgraph/render'
import { controlSheets, fsmSheets, renderXlsx } from '@rtlgraph/sheet'
import { exportFileName, exportFolderName, graphBaseName, type ExportFormat } from './exportFiles.ts'

export interface ExportSource {
  document: vscode.TextDocument
  filter: ViewFilter // what is on screen now
  unfolded: readonly string[] // the component instances drawn open now
  root: string // the document's file name, a key of `files`
  files: Record<string, string> // the document and the component schematics it reaches
  rasterize: (scale: number) => Promise<Uint8Array> // PNG bytes drawn by the webview
}

function readFsm(source: ExportSource): FsmGraph {
  let parsed: unknown
  try {
    parsed = JSON.parse(source.files[source.root] ?? '')
  } catch (err) {
    throw new Error(`the machine file is not readable JSON — ${(err as Error).message}`)
  }
  const result = validateFsmGraph(parsed)
  if (!result.ok) {
    const errors = result.diagnostics.filter(d => d.severity === 'error').length
    throw new Error(`the machine has ${errors} error(s); fix them before exporting`)
  }
  return parsed as FsmGraph
}

// Writes the current view of a schematic next to its graph file:
//   <dir>/.out-<name>/<name>.<view>.{svg,png,pdf}
// SVG and PDF are drawn here from the same scene; PNG comes from the webview canvas.
export async function exportSchematic(source: ExportSource, formats: readonly ExportFormat[]): Promise<{ files: vscode.Uri[]; warnings: string[] }> {
  // A state machine file draws its diagram; there is no hierarchy and no filter.
  const fsm = graphFileKind(source.root) === 'fsm' ? readFsm(source) : undefined
  const { root, diagnostics } = fsm
    ? { root: undefined, diagnostics: [] }
    : loadHierarchy(source.root, path => (Object.hasOwn(source.files, path) ? source.files[path] : undefined))
  if (!root && !fsm) {
    const errors = diagnostics.filter(d => d.severity === 'error').length
    throw new Error(`the graph has ${errors} error(s); fix them before exporting`)
  }

  const name = graphBaseName(source.document.uri.path)
  const pattern = vscode.workspace.getConfiguration('rtlgraph').get<string>('export.folder')
  const folder = vscode.Uri.joinPath(source.document.uri, '..', exportFolderName(pattern, name))
  await vscode.workspace.fs.createDirectory(folder)

  // unwrap: a figure of a design with one main component shows that component,
  // not a frame drawn around the whole picture.
  const options = {
    filter: source.filter,
    isUnfolded: (instance: string) => source.unfolded.includes(instance),
    unwrap: true, // a design with one main component shows that component
    frames: false, // and no panels around the components: a figure is the schematic
  }
  const files: vscode.Uri[] = []
  const warnings: string[] = []
  for (const format of formats) {
    let bytes: Uint8Array
    if (format === 'svg') {
      bytes = new TextEncoder().encode(fsm ? renderFsmSvg(fsm) : renderHierarchySvg(root!, options))
    } else if (format === 'pdf') {
      const pdf = fsm ? renderFsmPdf(fsm) : renderHierarchyPdf(root!, options)
      if (pdf.unsupportedText.length > 0) {
        warnings.push(`the PDF fonts cannot draw ${pdf.unsupportedText.join(' ')} (shown as "?"); the SVG and PNG show it correctly.`)
      }
      bytes = pdf.bytes
    } else if (format === 'xlsx') {
      // Every control block of the design, and every machine of the one opened:
      // the tables the drawing came from, in the form they were made in.
      bytes = renderXlsx(fsm
        ? fsmSheets(fsm)
        : hierarchyEntries(root).flatMap(entry => controlSheets(entry.graph, entry.instance || entry.graph.title)))
    } else {
      bytes = await source.rasterize(2)
    }
    const file = vscode.Uri.joinPath(folder, fsm ? `${name}.fsm.${format}` : exportFileName(name, source.filter, format))
    await vscode.workspace.fs.writeFile(file, bytes)
    files.push(file)
  }
  return { files, warnings }
}
