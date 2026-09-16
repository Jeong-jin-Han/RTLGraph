import type { FsmGraph } from '@rtlgraph/ir'
import { layoutFsm, resetStub, type FsmEdge, type FsmLayout, type FsmStateBox } from '@rtlgraph/layout'
import type { Group, Item, Scene } from './scene.ts'
import { sceneToSvg } from './scene.ts'
import { renderScenePdf, type PdfResult } from './pdf.ts'
import { FONT_FAMILY, FONT_SIZE, PALETTE } from './palette.ts'

// A state diagram, drawn from the same Scene as the schematics so the editor,
// the SVG and the PDF all agree. Nothing here decides *what* the machine does —
// that is the file's; this only says where it goes on the page.

const STATE_FILL = '#eef2ff'
const STATE_STROKE = PALETTE.controlStroke
const EDGE = PALETTE.control

export interface FsmRenderOptions {
  layout?: FsmLayout
  // Which transition is selected in the editor, by its index in `transitions`.
  selected?: number
}

// One group per state and per transition: the editor hangs its clicks off them.
const stateGroup = (s: FsmStateBox): Group => {
  const items: Item[] = [
    { kind: 'rect', x: s.x, y: s.y, w: s.w, h: s.h, rx: 12, fill: STATE_FILL, stroke: STATE_STROKE, strokeWidth: s.reset ? 2 : 1.25 },
    { kind: 'text', x: s.x + s.w / 2, y: s.y + (s.encoding ? 18 : s.h / 2), text: s.label, anchor: 'middle', central: !s.encoding, bold: true, fill: PALETTE.ink },
  ]
  if (s.encoding) {
    items.push({ kind: 'text', x: s.x + s.w / 2, y: s.y + 33, text: s.encoding, anchor: 'middle', size: 10, fill: PALETTE.muted })
  }
  return { className: `fsm-state${s.reset ? ' reset' : ''}`, attribute: { name: 'data-node-id', value: s.id }, items }
}

const edgeGroup = (e: FsmEdge, selected: boolean): Group => ({
  className: `fsm-edge${selected ? ' selected' : ''}`,
  attribute: { name: 'data-signal', value: String(e.index) },
  items: [
    { kind: 'lines', segments: e.segments, stroke: selected ? PALETTE.reset : EDGE, strokeWidth: selected ? 2.5 : 1.5, fill: 'none' },
    { kind: 'polygon', points: e.arrow, fill: selected ? PALETTE.reset : EDGE },
    { kind: 'text', x: e.labelAt.x, y: e.labelAt.y, text: e.label, anchor: e.labelAnchor, size: 10, fill: PALETTE.muted },
  ],
})

export function buildFsmScene(graph: FsmGraph, options: FsmRenderOptions = {}): Scene {
  const layout = options.layout ?? layoutFsm(graph)
  const groups: Group[] = []

  const start = layout.states.find(s => s.reset)
  if (start) {
    const { segments, arrow } = resetStub(start)
    groups.push({
      className: 'fsm-reset',
      attribute: { name: 'data-signal', value: 'reset' },
      items: [
        { kind: 'lines', segments, stroke: PALETTE.reset, strokeWidth: 1.5, fill: 'none' },
        { kind: 'polygon', points: arrow, fill: PALETTE.reset },
      ],
    })
  }
  // Transitions first: a state box then covers the stub of any wire under it.
  for (const e of layout.edges) groups.push(edgeGroup(e, e.index === options.selected))
  for (const s of layout.states) groups.push(stateGroup(s))

  return {
    view: { x: 0, y: 0, w: layout.width, h: layout.height },
    background: PALETTE.background,
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    groups,
  }
}

export const renderFsmSvg = (graph: FsmGraph, options?: FsmRenderOptions): string => sceneToSvg(buildFsmScene(graph, options))
export const renderFsmPdf = (graph: FsmGraph, options?: FsmRenderOptions): PdfResult => renderScenePdf(buildFsmScene(graph, options))

// ── the transition table ──
// D02 builds a machine in a spreadsheet before writing any Verilog: current
// state and inputs on the left, next state and outputs on the right. The same
// table read back out of the file is what makes a drawing checkable, so it is
// part of the view rather than a separate export.

export interface FsmTableRow {
  index: number
  state: string
  encoding: string
  when: string
  guard: string
  next: string
  nextEncoding: string
  outputs: string
}

const outputsOf = (outputs: Record<string, string> | undefined) =>
  Object.entries(outputs ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')

export function fsmTable(graph: FsmGraph): FsmTableRow[] {
  return graph.transitions.map((t, index) => {
    const from = graph.states[t.from]
    const to = graph.states[t.to]
    // Moore outputs belong to the state you land in, Mealy ones to the move
    // itself; the table shows whichever the machine says it is.
    const outputs = graph.machine.style === 'moore' ? outputsOf(to?.outputs) : outputsOf(t.outputs)
    return {
      index,
      state: from?.label ?? t.from,
      encoding: from?.encoding ?? '',
      when: t.when,
      guard: t.guard ?? '',
      next: to?.label ?? t.to,
      nextEncoding: to?.encoding ?? '',
      outputs,
    }
  })
}
