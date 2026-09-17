import type { ViewFilter } from '@rtlgraph/ir'
import { graphName } from '@rtlgraph/ir'
import { presetOf } from './webview/state.ts'

// Where an export goes. Pure, so it can be tested without VS Code.
//   acc/acc.rtlgraph-schematic.json + datapath filter + pdf  ->  acc/.out-acc/acc.datapath.pdf
//   acc_top.rtlgraph.json (root) + all + svg                  ->  .out-acc_top/acc_top.all.svg

export type ExportFormat = 'svg' | 'png' | 'pdf' | 'xlsx'
export const EXPORT_FORMATS: readonly ExportFormat[] = ['svg', 'png', 'pdf', 'xlsx']

// Setting rtlgraph.export.folder; ${name} is the graph's name: the component name for a
// schematic, the top module for a root file.
// Hidden by default, like NodeGraph's `.<name>-imgs` folder next to a graph.
export const DEFAULT_EXPORT_FOLDER = '.out-${name}'

export function graphBaseName(fileName: string): string {
  return graphName(fileName) || 'rtlgraph'
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
  const group = (kinds: readonly string[]) => (kinds.length > 0 ? kinds.join('+') : 'off')
  return presetOf(filter) ?? `comb-${group(filter.comb)}.seq-${group(filter.seq)}`
}

export function exportFileName(name: string, filter: ViewFilter, format: ExportFormat): string {
  // The workbook is the tables behind the drawing, not the drawing: the filter
  // does not change what is in it, so its name says what it holds instead.
  return format === 'xlsx' ? `${name}.control.xlsx` : `${name}.${viewName(filter)}.${format}`
}
