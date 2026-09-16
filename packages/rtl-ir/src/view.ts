import type { ComponentGraph, Flow, RtlNode, SeqKind, Signal, ViewFilter } from './types.ts'
import { parseEndpoint } from './endpoint.ts'

// The filter (draft 01 §4). Shared by the editor and every export so they all
// treat it the same way.
//
// It is a two-level tree: the combinational group splits into the data path and
// the control path, the sequential group into plain registers and the registers
// that hold a state. That is how a top module is drawn in D02 ("Registers |
// Data-path | Control-path | Registers (for FSM)"), and it is why the sub-kinds
// hang off their group instead of forming a second free axis: "control" of a
// register does not mean the same thing as "control" of a block of logic.
//
// The filter highlights; it does not hide. Hiding left nets cut in half — a wire
// whose driver was filtered away still had its sinks — and a schematic with holes
// is harder to read than one where the parts you asked for stand out. Everything
// stays on the page; what the filter does not pick is drawn dim.

export const FILTER_PRESETS = {
  all: { comb: ['data', 'control'], seq: ['reg', 'fsm'] },
  datapath: { comb: ['data'], seq: ['reg'] },
  controlpath: { comb: ['control'], seq: ['fsm'] },
  comb: { comb: ['data', 'control'], seq: [] },
  registers: { comb: [], seq: ['reg'] },
  fsm: { comb: [], seq: ['fsm'] },
} satisfies Record<string, ViewFilter>

export type FilterPreset = keyof typeof FILTER_PRESETS

// Clock and reset nets belong to the control axis.
export const signalAxis = (s: Signal): Flow => (s.flow === 'data' ? 'data' : 'control')

// Which kind of register a sequential box is; `undefined` for anything else.
// A register that holds a machine's state — it names an FSM file, or its output
// only steers control — is read very differently from one holding data.
export function seqKind(node: RtlNode): SeqKind | undefined {
  if (node.kind === 'port' || node.kind === 'component' || node.time === 'comb') return undefined
  return node.kind === 'reg' && (node.fsm !== undefined || node.flow === 'control') ? 'fsm' : 'reg'
}

// Whether the filter picks a box: the group it belongs to must be on, and within
// it the box's own kind.
export function picks(filter: ViewFilter, node: RtlNode | undefined): boolean {
  if (!node || node.kind === 'port' || node.kind === 'component') return false
  if (node.time === 'comb') return filter.comb.includes(node.flow)
  return filter.seq.includes(seqKind(node)!)
}

// Which flows the filter is asking about. Registers sit on the path they serve —
// plain ones in the data path, state registers in the control path — so each
// group contributes the flow of the kinds picked inside it.
function flowsOn(filter: ViewFilter): Flow[] {
  const flows: Flow[] = []
  if (filter.comb.includes('data') || filter.seq.includes('reg')) flows.push('data')
  if (filter.comb.includes('control') || filter.seq.includes('fsm')) flows.push('control')
  return flows
}

export interface VisibleElements {
  nodes: Set<string> // drawn at all — everything except the nets marked hidden
  signals: Set<string>
  litNodes: Set<string> // drawn in full colour; the rest are dim
  litSignals: Set<string>
}

const isEverything = (filter: ViewFilter) => filter.comb.length === 2 && filter.seq.length === 2

export function visibleElements(graph: ComponentGraph, filter: ViewFilter): VisibleElements {
  const nodes = new Set<string>()
  const signals = new Set<string>()
  for (const [name, s] of Object.entries(graph.signals)) if (!s.hidden) signals.add(name)
  for (const id of Object.keys(graph.nodes)) nodes.add(id)

  // A box is picked by its group and kind; a port or a component box has
  // neither, so it follows the nets that reach it.
  const picked = (n: RtlNode | undefined) => picks(filter, n)
  const flows = flowsOn(filter)

  const litNodes = new Set<string>()
  const litSignals = new Set<string>()
  if (isEverything(filter)) return { nodes, signals, litNodes: nodes, litSignals: signals }

  for (const id of nodes) if (picked(graph.nodes[id])) litNodes.add(id)
  for (const name of signals) {
    const s = graph.signals[name]
    if (!flows.includes(signalAxis(s))) continue
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
