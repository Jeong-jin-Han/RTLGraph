import type { ViewFilter } from '@rtlgraph/ir'
import { presetOf } from './webview/state.ts'

// Where an export goes. Pure, so it can be tested without VS Code.
//   acc_top.rtlgraph.json + datapath filter + pdf  ->  .out-acc_top/acc_top.datapath.pdf

export type ExportFormat = 'svg' | 'png' | 'pdf'
export const EXPORT_FORMATS: readonly ExportFormat[] = ['svg', 'png', 'pdf']

// Setting rtlgraph.export.folder; ${name} is the graph file name without .rtlgraph.json.
// Hidden by default, like NodeGraph's `.<name>-imgs` folder next to a graph.
export const DEFAULT_EXPORT_FOLDER = '.out-${name}'

export function graphBaseName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  return base.replace(/\.rtlgraph\.json$/i, '').replace(/\.json$/i, '') || 'rtlgraph'
}

// A folder next to the graph file. Anything that would escape that directory
// (absolute paths, "..") falls back to the default pattern.
export function exportFolderName(pattern: string | undefined, name: string): string {
  const expand = (p: string) => p.replace(/\$\{name\}/g, name).trim()
  const candidate = expand(pattern ?? DEFAULT_EXPORT_FOLDER)
  const parts = candidate.split(/[\\/]+/).filter(Boolean)
  const safe = candidate !== '' && !/^([\\/]|[A-Za-z]:)/.test(candidate) && parts.every(p => p !== '..' && p !== '.')
  return safe ? parts.join('/') : expand(DEFAULT_EXPORT_FOLDER)
}

export function viewName(filter: ViewFilter): string {
  return presetOf(filter) ?? `${filter.flow.join('+')}.${filter.time.join('+')}`
}

export function exportFileName(name: string, filter: ViewFilter, format: ExportFormat): string {
  return `${name}.${viewName(filter)}.${format}`
}
