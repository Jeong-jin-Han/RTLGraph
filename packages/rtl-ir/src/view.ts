import type { ComponentGraph, Flow, RtlNode, Signal, ViewFilter, ViewTime } from './types.ts'
import { parseEndpoint } from './endpoint.ts'

// The two-axis filter (draft 01 §4). Shared by the editor and every export so
// they all treat the filter the same way.
//
// The filter highlights; it does not hide. Hiding left nets cut in half — a wire
// whose driver was filtered away still had its sinks — and a schematic with holes
// is harder to read than one where the parts you asked for stand out. Everything
// stays on the page; what the filter does not pick is drawn dim.

export const FILTER_PRESETS = {
  all: { flow: ['data', 'control'], time: ['comb', 'reg', 'fsm'] },
  datapath: { flow: ['data'], time: ['comb', 'reg', 'fsm'] },
  controlpath: { flow: ['control'], time: ['comb', 'reg', 'fsm'] },
  comb: { flow: ['data', 'control'], time: ['comb'] },
  registers: { flow: ['data', 'control'], time: ['reg'] },
  fsm: { flow: ['data', 'control'], time: ['fsm'] },
} satisfies Record<string, ViewFilter>

export type FilterPreset = keyof typeof FILTER_PRESETS

// Clock and reset nets belong to the control axis.
export const signalAxis = (s: Signal): Flow => (s.flow === 'data' ? 'data' : 'control')

// Which side of the second axis a box sits on. A register that holds a machine's
// state — it names an FSM file, or its output only steers control — is read very
// differently from one holding data, so they are separated.
export function timeAxis(node: RtlNode): ViewTime | undefined {
  if (node.kind === 'port' || node.kind === 'component') return undefined
  if (node.time === 'comb') return 'comb'
  return node.kind === 'reg' && (node.fsm !== undefined || node.flow === 'control') ? 'fsm' : 'reg'
}

export interface VisibleElements {
  nodes: Set<string> // drawn at all — everything except the nets marked hidden
  signals: Set<string>
  litNodes: Set<string> // drawn in full colour; the rest are dim
  litSignals: Set<string>
}

const isEverything = (filter: ViewFilter) =>
  filter.flow.length === 2 && filter.time.length === 3

export function visibleElements(graph: ComponentGraph, filter: ViewFilter): VisibleElements {
  const nodes = new Set<string>()
  const signals = new Set<string>()
  for (const [name, s] of Object.entries(graph.signals)) if (!s.hidden) signals.add(name)
  for (const id of Object.keys(graph.nodes)) nodes.add(id)

  // A box is picked by the filter on both axes; a port or a component box has
  // neither, so it follows the nets that reach it.
  const picked = (n: RtlNode | undefined) => {
    const axis = n ? timeAxis(n) : undefined
    return !!n && axis !== undefined && filter.flow.includes((n as { flow: Flow }).flow) && filter.time.includes(axis)
  }

  const litNodes = new Set<string>()
  const litSignals = new Set<string>()
  if (isEverything(filter)) return { nodes, signals, litNodes: nodes, litSignals: signals }

  for (const id of nodes) if (picked(graph.nodes[id])) litNodes.add(id)
  for (const name of signals) {
    const s = graph.signals[name]
    if (!filter.flow.includes(signalAxis(s))) continue
    // A net is lit when it carries something between two boxes the filter picked;
    // a net that only touches ports or component boxes is lit by its own flow.
    const ends = [s.driver, ...s.sinks].map(ref => graph.nodes[parseEndpoint(ref).node])
    const boxes = ends.filter(n => n && n.kind !== 'port' && n.kind !== 'component')
    if (boxes.length > 0 && !boxes.every(picked)) continue
    litSignals.add(name)
  }
  // Ports and component boxes light up with the nets that reach them.
  for (const name of litSignals) {
    const s = graph.signals[name]
    for (const ref of [s.driver, ...s.sinks]) {
      const id = parseEndpoint(ref).node
      const kind = graph.nodes[id]?.kind
      if (kind === 'port' || kind === 'component') litNodes.add(id)
    }
  }
  return { nodes, signals, litNodes, litSignals }
}
