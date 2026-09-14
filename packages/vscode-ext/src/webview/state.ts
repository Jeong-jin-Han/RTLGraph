import type { Flow, HierarchyEntry, Time, ViewFilter } from '@rtlgraph/ir'
import { FILTER_PRESETS, hierarchyEntries, type FilterPreset } from '@rtlgraph/ir'

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

// ── fold state: the component instances drawn open ("u_host", "u_host/u_dma") ──

export type FoldAction = 'fold' | 'unfold'
// all: every component · node: just the one · descendants: it and everything inside
export type FoldScope = 'all' | 'node' | 'descendants'

// Every component instance of a hierarchy, parents before children.
export function componentInstances(root: HierarchyEntry): string[] {
  return hierarchyEntries(root).slice(1).map(e => e.instance)
}

// A root that only wraps one main component opens it; anything else starts folded.
export function defaultUnfolded(root: HierarchyEntry): string[] {
  const children = Object.values(root.children)
  return root.graph.kind === 'system' && children.length === 1 ? [children[0].instance] : []
}

// Stored state may name instances that no longer exist; keep the rest in order.
export function normalizeUnfolded(value: unknown, instances: readonly string[]): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return instances.filter(i => value.includes(i))
}

const isInside = (instance: string, outer: string) => instance.startsWith(`${outer}/`)

// A component is on screen when every component around it is open.
export function isInstanceShown(instance: string, unfolded: readonly string[]): boolean {
  const parts = instance.split('/')
  return parts.slice(0, -1).every((_, k) => unfolded.includes(parts.slice(0, k + 1).join('/')))
}

// Folding one component leaves the state of those inside it alone, so unfolding
// it again brings back the same picture. Unfolding opens the way to it as well.
export function applyFold(
  unfolded: readonly string[],
  instances: readonly string[],
  action: FoldAction,
  scope: FoldScope,
  instance?: string,
): string[] {
  const whole = scope === 'all' || instance === undefined
  return instances.filter(i => {
    if (whole || i === instance || (scope === 'descendants' && isInside(i, instance))) return action === 'unfold'
    if (action === 'unfold' && isInside(instance, i)) return true
    return unfolded.includes(i)
  })
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
