// IR of RTLGraph files — the contract between the extractor (an agent, or
// rtl-parse) and the renderer. Only semantics live here: anything a renderer
// can derive (port widths from params, mux input order from the registry) is
// deliberately left out so each fact has exactly one source.
//
// Files (see files.ts):
//   <top module>.rtlgraph.json               kind "system": the root, only connects components
//   <component>.rtlgraph-schematic.json      kind "component": one component's schematic,
//                                             which may contain child components (recursive)

export const IR_VERSION = '0.1.0'

export type GraphKind = 'system' | 'component'
export type Flow = 'data' | 'control'
export type Time = 'comb' | 'seq'
export type SignalFlow = Flow | 'clock' | 'reset'
export type PortDir = 'in' | 'out' | 'inout'
export type Severity = 'error' | 'warn' | 'info'

export interface Origin {
  file: string // relative to source.root
  line: number // 1-based
}

export interface Diagnostic {
  severity: Severity
  code: string
  msg: string
  file?: string
  line?: number
  node?: string
  signal?: string
}

export interface SourceInfo {
  root: string // project root, relative to the JSON file
  lib?: string // shared primitive library, relative to root
  files: string[]
  libFiles?: string[]
  top: string
  contractCheck?: 'pass' | 'partial' | 'fail' | 'unknown'
}

// A net. Endpoints are "<nodeId>:<port>", or "@NAME" for a module port node.
export interface Signal {
  width: number
  flow: SignalFlow
  driver: string
  sinks: string[]
  aliases?: string[] // other names of the same net, e.g. from `assign OUT_D = ACC_D`
  meaning?: string // per-value meaning from `// @sch: meaning=...`
  hidden?: boolean
  origin?: Origin
}

interface NodeCommon {
  label?: string
  component?: string // absent: the component this file describes
  group?: string
  origin?: Origin // the instance statement
}

interface InstanceNode extends NodeCommon {
  flow: Flow
  time: Time
  module: string
  params?: Record<string, number>
  ports: Record<string, PortDir>
  consts?: Record<string, string> // input port -> literal, e.g. EN: "1'b1"
}

export interface RegNode extends InstanceNode {
  kind: 'reg'
  rstKind?: 'sync' | 'async'
  rstPriority?: 'rst>en' | 'en>rst'
  rstValue?: string
}

export interface OpNode extends InstanceNode {
  kind: 'op'
}

export interface MuxNode extends InstanceNode {
  kind: 'mux'
}

// A project module the registry has no symbol for; drawn as a generic box.
export interface ModuleNode extends InstanceNode {
  kind: 'module'
}

export interface BlackboxNode extends InstanceNode {
  kind: 'blackbox'
  rdelay?: number
}

export type TruthValue = '0' | '1' | 'x'

export interface TruthTable {
  inputs: string[]
  outputs: string[]
  rows: { in: TruthValue[]; out: TruthValue[]; note?: string }[]
  default?: { out: TruthValue[] }
  origin?: Origin // the casex statement
}

export interface ControlNode extends InstanceNode {
  kind: 'control'
  truthTable?: TruthTable
  equations?: { output: string; expr: string }[] // 1-bit boolean assigns
}

// A child component. Its inside lives in its own schematic file; a view can
// draw it folded (one box) or unfolded (its schematic inside a frame).
// Carries no flow/time — it holds both — and is never hidden by the filter.
export interface ComponentNode extends NodeCommon {
  kind: 'component'
  name: string // the component (folder) name
  module: string // the component's TOP module
  ref: string // <name>.rtlgraph-schematic.json, relative to this JSON file
  params?: Record<string, number>
  ports: Record<string, PortDir>
  consts?: Record<string, string>
}

// A port of the component itself. Ports carry no `time` and are never
// hidden by the flow/time filter.
export interface PortNode extends NodeCommon {
  kind: 'port'
  dir: PortDir
  flow: SignalFlow
}

export type RtlNode = RegNode | OpNode | MuxNode | ModuleNode | BlackboxNode | ControlNode | ComponentNode | PortNode
export type NodeKind = RtlNode['kind']

export interface Group {
  label: string
  members: string[]
}

// User-owned. Re-extraction never overwrites it (see mergeLayout).
export interface Layout {
  grid?: number
  nodes: Record<string, { x: number; y: number }>
  collapsed?: string[] // group ids
}

export interface ViewFilter {
  flow: Flow[]
  time: Time[]
}

export interface View {
  filter?: ViewFilter
  hiddenEdges?: 'hide' | 'bridge'
  viewport?: { x: number; y: number; zoom: number }
}

// Named for history: describes both the root ("system") and component files.
export interface ComponentGraph {
  version: string
  kind: GraphKind
  title: string
  created: string
  modified: string
  source: SourceInfo
  signals: Record<string, Signal>
  nodes: Record<string, RtlNode>
  groups?: Record<string, Group>
  layout?: Layout
  view?: View
  diagnostics?: Diagnostic[]
}
