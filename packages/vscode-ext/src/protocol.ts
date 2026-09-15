import type { ViewFilter } from '@rtlgraph/ir'
import type { FoldAction, FoldScope } from './webview/state.ts'

export type { FoldAction, FoldScope } from './webview/state.ts'

// Messages between the extension host and the schematic webview.

export type HostToWebview =
  // root: the opened file's name; files: it and every component schematic it
  // reaches, keyed by path relative to its directory. filter / unfolded: the last
  // choice stored for this file.
  | { type: 'load'; root: string; files: Record<string, string>; filter?: ViewFilter; unfolded?: string[] }
  | { type: 'setFilter'; filter: ViewFilter }
  | { type: 'fold'; action: FoldAction; scope: FoldScope; instance?: string }
  | { type: 'fitView' }
  | { type: 'rasterize'; id: number; scale: number } // PNG export needs the browser canvas

// Toolbar buttons that need the host (a quick pick, opening a file) run these.
export type ToolbarCommand = 'rtlgraph.fold' | 'rtlgraph.unfold' | 'rtlgraph.openComponent' | 'rtlgraph.openRoot'

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'setFilter'; filter: ViewFilter }
  | { type: 'setFold'; unfolded: string[] }
  | { type: 'rendered'; state: RenderState }
  | { type: 'command'; command: ToolbarCommand }
  | { type: 'export' }
  | { type: 'raster'; id: number; base64?: string; error?: string }

// What the webview last drew; lets commands and end-to-end tests observe it.
export interface RenderState {
  filter: ViewFilter
  nodes: number
  signals: number
  dim: number // drawn in grey: what the filter passed over
  unfolded: string[]
  selected?: string // a component instance
}
