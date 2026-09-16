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
// What the view's second axis sorts by. `seq` is one fact about a node; a reader
// wants the registers that hold data apart from the ones that hold a state.
export type ViewTime = 'comb' | 'reg' | 'fsm'
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
  fsm?: string // <name>.rtlgraph-fsm.json for the machine this box runs, relative to this file
}

export interface RegNode extends InstanceNode {
  kind: 'reg'
  rstKind?: 'sync' | 'async'
  rstPriority?: 'rst>en' | 'en>rst'
  rstValue?: string
  rstActive?: 'high' | 'low' // "low" for a reset like `if (!rst_n)`; drawn as a bubble
  enActive?: 'high' | 'low'
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

// A cell of a truth table. One bit is "0", "1" or "x"; a wider input or output
// carries the value as the code writes it ("2'd1", "IDLE").
export type TruthValue = string

export interface TruthTable {
  inputs: string[]
  outputs: string[]
  rows: { in: TruthValue[]; out: TruthValue[]; note?: string }[] // note: one line saying what the row means
  default?: { out: TruthValue[] }
  origin?: Origin // the casex statement
}

export interface ControlNode extends InstanceNode {
  kind: 'control'
  truthTable?: TruthTable
  equations?: { output: string; expr: string; origin?: Origin }[] // boolean assigns, when no table fits
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

// User-owned: everything the reader arranged by hand. Re-extraction never
// overwrites it (see mergeLayout), so an agent rewriting the graph from the RTL
// leaves the picture the way it was left.
export interface Layout {
  grid?: number
  nodes: Record<string, { x: number; y: number }>
  sizes?: Record<string, { w: number; h: number }> // a component frame the reader resized
  // A wire the reader shaped. One net can reach several sinks, so it is kept as
  // one path per branch; `points` is the short form for a net with a single path.
  wires?: Record<string, { points?: { x: number; y: number }[]; paths?: { x: number; y: number }[][] }>
  // Links the reader cut in the sketch. The net stays in `signals` — the file
  // still describes the RTL — and the editor reports the missing connection
  // instead, the way a type checker reports a hole.
  cut?: string[]
  collapsed?: string[] // group ids
}

export interface ViewFilter {
  flow: Flow[]
  time: ViewTime[]
}

export interface View {
  filter?: ViewFilter
  hiddenEdges?: 'hide' | 'bridge'
  viewport?: { x: number; y: number; zoom: number }
}

// ── State machines: <component>.rtlgraph-fsm.json ──
// A component gets one only when it has a machine worth drawing. The point is
// what the machine *means*: every state says what the design is doing while it
// is there, and every transition says when it is taken — in words, not as the
// condition's syntax (`guard` keeps that for reference).

export type FsmStyle = 'moore' | 'mealy'

export interface FsmState {
  meaning: string // what the design is doing in this state
  label?: string // short name for the diagram; the state id by default
  encoding?: string // the value in the code, e.g. "2'd1"
  outputs?: Record<string, string> // Moore: what this state drives
  origin?: Origin
}

export interface FsmTransition {
  from: string
  to: string
  when: string // in words: "a full sample has arrived"
  guard?: string // the condition as the code writes it, e.g. "cnt == 9 && ~stall"
  outputs?: Record<string, string> // Mealy: what taking it drives
  origin?: Origin
}

export interface FsmMachine {
  name: string // what the code calls the machine (its state register or module)
  style: FsmStyle // stated, never guessed
  reset: string // the state after reset
  node?: string // the node in the schematic that holds it
  inputs?: { name: string; meaning?: string }[]
  outputs?: { name: string; meaning?: string }[]
}

export interface FsmGraph {
  version: string
  kind: 'fsm'
  title: string // the component name
  created: string
  modified: string
  source: SourceInfo
  machine: FsmMachine
  states: Record<string, FsmState>
  transitions: FsmTransition[]
  layout?: Layout
  view?: View
  diagnostics?: Diagnostic[]
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
