import type { ViewFilter } from '@rtlgraph/ir'

// Messages between the extension host and the schematic webview.

export type HostToWebview =
  | { type: 'load'; text: string; filter?: ViewFilter } // filter: last choice stored for this file
  | { type: 'setFilter'; filter: ViewFilter }
  | { type: 'fitView' }

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'setFilter'; filter: ViewFilter }
  | { type: 'rendered'; state: RenderState }

// What the webview last drew; lets commands and end-to-end tests observe it.
export interface RenderState {
  filter: ViewFilter
  nodes: number
  signals: number
}
