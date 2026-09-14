import type { Diagnostic } from './types.ts'
import { parseEndpoint } from './endpoint.ts'
import { isInstancePath, isPortNodeId } from './ids.ts'

// Structural validation of a component graph. Problems are collected as
// diagnostics instead of thrown, so a partially broken extraction can still be
// rendered with its problems listed.

type Obj = Record<string, unknown>

const FLOWS = new Set(['data', 'control'])
const TIMES = new Set(['comb', 'seq'])
const SIGNAL_FLOWS = new Set(['data', 'control', 'clock', 'reset'])
const DIRS = new Set(['in', 'out', 'inout'])
const INSTANCE_KINDS = new Set(['reg', 'op', 'mux', 'module', 'blackbox', 'control'])
const TRUTH_VALUES = new Set(['0', '1', 'x'])

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string')
const inSet = (set: Set<string>, v: unknown): boolean => typeof v === 'string' && set.has(v)
const own = (o: Obj, key: string): boolean => Object.hasOwn(o, key)

export interface ValidationResult {
  ok: boolean // no error-severity diagnostics
  diagnostics: Diagnostic[]
}

export function validateComponentGraph(input: unknown): ValidationResult {
  const diagnostics: Diagnostic[] = []
  const error = (code: string, msg: string, at: Partial<Diagnostic> = {}) =>
    diagnostics.push({ severity: 'error', code, msg, ...at })
  const warn = (code: string, msg: string, at: Partial<Diagnostic> = {}) =>
    diagnostics.push({ severity: 'warn', code, msg, ...at })
  const result = (): ValidationResult => ({
    ok: !diagnostics.some(d => d.severity === 'error'),
    diagnostics,
  })

  if (!isObj(input)) {
    error('schema', 'graph must be a JSON object')
    return result()
  }
  const g = input

  if (typeof g.version !== 'string') error('schema', 'version must be a string')
  if (g.kind !== 'component') error('schema', `kind must be "component", got ${JSON.stringify(g.kind)}`)
  for (const key of ['title', 'created', 'modified']) {
    if (typeof g[key] !== 'string') error('schema', `${key} must be a string`)
  }
  if (!isObj(g.source)) {
    error('schema', 'source must be an object')
  } else {
    if (typeof g.source.root !== 'string') error('schema', 'source.root must be a string')
    if (typeof g.source.top !== 'string') error('schema', 'source.top must be a string')
    if (!isStrArr(g.source.files)) error('schema', 'source.files must be a string array')
  }

  if (!isObj(g.nodes)) error('schema', 'nodes must be an object keyed by node id')
  if (!isObj(g.signals)) error('schema', 'signals must be an object keyed by signal name')
  const nodes: Obj = isObj(g.nodes) ? g.nodes : {}
  const signals: Obj = isObj(g.signals) ? g.signals : {}
  const groups: Obj = isObj(g.groups) ? g.groups : {}

  // ── nodes ──
  for (const [id, n] of Object.entries(nodes)) {
    const at = { node: id }
    if (!isObj(n)) {
      error('schema', 'node must be an object', at)
      continue
    }
    if (n.kind === 'port') {
      if (!isPortNodeId(id)) error('node-id', 'port node id must be "@<port name>"', at)
      if (!inSet(DIRS, n.dir)) error('schema', 'port node dir must be in|out|inout', at)
      if (!inSet(SIGNAL_FLOWS, n.flow)) error('schema', 'port node flow must be data|control|clock|reset', at)
      continue
    }
    if (!inSet(INSTANCE_KINDS, n.kind)) {
      error('schema', `unknown node kind ${JSON.stringify(n.kind)}`, at)
      continue
    }
    if (!isInstancePath(id)) error('node-id', 'instance node id must be an instance path such as data_path.u_inc', at)
    if (!inSet(FLOWS, n.flow)) error('schema', 'flow must be data|control', at)
    if (!inSet(TIMES, n.time)) error('schema', 'time must be comb|seq', at)
    if (typeof n.module !== 'string') error('schema', 'module must be a string', at)
    const ports: Obj = isObj(n.ports) ? n.ports : {}
    if (!isObj(n.ports) || !Object.values(ports).every(d => inSet(DIRS, d))) {
      error('schema', 'ports must map each port name to in|out|inout', at)
    }
    if (n.consts !== undefined) {
      if (!isObj(n.consts)) error('schema', 'consts must be an object', at)
      else for (const p of Object.keys(n.consts)) {
        if (ports[p] !== 'in') error('endpoint', `constant on "${p}", which is not an input port`, at)
      }
    }
    if (n.group !== undefined && !(typeof n.group === 'string' && own(groups, n.group))) {
      error('group', `node refers to unknown group ${JSON.stringify(n.group)}`, at)
    }
    if (n.kind === 'control' && n.truthTable !== undefined) checkTruthTable(n.truthTable, ports, at)
  }

  function checkTruthTable(t: unknown, ports: Obj, at: Partial<Diagnostic>) {
    if (!isObj(t) || !isStrArr(t.inputs) || !isStrArr(t.outputs) || !Array.isArray(t.rows)) {
      error('truth-table', 'truthTable needs inputs, outputs and rows', at)
      return
    }
    const inputs = t.inputs
    const outputs = t.outputs
    for (const p of inputs) if (ports[p] !== 'in') error('truth-table', `truth table input "${p}" is not an input port`, at)
    for (const p of outputs) if (ports[p] !== 'out') error('truth-table', `truth table output "${p}" is not an output port`, at)
    const isRow = (values: unknown, width: number) =>
      Array.isArray(values) && values.length === width && values.every(v => inSet(TRUTH_VALUES, v))
    t.rows.forEach((r: unknown, i: number) => {
      if (!isObj(r) || !isRow(r.in, inputs.length) || !isRow(r.out, outputs.length)) {
        error('truth-table', `row ${i} must have ${inputs.length} inputs and ${outputs.length} outputs of 0|1|x`, at)
      }
    })
    if (t.default !== undefined && !(isObj(t.default) && isRow(t.default.out, outputs.length))) {
      error('truth-table', `default must have ${outputs.length} outputs of 0|1|x`, at)
    }
  }

  // ── signals: every endpoint resolves, one driver per net, one net per input ──
  const inputUse = new Map<string, string>()
  const outputUse = new Map<string, string>()
  const names = new Map<string, string>() // signal name or alias -> owning signal

  const connect = (signal: string, ref: unknown, role: 'driver' | 'sink') => {
    const at = { signal }
    if (typeof ref !== 'string') {
      error('schema', `${role} must be an endpoint string`, at)
      return
    }
    const { node, port } = parseEndpoint(ref)
    const n = own(nodes, node) ? nodes[node] : undefined
    if (!isObj(n)) {
      error('endpoint', `${role} "${ref}" refers to an unknown node`, at)
      return
    }
    let dir: unknown
    if (n.kind === 'port') {
      if (port !== null) {
        error('endpoint', `port node endpoints have no ":port" part, write "${node}"`, at)
        return
      }
      // Seen from inside the component, an input port drives and an output port sinks.
      dir = n.dir === 'in' ? 'out' : n.dir === 'out' ? 'in' : n.dir
    } else {
      if (port === null) {
        error('endpoint', `"${ref}" must name a port as "<node>:<port>"`, at)
        return
      }
      dir = isObj(n.ports) && own(n.ports, port) ? n.ports[port] : undefined
      if (dir === undefined) {
        error('endpoint', `node "${node}" has no port "${port}"`, at)
        return
      }
    }
    if (dir === 'inout') return
    const want = role === 'driver' ? 'out' : 'in'
    if (dir !== want) {
      error('endpoint', `${role} "${ref}" is an ${dir === 'in' ? 'input' : 'output'}`, at)
      return
    }
    const use = role === 'driver' ? outputUse : inputUse
    const other = use.get(ref)
    if (other !== undefined) {
      if (role === 'sink') error('multi-driven', `input "${ref}" is connected to both "${other}" and "${signal}"`, at)
      else error('endpoint', `output "${ref}" drives both "${other}" and "${signal}"; merge them with aliases`, at)
      return
    }
    use.set(ref, signal)
  }

  const claimName = (name: string, signal: string) => {
    const owner = names.get(name)
    if (owner !== undefined) error('schema', `name "${name}" is used by both "${owner}" and "${signal}"`, { signal })
    else names.set(name, signal)
  }

  for (const [name, s] of Object.entries(signals)) {
    const at = { signal: name }
    if (!isInstancePath(name)) error('schema', 'signal name must be an identifier path', at)
    claimName(name, name)
    if (!isObj(s)) {
      error('schema', 'signal must be an object', at)
      continue
    }
    if (!Number.isInteger(s.width) || (s.width as number) < 1) error('schema', 'width must be a positive integer', at)
    if (!inSet(SIGNAL_FLOWS, s.flow)) error('schema', 'flow must be data|control|clock|reset', at)
    if (s.driver === undefined) error('undriven', 'signal has no driver', at)
    else connect(name, s.driver, 'driver')
    if (!isStrArr(s.sinks)) error('schema', 'sinks must be a string array', at)
    else for (const ref of s.sinks) connect(name, ref, 'sink')
    if (s.aliases !== undefined) {
      if (!isStrArr(s.aliases)) error('schema', 'aliases must be a string array', at)
      else for (const alias of s.aliases) claimName(alias, name)
    }
  }

  for (const [id, n] of Object.entries(nodes)) {
    if (!isObj(n) || n.kind === 'port' || !isObj(n.ports)) continue
    const consts = isObj(n.consts) ? n.consts : {}
    for (const [port, dir] of Object.entries(n.ports)) {
      if (dir !== 'in') continue
      const ref = `${id}:${port}`
      const tied = own(consts, port)
      if (!inputUse.has(ref) && !tied) warn('undriven', `input "${ref}" is not connected`, { node: id })
      if (inputUse.has(ref) && tied) error('multi-driven', `input "${ref}" has both a signal and a constant`, { node: id })
    }
  }

  // ── groups, layout ──
  for (const [gid, grp] of Object.entries(groups)) {
    if (!isObj(grp) || typeof grp.label !== 'string' || !isStrArr(grp.members)) {
      error('schema', `group "${gid}" needs a label and a members array`)
      continue
    }
    for (const m of grp.members) {
      if (!own(nodes, m)) error('group', `group "${gid}" lists unknown node "${m}"`, { node: m })
    }
  }

  if (g.layout !== undefined) {
    if (!isObj(g.layout) || !isObj(g.layout.nodes)) {
      error('schema', 'layout.nodes must be an object')
    } else {
      for (const [id, p] of Object.entries(g.layout.nodes)) {
        if (!own(nodes, id)) warn('layout-stale', `layout has a position for unknown node "${id}"`, { node: id })
        else if (!isObj(p) || typeof p.x !== 'number' || typeof p.y !== 'number') {
          error('schema', 'layout position needs numeric x and y', { node: id })
        }
      }
      const collapsed = g.layout.collapsed
      if (collapsed !== undefined) {
        if (!isStrArr(collapsed)) error('schema', 'layout.collapsed must be a string array')
        else for (const c of collapsed) {
          if (!own(groups, c)) warn('layout-stale', `layout collapses unknown group "${c}"`)
        }
      }
    }
  }

  return result()
}
