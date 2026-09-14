import type { ComponentGraph, Diagnostic, PortDir, RtlNode, Time } from '@rtlgraph/ir'
import { parseEndpoint } from '@rtlgraph/ir'

// Symbols for the modules in base/. A module missing here is not an error — it
// is drawn as a generic box — so base/ can grow one promotion at a time.

export type Side = 'left' | 'right' | 'top' | 'bottom'
export type PortRole = 'data' | 'select' | 'enable' | 'reset' | 'clock'

export interface SymbolPort {
  name: string
  dir: PortDir
  side: Side // fixed per symbol so wires never flip sides between renders
  role: PortRole
  width: 'param' | number
}

export interface SymbolDef {
  module: string
  kind: 'reg' | 'op' | 'mux'
  time: Time
  symbol: 'register' | 'box' | 'mux'
  label?: string
  ports: SymbolPort[] // for a mux, data inputs are listed in select order
  // base/ convention: BW is the MSB index, so a 'param' port is BW+1 bits wide.
  widthParam: { name: string; default: number; offset: number }
}

// Sides follow the slide p.31 schematic: registers sit on the bottom row with D
// entering from the top and Q leaving from the bottom; combinational blocks take
// data from below and drive it upward; control pins come in from the left.
const BW = { name: 'BW', default: 5, offset: 1 }
const port = (name: string, dir: PortDir, side: Side, role: PortRole, width: SymbolPort['width']): SymbolPort =>
  ({ name, dir, side, role, width })
const opIn = (name: string) => port(name, 'in', 'bottom', 'data', 'param')
const opOut = (name: string, width: SymbolPort['width'] = 'param') => port(name, 'out', 'top', 'data', width)

export const BASE_REGISTRY: Readonly<Record<string, SymbolDef>> = {
  DFF: {
    module: 'DFF', kind: 'reg', time: 'seq', symbol: 'register', widthParam: BW,
    ports: [
      port('CLK', 'in', 'right', 'clock', 1),
      port('RST', 'in', 'left', 'reset', 1),
      port('EN', 'in', 'left', 'enable', 1),
      port('D', 'in', 'top', 'data', 'param'),
      port('Q', 'out', 'bottom', 'data', 'param'),
    ],
  },
  INC: {
    module: 'INC', kind: 'op', time: 'comb', symbol: 'box', label: '+1', widthParam: BW,
    ports: [opIn('a'), opOut('y')],
  },
  ADD: {
    module: 'ADD', kind: 'op', time: 'comb', symbol: 'box', label: 'ADD', widthParam: BW,
    ports: [opIn('a'), opIn('b'), opOut('y')],
  },
  SUB: {
    module: 'SUB', kind: 'op', time: 'comb', symbol: 'box', label: 'SUB', widthParam: BW,
    ports: [opIn('a'), opIn('b'), opOut('y')],
  },
  MUX2: {
    module: 'MUX2', kind: 'mux', time: 'comb', symbol: 'mux', widthParam: BW,
    ports: [port('sel', 'in', 'left', 'select', 1), opIn('d0'), opIn('d1'), opOut('y')],
  },
  CMP_EQ: {
    module: 'CMP_EQ', kind: 'op', time: 'comb', symbol: 'box', label: '=', widthParam: BW,
    ports: [opIn('a'), opIn('b'), opOut('y', 1)],
  },
}

export function lookupSymbol(module: string): SymbolDef | undefined {
  return Object.hasOwn(BASE_REGISTRY, module) ? BASE_REGISTRY[module] : undefined
}

export function portWidth(def: SymbolDef, port: string, params: Record<string, number> = {}): number | undefined {
  const p = def.ports.find(x => x.name === port)
  if (!p) return undefined
  if (p.width !== 'param') return p.width
  return (params[def.widthParam.name] ?? def.widthParam.default) + def.widthParam.offset
}

// Registry modules whose ports, kind or time disagree with the symbol: a sign
// that base/ and the registry have drifted apart. Component boxes are checked
// against their own schematic file instead (see loadHierarchy).
export function checkNodeAgainstRegistry(id: string, node: RtlNode): Diagnostic[] {
  if (node.kind === 'port' || node.kind === 'component') return []
  const def = lookupSymbol(node.module)
  if (!def) return []
  const out: Diagnostic[] = []
  const warn = (code: string, msg: string) => out.push({ severity: 'warn', code, msg, node: id })

  const expected = new Map(def.ports.map(p => [p.name, p.dir]))
  for (const [name, dir] of Object.entries(node.ports)) {
    const want = expected.get(name)
    if (want === undefined) warn('registry-ports', `${node.module} has no port "${name}"`)
    else if (want !== dir) warn('registry-ports', `${node.module}.${name} is ${want}, node says ${dir}`)
  }
  for (const name of expected.keys()) {
    if (!Object.hasOwn(node.ports, name)) warn('registry-ports', `port "${name}" of ${node.module} is missing`)
  }
  if (node.kind !== def.kind) warn('registry-kind', `${node.module} is a ${def.kind}, node says ${node.kind}`)
  if (node.time !== def.time) warn('registry-time', `${node.module} is ${def.time}, node says ${node.time}`)
  return out
}

export function checkSignalWidths(graph: ComponentGraph): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const [name, signal] of Object.entries(graph.signals)) {
    for (const ref of [signal.driver, ...signal.sinks]) {
      const { node: id, port } = parseEndpoint(ref)
      const node = graph.nodes[id]
      if (!node || node.kind === 'port' || node.kind === 'component' || port === null) continue
      const def = lookupSymbol(node.module)
      const width = def && portWidth(def, port, node.params)
      if (width !== undefined && width !== signal.width) {
        out.push({ severity: 'error', code: 'width', msg: `"${ref}" is ${width} bits but "${name}" is ${signal.width}`, node: id, signal: name })
      }
    }
  }
  return out
}
