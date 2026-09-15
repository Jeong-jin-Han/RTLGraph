import type { ComponentGraph, Diagnostic } from './types.ts'
import { parseEndpoint } from './endpoint.ts'

// What is still missing from a schematic, in the way a type checker states what
// is left to prove: one line per obligation, each naming the pin that needs a
// connection and what would satisfy it. The editor shows these while the reader
// is changing the picture — cutting a wire leaves a hole, and the hole is the
// point: it says what the RTL would have to do.

export interface Goal {
  id: string // stable: the endpoint or net the obligation is about
  what: string // the obligation, in one line
  why?: string // where it comes from, when that is not obvious
  node?: string
  signal?: string
}

const endpointsOf = (graph: ComponentGraph, cut: ReadonlySet<string>) => {
  const driven = new Set<string>() // input endpoints a net reaches
  const drives = new Set<string>() // output endpoints a net leaves
  for (const [name, s] of Object.entries(graph.signals)) {
    if (cut.has(name)) continue
    drives.add(s.driver)
    for (const ref of s.sinks) driven.add(ref)
  }
  return { driven, drives }
}

// `cut`: nets the reader removed by hand (layout.cut). They stay in the graph,
// so the goals say what their removal left undone.
export function connectionGoals(graph: ComponentGraph, cut: readonly string[] = []): Goal[] {
  const removed = new Set(cut.filter(name => Object.hasOwn(graph.signals, name)))
  const { driven, drives } = endpointsOf(graph, removed)
  const goals: Goal[] = []

  for (const name of removed) {
    const s = graph.signals[name]
    goals.push({
      id: `cut:${name}`,
      what: `connect ${s.driver} to ${s.sinks.join(', ') || 'something'} again, or take the net out of the RTL`,
      why: `you cut ${name}`,
      signal: name,
    })
  }

  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.kind === 'port') {
      // An output port of this component has to be driven by something inside it.
      if (node.dir === 'out' && !driven.has(id)) {
        goals.push({ id: `port:${id}`, what: `drive the output port ${id.replace(/^@/, '')}`, node: id })
      }
      continue
    }
    const consts = 'consts' in node ? (node.consts ?? {}) : {}
    for (const [pin, dir] of Object.entries(node.ports)) {
      const ref = `${id}:${pin}`
      if (dir === 'in' && !driven.has(ref) && !Object.hasOwn(consts, pin)) {
        goals.push({ id: `in:${ref}`, what: `connect something to ${ref}`, node: id })
      }
      if (dir === 'out' && !drives.has(ref)) {
        goals.push({ id: `out:${ref}`, what: `${ref} drives nothing; use it or leave it unconnected on purpose`, node: id })
      }
    }
  }
  return goals
}

// The same obligations as diagnostics, for the problems list.
export const goalsAsDiagnostics = (goals: readonly Goal[]): Diagnostic[] =>
  goals.map(goal => ({
    severity: 'warn',
    code: goal.id.startsWith('cut:') ? 'cut' : 'undriven',
    msg: goal.why ? `${goal.what} (${goal.why})` : goal.what,
    ...(goal.node ? { node: goal.node } : {}),
    ...(goal.signal ? { signal: goal.signal } : {}),
  }))

// Endpoints the reader may reconnect to satisfy a goal: the free pins that face
// the right way. Offered by the editor when a goal is selected.
export function candidatesFor(graph: ComponentGraph, goal: Goal, cut: readonly string[] = []): string[] {
  const removed = new Set(cut)
  const { driven, drives } = endpointsOf(graph, removed)
  const wantDriver = goal.id.startsWith('in:') || goal.id.startsWith('port:')
  const out: string[] = []
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.kind === 'port') {
      const isSource = node.dir === 'in' // seen from inside, an input port drives
      if (wantDriver === isSource && !(wantDriver ? drives.has(id) : driven.has(id))) out.push(id)
      continue
    }
    for (const [pin, dir] of Object.entries(node.ports)) {
      const ref = `${id}:${pin}`
      if (wantDriver ? dir === 'out' && !drives.has(ref) : dir === 'in' && !driven.has(ref)) out.push(ref)
    }
  }
  return out.filter(ref => parseEndpoint(ref).node !== goal.node)
}
