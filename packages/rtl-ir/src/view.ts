import type { ComponentGraph, Flow, RtlNode, Signal, ViewFilter } from './types.ts'
import { parseEndpoint } from './endpoint.ts'

// The two-axis filter (draft 01 §4). Shared by the editor and the HTML export so
// both hide exactly the same things.

export const FILTER_PRESETS = {
  all: { flow: ['data', 'control'], time: ['comb', 'seq'] },
  datapath: { flow: ['data'], time: ['comb', 'seq'] },
  controlpath: { flow: ['control'], time: ['comb', 'seq'] },
  comb: { flow: ['data', 'control'], time: ['comb'] },
  seq: { flow: ['data', 'control'], time: ['seq'] },
} satisfies Record<string, ViewFilter>

export type FilterPreset = keyof typeof FILTER_PRESETS

// Clock and reset nets belong to the control axis.
export const signalAxis = (s: Signal): Flow => (s.flow === 'data' ? 'data' : 'control')

export interface VisibleElements {
  nodes: Set<string>
  signals: Set<string>
}

// Policy "hide": a net is drawn only when its driver and at least one sink are
// visible; a port node is drawn only when one of its nets is.
export function visibleElements(graph: ComponentGraph, filter: ViewFilter): VisibleElements {
  const shown = (n: RtlNode | undefined) =>
    !!n && (n.kind === 'port' || n.kind === 'component' || (filter.flow.includes(n.flow) && filter.time.includes(n.time)))
  const endpointShown = (ref: string) => shown(graph.nodes[parseEndpoint(ref).node])

  const signals = new Set<string>()
  for (const [name, s] of Object.entries(graph.signals)) {
    if (s.hidden || !filter.flow.includes(signalAxis(s))) continue
    if (endpointShown(s.driver) && s.sinks.some(endpointShown)) signals.add(name)
  }

  const nodes = new Set<string>()
  for (const [id, n] of Object.entries(graph.nodes)) {
    if (n.kind !== 'port' && shown(n)) nodes.add(id)
  }
  for (const name of signals) {
    const s = graph.signals[name]
    for (const ref of [s.driver, ...s.sinks]) {
      const id = parseEndpoint(ref).node
      if (graph.nodes[id]?.kind === 'port') nodes.add(id)
    }
  }
  return { nodes, signals }
}
