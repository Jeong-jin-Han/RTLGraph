import type { Layout } from '@rtlgraph/ir'

// The arrangement the reader makes by hand, as plain functions on a Layout so the
// DOM code stays about pointers and the rules stay testable.
//
// Only what the opened file itself draws can be arranged here: an id carrying an
// instance path (acc/CNT_FF) belongs to a component's own file, and is arranged
// by opening that file. The editor says so rather than writing someone else's.

export const belongsToThisFile = (id: string): boolean => !id.includes('/')

const pruned = (layout: Layout): Layout => {
  const out: Layout = { nodes: layout.nodes }
  if (layout.grid !== undefined) out.grid = layout.grid
  if (layout.sizes && Object.keys(layout.sizes).length > 0) out.sizes = layout.sizes
  if (layout.wires && Object.keys(layout.wires).length > 0) out.wires = layout.wires
  if (layout.cut && layout.cut.length > 0) out.cut = [...layout.cut].sort()
  if (layout.collapsed && layout.collapsed.length > 0) out.collapsed = layout.collapsed
  return out
}

export const emptyLayout = (): Layout => ({ nodes: {} })

export function movedTo(layout: Layout, id: string, x: number, y: number): Layout {
  return pruned({ ...layout, nodes: { ...layout.nodes, [id]: { x: Math.round(x), y: Math.round(y) } } })
}

// A frame only ever grows: the layout engine keeps it at least as big as what is
// inside, so asking for less than that does nothing.
export function resizedTo(layout: Layout, id: string, w: number, h: number): Layout {
  const sizes = { ...layout.sizes, [id]: { w: Math.round(w), h: Math.round(h) } }
  return pruned({ ...layout, sizes })
}

export function shapedTo(layout: Layout, name: string, points: { x: number; y: number }[]): Layout {
  const wires = { ...layout.wires, [name]: { points: points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })) } }
  return pruned({ ...layout, wires })
}

export const isCut = (layout: Layout, name: string): boolean => (layout.cut ?? []).includes(name)

export function withCut(layout: Layout, name: string): Layout {
  if (isCut(layout, name)) return layout
  // A wire the reader shaped and then cut keeps no shape: it is not drawn at all.
  const wires = { ...layout.wires }
  delete wires[name]
  return pruned({ ...layout, wires, cut: [...(layout.cut ?? []), name] })
}

export function withoutCut(layout: Layout, name: string): Layout {
  if (!isCut(layout, name)) return layout
  return pruned({ ...layout, cut: (layout.cut ?? []).filter(other => other !== name) })
}

// Anything the reader changed by hand, undone in one go.
export function cleared(layout: Layout): Layout {
  return { nodes: {}, ...(layout.grid !== undefined ? { grid: layout.grid } : {}), ...(layout.collapsed ? { collapsed: layout.collapsed } : {}) }
}

export const isArranged = (layout: Layout | undefined): boolean =>
  !!layout &&
  (Object.keys(layout.nodes ?? {}).length > 0 ||
    Object.keys(layout.sizes ?? {}).length > 0 ||
    Object.keys(layout.wires ?? {}).length > 0 ||
    (layout.cut ?? []).length > 0)
