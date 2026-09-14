import type { ComponentGraph, Layout } from './types.ts'

export interface MergeResult {
  graph: ComponentGraph
  added: string[] // node ids new in `next`
  removed: string[] // node ids that disappeared
}

// Combines a freshly extracted graph with the user-owned parts of the previous
// one. Everything semantic comes from `next`; positions, collapsed groups, the
// view and the creation time survive from `prev`. Matching is by node id, which
// is why ids must be name-based rather than line- or order-based.
export function mergeLayout(prev: ComponentGraph | undefined, next: ComponentGraph): MergeResult {
  const nextIds = Object.keys(next.nodes)
  if (!prev) return { graph: next, added: nextIds.sort(), removed: [] }

  const prevIds = new Set(Object.keys(prev.nodes))
  const nextIdSet = new Set(nextIds)
  const prevPositions = prev.layout?.nodes ?? {}
  const nextPositions = next.layout?.nodes ?? {}

  const positions: Layout['nodes'] = {}
  for (const id of nextIds) {
    const pos = Object.hasOwn(prevPositions, id) ? prevPositions[id] : nextPositions[id]
    if (pos) positions[id] = { x: pos.x, y: pos.y }
  }

  const groupIds = new Set(Object.keys(next.groups ?? {}))
  const collapsed = (prev.layout?.collapsed ?? next.layout?.collapsed ?? []).filter(id => groupIds.has(id))

  const layout: Layout = { nodes: positions }
  const grid = prev.layout?.grid ?? next.layout?.grid
  if (grid !== undefined) layout.grid = grid
  if (collapsed.length > 0) layout.collapsed = collapsed

  const graph: ComponentGraph = { ...next, created: prev.created, layout }
  const view = prev.view ?? next.view
  if (view !== undefined) graph.view = view

  return {
    graph,
    added: nextIds.filter(id => !prevIds.has(id)).sort(),
    removed: [...prevIds].filter(id => !nextIdSet.has(id)).sort(),
  }
}
