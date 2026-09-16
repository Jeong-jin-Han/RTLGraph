import type { ComponentGraph, Diagnostic } from './types.ts'
import { parseEndpoint } from './endpoint.ts'

// What is still missing from a schematic, in the way a type checker states what
// is left to prove. Each obligation leads with what to do — "Drive CNT_FF:D" —
// and then says which connection is missing, from which endpoint to which, so a
// reader knows the answer before reading the reason. The editor shows these while
// the reader is changing the picture: cutting a wire leaves a hole, and the hole
// is the point, because it says what the RTL would have to do.

export interface Goal {
  id: string // stable: the endpoint or net the obligation is about
  what: string // the obligation, the action first
  why?: string // the reason behind it
  from?: string // the endpoint the connection should leave, when it is known
  to?: string // and the one it should reach
  node?: string
  signal?: string
}

// "data_path.u_inc:y → CNT_FF:D", with the open end left open.
export const goalLink = (goal: Goal): string | undefined =>
  goal.from === undefined && goal.to === undefined ? undefined : `${goal.from ?? '?'} → ${goal.to ?? '?'}`

export type DrawnLink = { from: string; to: string }

const endpointsOf = (graph: ComponentGraph, cut: ReadonlySet<string>, links: readonly DrawnLink[]) => {
  const driven = new Set<string>() // input endpoints a net reaches
  const drives = new Set<string>() // output endpoints a net leaves
  for (const [name, s] of Object.entries(graph.signals)) {
    if (cut.has(name)) continue
    drives.add(s.driver)
    for (const ref of s.sinks) driven.add(ref)
  }
  // A link the reader drew fills the hole in the picture, though not in the code.
  for (const link of links) {
    drives.add(link.from)
    driven.add(link.to)
  }
  return { driven, drives }
}

// `cut`: nets the reader removed by hand (layout.cut). They stay in the graph,
// so the goals say what their removal left undone.
export function connectionGoals(graph: ComponentGraph, cut: readonly string[] = [], links: readonly DrawnLink[] = []): Goal[] {
  const removed = new Set(cut.filter(name => Object.hasOwn(graph.signals, name)))
  const { driven, drives } = endpointsOf(graph, removed, links)
  const goals: Goal[] = []

  // A link the reader drew is a hole in the RTL instead: the picture says what
  // the code would have to carry.
  for (const link of links) {
    goals.push({
      id: `link:${link.from}->${link.to}`,
      what: 'Add this net to the RTL',
      why: 'you drew it here, and no net of the code carries it; the schematic is a sketch until it does',
      from: link.from,
      to: link.to,
      node: parseEndpoint(link.to).node,
    })
  }

  for (const name of removed) {
    const s = graph.signals[name]
    goals.push({
      id: `cut:${name}`,
      what: `Connect ${name} again`,
      why: `you cut it; the RTL still carries it, so either draw it again or take it out of the code`,
      from: s.driver,
      to: s.sinks.join(', ') || undefined,
      signal: name,
    })
  }

  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.kind === 'port') {
      // An output port of this component has to be driven by something inside it.
      if (node.dir === 'out' && !driven.has(id)) {
        goals.push({
          id: `port:${id}`,
          what: `Drive the output port ${id.replace(/^@/, '')}`,
          why: 'an output port carries a value out of this component, so something inside has to reach it',
          to: id,
          node: id,
        })
      }
      continue
    }
    const consts = 'consts' in node ? (node.consts ?? {}) : {}
    for (const [pin, dir] of Object.entries(node.ports)) {
      const ref = `${id}:${pin}`
      if (dir === 'in' && !driven.has(ref) && !Object.hasOwn(consts, pin)) {
        goals.push({
          id: `in:${ref}`,
          what: `Drive ${ref}`,
          why: 'no net reaches this input and it is not tied off, so it reads as nothing',
          to: ref,
          node: id,
        })
      }
      if (dir === 'out' && !drives.has(ref)) {
        goals.push({
          id: `out:${ref}`,
          what: `Use ${ref}, or leave it open on purpose`,
          why: 'this output drives nothing',
          from: ref,
          node: id,
        })
      }
    }
  }
  return goals
}

// The same obligations as diagnostics, for the problems list.
export const goalsAsDiagnostics = (goals: readonly Goal[]): Diagnostic[] =>
  goals.map(goal => ({
    severity: 'warn',
    code: goal.id.startsWith('cut:') ? 'cut' : goal.id.startsWith('link:') ? 'sketch-link' : 'undriven',
    msg: [goal.what, goalLink(goal), goal.why].filter(Boolean).join(' — '),
    ...(goal.node ? { node: goal.node } : {}),
    ...(goal.signal ? { signal: goal.signal } : {}),
  }))

// Endpoints the reader may reconnect to satisfy a goal: the free pins that face
// the right way. Offered by the editor when a goal is selected.
export function candidatesFor(graph: ComponentGraph, goal: Goal, cut: readonly string[] = [], links: readonly DrawnLink[] = []): string[] {
  const removed = new Set(cut)
  const { driven, drives } = endpointsOf(graph, removed, links)
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
