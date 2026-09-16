import type { Flow, HierarchyEntry, SeqKind, ViewFilter } from '@rtlgraph/ir'
import { FILTER_PRESETS, hierarchyEntries, type FilterPreset } from '@rtlgraph/ir'

// Pure view-state logic of the webview, kept out of the DOM code so it can be
// tested under node.

// ── the filter, as the toolbar shows it: two groups, each with its own kinds ──

export type ViewGroup = 'comb' | 'seq'
export const GROUPS: readonly ViewGroup[] = ['comb', 'seq']
export const FLOWS: readonly Flow[] = ['data', 'control']
export const SEQ_KINDS: readonly SeqKind[] = ['reg', 'fsm']

export const GROUP_LABELS: Record<ViewGroup, string> = { comb: 'Comb', seq: 'Seq' }
export const FLOW_LABELS: Record<Flow, string> = { data: 'Data', control: 'Control' }
export const SEQ_LABELS: Record<SeqKind, string> = { reg: 'Registers', fsm: 'FSM' }
export const PRESET_LABELS: Record<FilterPreset, string> = {
  all: 'All',
  datapath: 'Datapath',
  controlpath: 'Control path',
  comb: 'Combinational only',
  registers: 'Registers only',
  fsm: 'State registers only',
}

export const isGroupOn = (filter: ViewFilter, group: ViewGroup): boolean => filter[group].length > 0

// Accepts anything (stored state, a hand-edited file) and returns a filter in
// canonical order, or undefined when it is not a usable filter.
export function normalizeFilter(value: unknown): ViewFilter | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as { comb?: unknown; seq?: unknown; flow?: unknown; time?: unknown }
  const { comb, seq } = Array.isArray(v.comb) || Array.isArray(v.seq) ? v : asTree(v)
  if (!Array.isArray(comb) || !Array.isArray(seq)) return undefined
  const c = FLOWS.filter(x => comb.includes(x))
  const s = SEQ_KINDS.filter(x => seq.includes(x))
  return c.length > 0 || s.length > 0 ? { comb: c, seq: s } : undefined
}

// The flat `{ flow, time }` filter of earlier files, read as the tree. `time`
// once said "seq" before the registers and the state registers were told apart,
// and the flow it was paired with says which registers were meant.
function asTree(value: { flow?: unknown; time?: unknown }): { comb: unknown[]; seq: unknown[] } {
  const flow = Array.isArray(value.flow) ? value.flow : []
  const time = Array.isArray(value.time) ? value.time : []
  const sequential = time.includes('seq') ? [...time, 'reg', 'fsm'] : time
  const seq = SEQ_KINDS.filter(
    kind => sequential.includes(kind) && flow.includes(kind === 'reg' ? 'data' : 'control'),
  )
  return { comb: time.includes('comb') ? flow : [], seq }
}

// A group is switched on with every kind under it, and cannot be switched off
// while it is the only one on — that would light nothing at all.
export function toggleGroup(filter: ViewFilter, group: ViewGroup): ViewFilter {
  if (!isGroupOn(filter, group)) {
    return group === 'comb' ? { ...filter, comb: [...FLOWS] } : { ...filter, seq: [...SEQ_KINDS] }
  }
  const other: ViewGroup = group === 'comb' ? 'seq' : 'comb'
  return isGroupOn(filter, other) ? { ...filter, [group]: [] } : filter
}

// A kind can only be touched while its group is on, and the last one stays on:
// a group with nothing under it is the group switched off, which is what the
// group button is for.
export function toggleFlow(filter: ViewFilter, flow: Flow): ViewFilter {
  if (!isGroupOn(filter, 'comb')) return filter
  const next = FLOWS.filter(x => (x === flow ? !filter.comb.includes(x) : filter.comb.includes(x)))
  return next.length > 0 ? { ...filter, comb: next } : filter
}

export function toggleSeq(filter: ViewFilter, kind: SeqKind): ViewFilter {
  if (!isGroupOn(filter, 'seq')) return filter
  const next = SEQ_KINDS.filter(x => (x === kind ? !filter.seq.includes(x) : filter.seq.includes(x)))
  return next.length > 0 ? { ...filter, seq: next } : filter
}

const sameSet = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every(x => b.includes(x))

export function presetOf(filter: ViewFilter): FilterPreset | undefined {
  return (Object.keys(FILTER_PRESETS) as FilterPreset[]).find(
    key => sameSet(FILTER_PRESETS[key].comb, filter.comb) && sameSet(FILTER_PRESETS[key].seq, filter.seq),
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

// A mark that belongs to the hand rather than to the drawing — a grip, a knob —
// is given in screen pixels and drawn divided by the zoom, so it stays the same
// size to aim at however far the schematic is zoomed.
export function screenSize(pixels: number, zoom: number | undefined): number {
  return pixels / (zoom !== undefined && zoom > 0 ? zoom : 1)
}

// Centre content of size (w, h) in a box of size (bw, bh), never enlarging past 1.5x.
export function fitViewport(w: number, h: number, bw: number, bh: number, pad = 16): Viewport {
  if (w <= 0 || h <= 0 || bw <= 0 || bh <= 0) return { x: 0, y: 0, zoom: 1 }
  const zoom = Math.min((bw - 2 * pad) / w, (bh - 2 * pad) / h, 1.5)
  return { zoom, x: (bw - w * zoom) / 2, y: (bh - h * zoom) / 2 }
}
