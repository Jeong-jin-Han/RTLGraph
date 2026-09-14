import type { Flow, Time, ViewFilter } from '@rtlgraph/ir'
import { FILTER_PRESETS, type FilterPreset } from '@rtlgraph/ir'

// Pure view-state logic of the webview, kept out of the DOM code so it can be
// tested under node.

export const FLOWS: readonly Flow[] = ['data', 'control']
export const TIMES: readonly Time[] = ['comb', 'seq']

export const FLOW_LABELS: Record<Flow, string> = { data: 'Data', control: 'Control' }
export const TIME_LABELS: Record<Time, string> = { comb: 'Comb', seq: 'Seq' }
export const PRESET_LABELS: Record<FilterPreset, string> = {
  all: 'All',
  datapath: 'Datapath',
  controlpath: 'Control path',
  comb: 'Combinational only',
  seq: 'Sequential only',
}

// Accepts anything (stored state, a hand-edited file) and returns a filter in
// canonical order, or undefined when it is not a usable filter.
export function normalizeFilter(value: unknown): ViewFilter | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { flow, time } = value as { flow?: unknown; time?: unknown }
  if (!Array.isArray(flow) || !Array.isArray(time)) return undefined
  const f = FLOWS.filter(x => flow.includes(x))
  const t = TIMES.filter(x => time.includes(x))
  return f.length > 0 && t.length > 0 ? { flow: f, time: t } : undefined
}

// Toggling never empties an axis: the last checked box stays checked.
export function toggleFlow(filter: ViewFilter, flow: Flow): ViewFilter {
  const next = FLOWS.filter(x => (x === flow ? !filter.flow.includes(x) : filter.flow.includes(x)))
  return next.length > 0 ? { flow: next, time: [...filter.time] } : filter
}

export function toggleTime(filter: ViewFilter, time: Time): ViewFilter {
  const next = TIMES.filter(x => (x === time ? !filter.time.includes(x) : filter.time.includes(x)))
  return next.length > 0 ? { flow: [...filter.flow], time: next } : filter
}

const sameSet = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every(x => b.includes(x))

export function presetOf(filter: ViewFilter): FilterPreset | undefined {
  return (Object.keys(FILTER_PRESETS) as FilterPreset[]).find(
    key => sameSet(FILTER_PRESETS[key].flow, filter.flow) && sameSet(FILTER_PRESETS[key].time, filter.time),
  )
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8

// Zoom by `factor` keeping the content under screen point (sx, sy) fixed.
export function zoomAt(v: Viewport, factor: number, sx: number, sy: number): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
  const k = zoom / v.zoom
  return { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k }
}

// Centre content of size (w, h) in a box of size (bw, bh), never enlarging past 1.5x.
export function fitViewport(w: number, h: number, bw: number, bh: number, pad = 16): Viewport {
  if (w <= 0 || h <= 0 || bw <= 0 || bh <= 0) return { x: 0, y: 0, zoom: 1 }
  const zoom = Math.min((bw - 2 * pad) / w, (bh - 2 * pad) / h, 1.5)
  return { zoom, x: (bw - w * zoom) / 2, y: (bh - h * zoom) / 2 }
}
