import * as vscode from 'vscode'
import { validateComponentGraph, type ComponentGraph, type ViewFilter } from '@rtlgraph/ir'
import { renderPdf, renderSvg } from '@rtlgraph/render'
import { exportFileName, exportFolderName, graphBaseName, type ExportFormat } from './exportFiles.ts'

export interface ExportSource {
  document: vscode.TextDocument
  filter: ViewFilter // what is on screen now
  rasterize: (scale: number) => Promise<Uint8Array> // PNG bytes drawn by the webview
}

// Writes the current view of a schematic next to its graph file:
//   <dir>/.out-<name>/<name>.<view>.{svg,png,pdf}
// SVG and PDF are drawn here from the same scene; PNG comes from the webview canvas.
export async function exportSchematic(source: ExportSource, formats: readonly ExportFormat[]): Promise<{ files: vscode.Uri[]; warnings: string[] }> {
  let graph: unknown
  try {
    graph = JSON.parse(source.document.getText())
  } catch (err) {
    throw new Error(`the file is not valid JSON (${(err as Error).message})`)
  }
  const result = validateComponentGraph(graph)
  if (!result.ok) {
    const errors = result.diagnostics.filter(d => d.severity === 'error').length
    throw new Error(`the graph has ${errors} error(s); fix them before exporting`)
  }

  const name = graphBaseName(source.document.uri.path)
  const pattern = vscode.workspace.getConfiguration('rtlgraph').get<string>('export.folder')
  const folder = vscode.Uri.joinPath(source.document.uri, '..', exportFolderName(pattern, name))
  await vscode.workspace.fs.createDirectory(folder)

  const options = { filter: source.filter }
  const files: vscode.Uri[] = []
  const warnings: string[] = []
  for (const format of formats) {
    let bytes: Uint8Array
    if (format === 'svg') {
      bytes = new TextEncoder().encode(renderSvg(graph as ComponentGraph, options))
    } else if (format === 'pdf') {
      const pdf = renderPdf(graph as ComponentGraph, options)
      if (pdf.unsupportedText.length > 0) {
        warnings.push(`the PDF fonts cannot draw ${pdf.unsupportedText.join(' ')} (shown as "?"); the SVG and PNG show it correctly.`)
      }
      bytes = pdf.bytes
    } else {
      bytes = await source.rasterize(2)
    }
    const file = vscode.Uri.joinPath(folder, exportFileName(name, source.filter, format))
    await vscode.workspace.fs.writeFile(file, bytes)
    files.push(file)
  }
  return { files, warnings }
}
