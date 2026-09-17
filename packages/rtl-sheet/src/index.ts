import type { ComponentGraph, ControlNode, FsmGraph, RtlNode, TruthTable } from '@rtlgraph/ir'
import type { Sheet } from './xlsx.ts'

export * from './xlsx.ts'

// The tables behind a drawing, as a spreadsheet. D02 builds a machine in Excel
// before any Verilog is written and lists the control signals the same way, so
// this is the drawing read back into the form the design was made in — not a new
// source of truth. The JSON stays the original; this is an export.

const isControl = (node: RtlNode): node is ControlNode => node.kind === 'control'

// One sheet per machine: what each state means, then every move in it.
export function fsmSheets(graph: FsmGraph): Sheet[] {
  const label = (id: string) => graph.states[id]?.label ?? id
  const encoding = (id: string) => graph.states[id]?.encoding ?? ''
  const outputs = (values: Record<string, string> | undefined) =>
    Object.entries(values ?? {}).map(([name, value]) => `${name}=${value}`).join(', ')

  const declared = (graph.machine.outputs ?? []).map(o => o.name)
  const states: Sheet = {
    name: `${graph.machine.name} states`,
    rows: [
      ['State', 'Encoding', 'Meaning', ...declared],
      ...Object.entries(graph.states).map(([id, state]) => [
        label(id),
        state.encoding ?? '',
        state.meaning,
        ...declared.map(name => state.outputs?.[name] ?? ''),
      ]),
    ],
  }

  const moves: Sheet = {
    name: `${graph.machine.name} transitions`,
    rows: [
      ['State', 'Encoding', 'When', 'Condition', 'Next state', 'Next encoding', 'Outputs'],
      ...graph.transitions.map(t => [
        label(t.from),
        encoding(t.from),
        t.when,
        t.guard ?? '',
        label(t.to),
        encoding(t.to),
        outputs(graph.machine.style === 'moore' ? graph.states[t.to]?.outputs : t.outputs),
      ]),
    ],
  }

  const about: Sheet = {
    name: 'machine',
    rows: [
      ['Machine', graph.machine.name],
      ['Style', graph.machine.style],
      ['Resets to', label(graph.machine.reset)],
      ['Component', graph.title],
      [],
      ['Inputs', ...(graph.machine.inputs ?? []).map(i => i.name)],
      ...(graph.machine.inputs ?? []).map(i => ['', i.name, i.meaning ?? '']),
      ['Outputs', ...declared],
      ...(graph.machine.outputs ?? []).map(o => ['', o.name, o.meaning ?? '']),
    ],
  }
  return [about, states, moves]
}

// One sheet per control block: its truth table, with what every row means and
// what every signal does. The nets say the meanings; the block says the values.
export function controlSheets(graph: ComponentGraph, title = graph.title): Sheet[] {
  const blocks = Object.entries(graph.nodes).filter((entry): entry is [string, ControlNode] => isControl(entry[1]))
  const meaningOf = (name: string) => Object.values(graph.signals).find(s => s.driver.endsWith(`:${name}`))?.meaning ?? ''

  const sheets = blocks.flatMap(([id, node]) => {
    const table: TruthTable | undefined = node.truthTable
    if (!table) return []
    const head = [...table.inputs, '', ...table.outputs, 'What the row means']
    const rows = table.rows.map(row => [...row.in, '', ...row.out, row.note ?? ''])
    const fallback = table.default ? [[...table.inputs.map(() => 'else'), '', ...table.default.out, 'anything else']] : []
    return [{
      name: `${title} ${id}`,
      rows: [
        [`${title} · ${id}`, node.module],
        [],
        head,
        ...rows,
        ...fallback,
        [],
        ['Signal', 'What it means'],
        ...table.outputs.map(name => [name, meaningOf(name)]),
      ],
    }]
  })

  // A ledger of every control signal of this component, block or not: what drives
  // it, what reads it, and what it means. This is the sheet a report asks for.
  const control = Object.entries(graph.signals).filter(([, s]) => s.flow === 'control' || s.flow === 'reset')
  const ledger: Sheet = {
    name: `${title} signals`,
    rows: [
      ['Signal', 'Width', 'Flow', 'Driven by', 'Read by', 'What it means'],
      ...control.map(([name, s]) => [name, s.width, s.flow, s.driver, s.sinks.join(', '), s.meaning ?? '']),
    ],
  }
  return [ledger, ...sheets]
}
