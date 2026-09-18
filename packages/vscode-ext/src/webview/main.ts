import {
  candidatesFor, canConnect, connectedEndpoints, connectionGoals, facing, FILTER_PRESETS, goalLink, graphFileKind,
  hierarchyEntries, loadHierarchy, parseEndpoint,
  validateFsmGraph,
  type Diagnostic, type FilterPreset, type FsmGraph, type Goal, type HierarchyEntry, type Layout, type ViewFilter,
} from '@rtlgraph/ir'
import { displayName, layoutHierarchy, linkEnds, linkKey, PORT_PIN, type NestedLayout } from '@rtlgraph/layout'
import { buildFsmScene, buildHierarchyScene, fsmTable, sceneToSvg } from '@rtlgraph/render'
import type { HostToWebview, ToolbarCommand, WebviewToHost } from '../protocol.ts'
import {
  FLOW_LABELS, FLOWS, GROUP_LABELS, PRESET_LABELS, SEQ_KINDS, SEQ_LABELS,
  applyFold, componentInstances, defaultUnfolded, fitViewport, isGroupOn, isInstanceShown, normalizeFilter,
  normalizeUnfolded, presetOf, screenSize, toggleFlow, toggleGroup, toggleSeq, zoomAt,
  type FoldAction, type FoldScope, type ViewGroup, type Viewport,
} from './state.ts'
import {
  belongsToThisFile, branchAt, branchesOf, cleared, emptyLayout, isArranged, isCut, midpoint,
  linkDecision, movedSegment, movedTo, removedVertex, resizedTo, segmentAt, shapedTo, turnedAt, withCut,
  withLink, withoutCut, withoutLink, type Point,
} from './edit.ts'

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHost): void
  getState(): unknown
  setState(state: unknown): void
}

interface SavedState {
  filter?: ViewFilter
  unfolded?: string[]
  viewport?: Viewport
}

const vscode = acquireVsCodeApi()
const saved = (vscode.getState() as SavedState | undefined) ?? {}

let root: HierarchyEntry | undefined
let layout: NestedLayout | undefined
let instances: string[] = []
let filter: ViewFilter = normalizeFilter(saved.filter) ?? FILTER_PRESETS.all
let filterChosenHere = normalizeFilter(saved.filter) !== undefined
let unfolded: string[] = Array.isArray(saved.unfolded) ? saved.unfolded : []
let foldChosenHere = Array.isArray(saved.unfolded)
let selected: string | undefined // a component box
let selectedWire: string | undefined // a net, while arranging
let viewport: Viewport | undefined = saved.viewport

// Arranging by hand. `arrangement` is the file's own `layout`, edited here and
// written straight back; nothing else in the file is ever touched.
let editing = false
let arrangement: Layout = emptyLayout()
let goals: Goal[] = []
let activeGoal: string | undefined
let selectedVertex: number | undefined // a corner of the selected branch
// A state machine file is drawn instead of a schematic; the two never mix.
let fsm: FsmGraph | undefined
let selectedTransition: number | undefined
// The page the scene was drawn on. It is the layout's box, grown to hold
// anything the reader dragged outside it, so its origin can be negative.
let view = { x: 0, y: 0, w: 0, h: 0 }
let selectedBranch = 0 // which way through a net that reaches several sinks
// Drawing a link: the pin it started from, where the hand is now, and the pin it
// would land on.
let drawing: { from: string; at: Point; to?: string } | undefined

const isUnfolded = (instance: string) => unfolded.includes(instance)
// The graph as it is drawn: the file plus whatever the reader has arranged.
const arranged = (): HierarchyEntry => ({ ...root!, graph: { ...root!.graph, layout: arrangement } })

function persist() {
  vscode.setState({ filter: filterChosenHere ? filter : undefined, unfolded: foldChosenHere ? unfolded : undefined, viewport } satisfies SavedState)
}

// ── DOM ──
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  Object.assign(node, props)
  node.append(...children)
  return node
}

// The filter is a tree: the group button switches its half of the schematic on,
// and only then can the kinds under it be picked apart.
const groupButton = (group: ViewGroup, title: string) => {
  const button = el('button', { type: 'button', textContent: GROUP_LABELS[group], className: 'parent', title })
  button.addEventListener('click', () => setFilter(toggleGroup(filter, group)))
  return button
}
const combButton = groupButton('comb', 'Combinational logic: the data path and the control path')
const flowButtons = FLOWS.map(flow => {
  const button = el('button', { type: 'button', textContent: FLOW_LABELS[flow], className: 'child' })
  button.addEventListener('click', () => setFilter(toggleFlow(filter, flow)))
  return button
})
const seqButton = groupButton('seq', 'Registers: the ones holding data and the ones holding a state')
const seqButtons = SEQ_KINDS.map(kind => {
  const button = el('button', { type: 'button', textContent: SEQ_LABELS[kind], className: 'child' })
  button.addEventListener('click', () => setFilter(toggleSeq(filter, kind)))
  return button
})
const presetSelect = el('select', { title: 'View preset' })
for (const [key, label] of Object.entries(PRESET_LABELS)) presetSelect.append(el('option', { value: key, textContent: label }))
presetSelect.append(el('option', { value: '', textContent: 'Custom', disabled: true }))
presetSelect.addEventListener('change', () => setFilter(FILTER_PRESETS[presetSelect.value as FilterPreset]))

const combGroup = el('span', { className: 'group filter' }, combButton, ...flowButtons)
const seqGroup = el('span', { className: 'group filter' }, seqButton, ...seqButtons)
const presetGroup = el('span', { className: 'group' }, el('span', { className: 'label', textContent: 'preset' }), presetSelect)

const commandButton = (text: string, command: ToolbarCommand) => {
  const button = el('button', { type: 'button', textContent: text })
  button.addEventListener('click', () => vscode.postMessage({ type: 'command', command }))
  return button
}
const foldButton = commandButton('Fold', 'rtlgraph.fold')
const unfoldButton = commandButton('Unfold', 'rtlgraph.unfold')
const selectionLabel = el('span', { className: 'selection' })
const componentTools = el('span', { className: 'group' },
  el('span', { className: 'label', textContent: 'components' }), selectionLabel, foldButton, unfoldButton)

const exportButton = el('button', { type: 'button', textContent: 'Export…', title: 'Export the current view as SVG, PNG or PDF' })
exportButton.addEventListener('click', () => vscode.postMessage({ type: 'export' }))
const fitButton = el('button', { type: 'button', textContent: 'Fit', title: 'Fit the schematic to the window' })
fitButton.addEventListener('click', fit)
// Opening a component leaves you inside its own file; this walks back out.
const rootButton = commandButton('Root', 'rtlgraph.openRoot')
// Between a component and its machine, both ways.
const fsmButton = commandButton('FSM', 'rtlgraph.openFsm')
fsmButton.title = 'Open the state machine of this component'
fsmButton.hidden = true
const schematicButton = commandButton('Schematic', 'rtlgraph.openSchematic')
schematicButton.title = 'Back to the schematic this machine belongs to'
schematicButton.hidden = true
rootButton.title = 'Open the root file this schematic belongs to'
const editButton = el('button', { type: 'button', textContent: 'Edit', title: 'Arrange this schematic by hand; the file records it under "layout"' })
editButton.addEventListener('click', () => setEditing(!editing))
const resetButton = el('button', { type: 'button', textContent: 'Reset', title: 'Undo every hand arrangement in this file' })
resetButton.addEventListener('click', () => {
  arrangement = cleared(arrangement)
  saveArrangement()
})

const toolbar = el('div', { id: 'toolbar' },
  fitButton, rootButton, schematicButton, fsmButton, editButton, resetButton,
  combGroup, seqGroup, presetGroup,
  componentTools,
  el('span', { className: 'spacer' }), exportButton,
)
const stage = el('div', { id: 'stage' })
const canvas = el('div', { id: 'canvas' }, stage)
const goalsPanel = el('aside', { id: 'goals', hidden: true })
const tablePanel = el('aside', { id: 'table', hidden: true })
const middle = el('div', { id: 'middle' }, canvas, goalsPanel, tablePanel)
const problems = el('details', { id: 'problems', hidden: true })
// Right-click menu: where to go from what was clicked. A box knows the line of
// code it came from, and a component box knows its own schematic as well, so the
// question "which one?" is answered here instead of by a toolbar button.
const menu = el('div', { id: 'menu', hidden: true })
canvas.append(menu)

function showMenu(at: { x: number; y: number }, items: { label: string; run: () => void }[]) {
  if (items.length === 0) return closeMenu()
  menu.replaceChildren(...items.map(item => {
    const button = el('button', { type: 'button', textContent: item.label })
    button.addEventListener('click', () => {
      closeMenu()
      item.run()
    })
    return button
  }))
  menu.style.left = `${at.x}px`
  menu.style.top = `${at.y}px`
  menu.hidden = false
}

const closeMenu = () => { menu.hidden = true }

// One line saying what just happened, or what stopped it happening.
const noticeBar = el('div', { id: 'notice', hidden: true })
canvas.append(noticeBar)
document.body.append(toolbar, middle, problems)

let noticeTimer: ReturnType<typeof setTimeout> | undefined
function notice(text: string) {
  noticeBar.textContent = text
  noticeBar.hidden = false
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { noticeBar.hidden = true }, 4000)
}

// ── rendering ──
function updateComponentTools() {
  rootButton.hidden = root === undefined || root.graph.kind === 'system' // already there
  componentTools.hidden = instances.length === 0
  selectionLabel.textContent = selected ?? selectedWire ?? 'none selected'
  // Fold and unfold are about components; any other box is selected for what it
  // is — its code, its place — so with one of those they act on the whole tree.
  const box = selected !== undefined && instances.includes(selected) ? selected : undefined
  foldButton.title = box ? `Fold ${box}: only it, or it and everything inside` : 'Fold every component'
  unfoldButton.title = box ? `Unfold ${box}: only it, or it and everything inside` : 'Unfold every component'
  editButton.setAttribute('aria-pressed', String(editing))
  resetButton.hidden = !editing || !isArranged(arrangement)
  // Only worth offering when something in this file names a machine.
  fsmButton.hidden = root === undefined || !Object.values(root.graph.nodes).some(n => 'fsm' in n && n.fsm !== undefined)
}

function report() {
  vscode.postMessage({
    type: 'rendered',
    state: {
      filter,
      nodes: stage.querySelectorAll('[data-node-id]').length,
      signals: stage.querySelectorAll('[data-signal]').length,
      dim: stage.querySelectorAll('.dim').length,
      unfolded,
      editing,
      goals: goals.length,
      ...(fsm ? { fsm: { states: Object.keys(fsm.states).length, transitions: fsm.transitions.length } } : {}),
      ...(selected !== undefined ? { selected } : {}),
    },
  })
}

function markSelection() {
  stage.querySelectorAll('g.selected').forEach(g => g.classList.remove('selected'))
  stage.querySelectorAll('g.node, g.component').forEach(g => {
    if (g.getAttribute('data-node-id') === selected) g.classList.add('selected')
  })
  // What the reader cannot arrange from this file, while arranging.
  stage.querySelectorAll('g.node').forEach(g => {
    const id = g.getAttribute('data-node-id')
    g.classList.toggle('foreign', editing && id !== null && !belongsToThisFile(id))
  })
}

// The ways through the selected net: what the reader drew if they drew it, else
// one path from the driver pin to each sink pin. Selection is one of these, not
// the whole net, so a fan-out is shaped one branch at a time.
function pinOf(ref: string): Point | undefined {
  const { node, port } = parseEndpoint(ref)
  return layout?.nodes[node]?.pins[port ?? PORT_PIN]
}

function branchesOfSelected(): Point[][] | undefined {
  if (!editing || !layout || !root || selectedWire === undefined || !belongsToThisFile(selectedWire)) return undefined
  const drawn = arrangement.wires?.[selectedWire]
  if (drawn?.paths?.length) return drawn.paths
  if (drawn?.points?.length) return [drawn.points]
  // A link the reader drew is shaped the same way a net is; its two ends are in
  // its name instead of in `signals`.
  const ends = linkEnds(selectedWire)
  const wire = ends ? layout.links[selectedWire] : layout.wires[selectedWire]
  const signal = ends ? undefined : root.graph.signals[selectedWire]
  if (!wire || (!ends && !signal)) return undefined
  const from = pinOf(ends ? ends.from : signal!.driver)
  const to = (ends ? [ends.to] : signal!.sinks).map(pinOf).filter((p): p is Point => p !== undefined)
  if (!from || to.length === 0) return undefined
  const found = branchesOf(wire.segments, from, to)
  return found.length > 0 ? found : undefined
}

const shapeOfSelected = (): Point[] | undefined => branchesOfSelected()?.[selectedBranch]

// Grips live in their own overlay, not in the scene: the scene is what gets
// exported, and these are only for the hand holding the mouse.
//
// They are sized in screen pixels, not in the drawing: a grip is something to
// aim at, so it must stay the same size to the hand however far the schematic
// is zoomed (NodeGraph sizes its arrow heads that way). The stage is scaled by
// CSS, so the drawn size is divided by the zoom to come back to it.
const GRIP_R = 3.5 // screen px
const GRIP_SIDE = 7
const TURN_REACH = 14 // how near a corner a right-click has to land to turn it
const PIN_DOT = 3.5 // the mark on every pin a link can be drawn from

function drawHandles() {
  // Drawing again replaces what was there, and nothing selected leaves nothing
  // behind — a stale overlay would keep showing a selection that is gone.
  stage.querySelectorAll('svg.handles').forEach(old => old.remove())
  const points = shapeOfSelected()
  if (!layout || (!editing && !points)) return
  const r = screenSize(GRIP_R, viewport?.zoom)
  const side = screenSize(GRIP_SIDE, viewport?.zoom)
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('class', 'handles')
  svg.setAttribute('width', String(view.w))
  svg.setAttribute('height', String(view.h))
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`)

  // The branch under the hand, marked here rather than by recolouring the net —
  // a net that fans out would otherwise light up all the way to every sink.
  // Every pin this file draws is something to start a link from.
  if (editing) {
    const dot = screenSize(PIN_DOT, viewport?.zoom)
    for (const [id, box] of Object.entries(layout.nodes)) {
      if (!belongsToThisFile(id)) continue
      const isPort = root?.graph.nodes[id]?.kind === 'port'
      for (const [pin, at] of Object.entries(box.pins)) {
        const ref = isPort || pin === PORT_PIN ? id : `${id}:${pin}`
        const state = drawing === undefined
          ? ''
          : drawing.to === ref ? ' target' : canLink(drawing.from, ref) || ref === drawing.from ? '' : ' off'
        const mark = document.createElementNS(ns, 'circle')
        mark.setAttribute('class', `pin${state}`)
        mark.setAttribute('cx', String(at.x))
        mark.setAttribute('cy', String(at.y))
        mark.setAttribute('r', String(state === ' target' ? dot * 1.8 : dot))
        mark.dataset.ref = ref
        // Which pin this is, and which way it faces: the dots look alike, and a
        // reader cannot tell an input on the right from an output.
        const title = document.createElementNS(ns, 'title')
        const way = facing(root!.graph, ref)
        title.textContent = `${ref}${way ? ` — ${way === 'source' ? 'drives' : 'reads'}` : ''}`
        mark.append(title)
        svg.append(mark)
      }
    }
  }
  if (drawing) {
    const line = document.createElementNS(ns, 'polyline')
    // The band snaps to the pin it would land on, so the hand can let go early.
    const landing = drawing.to !== undefined ? pinOf(drawing.to) : undefined
    line.setAttribute('class', `drawing${landing ? ' landing' : ''}`)
    const from = pinOf(drawing.from)
    const to = landing ?? drawing.at
    if (from) line.setAttribute('points', `${from.x},${from.y} ${to.x},${to.y}`)
    svg.append(line)
  }
  if (!points) {
    stage.append(svg)
    return
  }

  const branch = document.createElementNS(ns, 'polyline')
  branch.setAttribute('class', 'branch')
  branch.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '))
  svg.append(branch)

  points.slice(0, -1).forEach((a, i) => {
    const at = midpoint(a, points[i + 1])
    const grip = document.createElementNS(ns, 'circle')
    grip.setAttribute('class', `handle segment ${a.x === points[i + 1].x ? 'vertical' : 'horizontal'}`)
    grip.setAttribute('cx', String(at.x))
    grip.setAttribute('cy', String(at.y))
    grip.setAttribute('r', String(r))
    grip.dataset.index = String(i)
    svg.append(grip)
  })
  points.forEach((p, i) => {
    if (i === 0 || i === points.length - 1) return // the pins
    const grip = document.createElementNS(ns, 'rect')
    grip.setAttribute('class', `handle vertex${i === selectedVertex ? ' active' : ''}`)
    grip.setAttribute('x', String(p.x - side / 2))
    grip.setAttribute('y', String(p.y - side / 2))
    grip.setAttribute('width', String(side))
    grip.setAttribute('height', String(side))
    grip.dataset.index = String(i)
    svg.append(grip)
  })
  stage.append(svg)
}

function render() {
  if (fsm) return renderFsm()
  // A kind is only reachable while its group is on, so it greys out with it.
  combButton.setAttribute('aria-pressed', String(isGroupOn(filter, 'comb')))
  seqButton.setAttribute('aria-pressed', String(isGroupOn(filter, 'seq')))
  flowButtons.forEach((b, i) => {
    b.setAttribute('aria-pressed', String(filter.comb.includes(FLOWS[i])))
    b.disabled = !isGroupOn(filter, 'comb')
  })
  seqButtons.forEach((b, i) => {
    b.setAttribute('aria-pressed', String(filter.seq.includes(SEQ_KINDS[i])))
    b.disabled = !isGroupOn(filter, 'seq')
  })
  presetSelect.value = presetOf(filter) ?? ''
  updateComponentTools()
  if (!root || !layout) {
    stage.replaceChildren()
    return
  }
  // Full layout, no cropping: switching the filter must not move anything.
  // controls: the fold markers are for clicking here; exports leave them out.
  const scene = buildHierarchyScene(arranged(), { filter, layout, crop: false, isUnfolded, controls: true, editing })
  view = scene.view
  stage.innerHTML = sceneToSvg(scene)
  drawHandles()
  markSelection()
  showGoals()
  report()
}

const relayout = () => {
  if (root) layout = layoutHierarchy(arranged(), isUnfolded)
}

// ── state machines ──
// A *.rtlgraph-fsm.json file has no schematic in it, so the view turns into the
// diagram and the table beside it. The table is the point: D02 builds a machine
// in a spreadsheet first, and a drawing you cannot read row by row is not
// checkable against the code.

function renderFsm() {
  if (!fsm) return
  // Nothing on the filter side means anything here: a machine has no data path
  // and nothing to fold.
  combGroup.hidden = seqGroup.hidden = presetGroup.hidden = componentTools.hidden = true
  editButton.hidden = resetButton.hidden = true
  schematicButton.hidden = false
  fsmButton.hidden = true
  const diagram = buildFsmScene(fsm, { selected: selectedTransition })
  view = diagram.view
  stage.innerHTML = sceneToSvg(diagram)
  showFsmTable()
  report()
}

function showFsmTable() {
  if (!fsm) return
  const rows = fsmTable(fsm)
  const cell = (text: string, className?: string) => el('td', { textContent: text, ...(className ? { className } : {}) })
  const table = el('table', {},
    el('thead', {}, el('tr', {}, ...['State', 'When', 'Next', 'Outputs'].map(h => el('th', { textContent: h })))),
    el('tbody', {}, ...rows.map(r => {
      const tr = el('tr', { className: r.index === selectedTransition ? 'selected' : '' },
        cell(r.encoding ? `${r.state} ${r.encoding}` : r.state, 'mono'),
        cell(r.guard || r.when, r.guard ? 'mono' : undefined),
        cell(r.nextEncoding ? `${r.next} ${r.nextEncoding}` : r.next, 'mono'),
        cell(r.outputs, 'mono'))
      tr.title = r.when
      tr.addEventListener('click', () => selectTransition(r.index))
      return tr
    })),
  )
  const states = el('dl', {}, ...Object.entries(fsm.states).flatMap(([id, s]) => [
    el('dt', { textContent: s.label ?? id }),
    el('dd', { textContent: s.meaning }),
  ]))
  tablePanel.replaceChildren(
    el('h2', { textContent: fsm.machine.name }),
    el('p', { className: 'muted', textContent: `${fsm.machine.style} · resets to ${fsm.machine.reset}` }),
    states,
    table,
  )
  tablePanel.hidden = false
}

function selectTransition(index: number | undefined) {
  selectedTransition = selectedTransition === index ? undefined : index
  render()
}

function loadFsm(text: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    showDiagnostics([{ severity: 'error', code: 'json', msg: (err as Error).message }], false)
    return
  }
  const result = validateFsmGraph(parsed)
  showDiagnostics(result.diagnostics, result.ok)
  if (!result.ok) {
    fsm = undefined
    stage.replaceChildren()
    return
  }
  const first = fsm === undefined
  fsm = parsed as FsmGraph
  if (selectedTransition !== undefined && selectedTransition >= fsm.transitions.length) selectedTransition = undefined
  render()
  if (first && !viewport) fit()
  else applyViewport()
}

function saveArrangement() {
  vscode.postMessage({ type: 'setLayout', layout: arrangement })
  relayout()
  render()
}

// ── what the sketch still owes ──
function showGoals() {
  goals = root && editing ? connectionGoals(root.graph, arrangement.cut ?? [], arrangement.links ?? []) : []
  goalsPanel.hidden = !editing
  if (!editing || !root) return
  if (goals.length === 0) {
    goalsPanel.replaceChildren(
      el('h2', { textContent: 'Nothing missing' }),
      el('p', { textContent: 'Every pin of this file is connected or tied off.' }),
      el('ul', { className: 'hints' },
        el('li', { textContent: 'Drag a box or a component frame to move it' }),
        el('li', { textContent: 'Drag a frame corner to resize it' }),
        el('li', { textContent: 'Drag from one pin dot to another to draw a link — that is also how a cut one comes back' }),
        el('li', { textContent: 'Drag a straight run of a wire sideways; right-click it to turn its corner the other way' }),
        el('li', { textContent: 'Click a wire, then Delete to cut it (or a corner grip to take that corner out)' }),
      ),
    )
    return
  }
  const list = el('ol')
  for (const goal of goals) {
    // The action first, then which connection is missing, then the reason.
    const item = el('li', {}, el('span', { className: 'what', textContent: goal.what }))
    const link = goalLink(goal)
    if (link) item.append(el('div', { className: 'link', textContent: link }))
    if (goal.why) item.append(el('span', { className: 'why', textContent: goal.why }))
    if (goal.id === activeGoal) {
      item.classList.add('active')
      const options = candidatesFor(root.graph, goal, arrangement.cut ?? [], arrangement.links ?? [])
      const open = goal.from === undefined ? 'drive it from' : 'take it to'
      item.append(el('div', {
        className: 'candidates',
        textContent: options.length > 0 ? `${open}: ${options.slice(0, 8).join(', ')}` : 'nothing free to connect it to',
      }))
    }
    item.addEventListener('click', () => {
      activeGoal = goal.id === activeGoal ? undefined : goal.id
      if (goal.node) select(goal.node)
      showGoals()
    })
    list.append(item)
  }
  goalsPanel.replaceChildren(
    el('h2', { textContent: `${goals.length} connection${goals.length === 1 ? '' : 's'} to settle` }),
    el('p', { textContent: 'Each one says what to do, then which connection is missing. The file still describes the RTL — these are what the sketch owes it.' }),
    list,
  )
}

function setEditing(next: boolean) {
  editing = next
  document.body.classList.toggle('editing', editing)
  if (!editing) {
    selectedWire = undefined
    activeGoal = undefined
  }
  render()
}

// PNG export: draw the cropped view (the same scene the SVG/PDF exports use) onto
// a canvas at `scale` and return it base64-encoded.
async function rasterize(scale: number): Promise<string> {
  if (!root || !layout) throw new Error('nothing is drawn yet')
  // The PNG is an export like the others: same scene, wrapper root left out.
  const scene = buildHierarchyScene(arranged(), { filter, isUnfolded, unwrap: true, frames: false })
  const url = URL.createObjectURL(new Blob([sceneToSvg(scene)], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('the SVG could not be loaded as an image'))
      image.src = url
    })
    const surface = document.createElement('canvas')
    surface.width = Math.round(scene.view.w * scale)
    surface.height = Math.round(scene.view.h * scale)
    const context = surface.getContext('2d')
    if (!context) throw new Error('no 2D canvas available')
    context.drawImage(image, 0, 0, surface.width, surface.height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      surface.toBlob(b => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(binary)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function applyViewport() {
  const v = viewport ?? { x: 0, y: 0, zoom: 1 }
  stage.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`
  drawHandles() // the grips are sized in screen pixels, so zooming resizes them
}

function fit() {
  if (view.w <= 0) return
  const box = canvas.getBoundingClientRect()
  if (box.width <= 0 || box.height <= 0) return // hidden: there is nothing to fit to
  viewport = fitViewport(view.w, view.h, box.width, box.height)
  applyViewport()
  persist()
}

// The panel changes shape whenever a tab opens or closes beside it — the code
// jump opens one, closing it gives the room back — so the drawing is fitted again
// every time the room it has changes. Not while a drag is under way (the hand is
// mid-gesture), and not when the panel is merely hidden, which arrives as a size
// of zero and would otherwise throw the view away.
let dragging = false
let panel = { w: 0, h: 0 }
new ResizeObserver(() => {
  const box = canvas.getBoundingClientRect()
  if (box.width <= 0 || box.height <= 0) return
  const changed = Math.abs(box.width - panel.w) > 1 || Math.abs(box.height - panel.h) > 1
  panel = { w: box.width, h: box.height }
  if (changed && !dragging) fit()
}).observe(canvas)

function setFilter(next: ViewFilter) {
  filter = next
  filterChosenHere = true
  persist()
  vscode.postMessage({ type: 'setFilter', filter })
  render()
}

function fold(action: FoldAction, scope: FoldScope, instance?: string) {
  if (!root) return
  // A box that is not a component cannot be folded; with one selected, the
  // buttons act on the whole hierarchy rather than doing nothing.
  const target = instance !== undefined && instances.includes(instance) ? instance : undefined
  unfolded = applyFold(unfolded, instances, action, target ? scope : 'all', target)
  foldChosenHere = true
  if (selected !== undefined && !isInstanceShown(selected, unfolded)) selected = undefined
  relayout()
  vscode.postMessage({ type: 'setFold', unfolded })
  render()
  fit() // what opened or closed changes the size a lot; NodeGraph refits the same way
}

function select(instance: string | undefined) {
  if (instance === selected && selectedWire === undefined) return
  selected = instance
  selectedWire = undefined
  drawHandles()
  markSelection()
  updateComponentTools()
  report()
}

function selectWire(name: string | undefined, branch = 0) {
  if (name !== selectedWire || branch !== selectedBranch) selectedVertex = undefined
  selectedWire = name
  selectedBranch = branch
  selected = undefined
  drawHandles()
  markSelection()
  updateComponentTools()
  report()
}

const describe = (d: Diagnostic) =>
  `${d.severity} ${d.code}${d.file ? ` ${d.file}${d.line ? `:${d.line}` : ''}` : ''}${d.node ? ` [${d.node}]` : ''}${d.signal ? ` [${d.signal}]` : ''}: ${d.msg}`

function showDiagnostics(diagnostics: Diagnostic[], drawn: boolean) {
  const errors = diagnostics.filter(d => d.severity === 'error').length
  problems.hidden = diagnostics.length === 0
  problems.open = errors > 0
  const summary = errors === 0 ? `${diagnostics.length} warning(s)` : drawn ? `${errors} error(s)` : `${errors} error(s) — schematic not drawn`
  problems.replaceChildren(
    el('summary', { textContent: summary }),
    ...diagnostics.map(d => el('div', { className: d.severity, textContent: describe(d) })),
  )
}

// A broken component schematic leaves its box folded; only a broken opened file
// stops the drawing.
function load(message: Extract<HostToWebview, { type: 'load' }>) {
  // A machine file is not a hierarchy: it is drawn on its own.
  if (graphFileKind(message.root) === 'fsm') return loadFsm(message.files[message.root] ?? '')
  const hierarchy = loadHierarchy(message.root, path => (Object.hasOwn(message.files, path) ? message.files[path] : undefined))
  const next = hierarchy.root
  const recorded = hierarchyEntries(next).flatMap(entry =>
    (entry.graph.diagnostics ?? []).map(d => (entry.instance ? { ...d, node: d.node ? `${entry.instance}/${d.node}` : entry.instance } : d)))
  showDiagnostics([...hierarchy.diagnostics, ...recorded], next !== undefined)
  if (!next) {
    root = layout = undefined
    instances = []
    render()
    return
  }
  const first = root === undefined
  root = next
  arrangement = root.graph.layout ?? emptyLayout()
  instances = componentInstances(root)
  unfolded = foldChosenHere ? normalizeUnfolded(unfolded, instances)! : normalizeUnfolded(message.unfolded, instances) ?? defaultUnfolded(root)
  if (selected !== undefined && !(instances.includes(selected) && isInstanceShown(selected, unfolded))) selected = undefined
  if (!filterChosenHere) filter = normalizeFilter(message.filter) ?? normalizeFilter(root.graph.view?.filter) ?? FILTER_PRESETS.all
  relayout()
  render()
  if (first && !viewport) fit()
  else applyViewport()
}

// ── pan, zoom, select, arrange ──
canvas.addEventListener('wheel', event => {
  event.preventDefault()
  const box = canvas.getBoundingClientRect()
  viewport = zoomAt(viewport ?? { x: 0, y: 0, zoom: 1 }, event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - box.left, event.clientY - box.top)
  applyViewport()
  persist()
}, { passive: false })

const groupAt = (target: EventTarget | null, selector: string, attribute: string) =>
  (target instanceof Element ? target.closest(selector)?.getAttribute(attribute) : undefined) ?? undefined
const componentAt = (target: EventTarget | null) => groupAt(target, 'g.component', 'data-node-id')
// Both kinds of box can be arranged by hand: a symbol and a component's frame.
const nodeAt = (target: EventTarget | null) =>
  groupAt(target, 'g.node', 'data-node-id') ?? groupAt(target, 'g.component', 'data-node-id')
const wireAt = (target: EventTarget | null) => groupAt(target, 'g.wire', 'data-signal')
const markerAt = (target: EventTarget | null) => target instanceof Element && target.closest('.fold') !== null
const handleAt = (target: EventTarget | null) =>
  target instanceof Element ? (target.closest('.handle') as SVGElement | null) : null
const gripAt = (target: EventTarget | null) => target instanceof Element && target.closest('.resize') !== null
const pinRefAt = (target: EventTarget | null) =>
  (target instanceof Element ? (target.closest('.pin') as SVGElement | null)?.dataset.ref : undefined) ?? undefined
const pinRefUnder = (x: number, y: number) => pinRefAt(document.elementFromPoint(x, y))

// Only a pin facing the other way can take the link being drawn; everything else
// is dimmed while the hand moves, which is the answer to "why does nothing
// happen when I let go here".
const canLink = (from: string, to: string): boolean => !!root && canConnect(root.graph, from, to)

const refOf = (id: string, pin: string) =>
  root?.graph.nodes[id]?.kind === 'port' || pin === PORT_PIN ? id : `${id}:${pin}`

// Where the link would land: a pin under the hand, or — anywhere over a box —
// that box's nearest pin that can take it. Aiming at a whole box is far easier
// than aiming at a dot, and the dot it picks is shown while the hand moves.
function targetUnder(from: string, clientX: number, clientY: number, at: Point): string | undefined {
  const element = document.elementFromPoint(clientX, clientY)
  const pin = pinRefAt(element)
  if (pin !== undefined) return canLink(from, pin) ? pin : undefined
  const id = nodeAt(element)
  const box = id !== undefined && belongsToThisFile(id) ? layout?.nodes[id] : undefined
  if (!box) return undefined
  // A pin with nothing on it yet is what the hand usually means; among equals,
  // the nearest one.
  const busy = connectedEndpoints(root!.graph, arrangement.cut ?? [], arrangement.links ?? [])
  const occupied = (ref: string) => (facing(root!.graph, ref) === 'source' ? busy.drives : busy.driven).has(ref)
  const options = Object.entries(box.pins)
    .map(([pin, p]) => ({ ref: refOf(id!, pin), p }))
    .filter(({ ref }) => canLink(from, ref))
    .sort((u, v) =>
      Number(occupied(u.ref)) - Number(occupied(v.ref)) ||
      Math.hypot(u.p.x - at.x, u.p.y - at.y) - Math.hypot(v.p.x - at.x, v.p.y - at.y))
  return options[0]?.ref
}

// Drawing a link between two pins. Redrawing a net that was cut is how a cut is
// undone; anything else is the reader's own sketch, which the goals then ask the
// RTL for.
function linkPins(a: string, b: string) {
  if (!root) return
  const decision = linkDecision(root.graph, arrangement, a, b)
  if (decision.kind === 'none') {
    // Silence was the worst part of this: say what stopped it.
    notice(decision.why)
    drawHandles()
    return
  }
  arrangement = decision.kind === 'uncut' ? withoutCut(arrangement, decision.net) : withLink(arrangement, decision.from, decision.to)
  selectWire(decision.kind === 'uncut' ? decision.net : linkKey(decision.from, decision.to))
  notice(decision.kind === 'uncut' ? `${decision.net} is back` : `drew ${decision.from} → ${decision.to}`)
  saveArrangement()
}

const CLICK_SLOP = 4

// Pointer capture retargets later events to the canvas, so what was pressed is
// taken from the press. While arranging, a press on a box drags it and a press
// on a frame's corner resizes it; otherwise the press pans.
canvas.addEventListener('pointerdown', event => {
  // A press inside the menu belongs to the menu: closing it here would take the
  // button out from under the click that was about to land on it.
  if (event.target instanceof Node && menu.contains(event.target)) return
  closeMenu()
  if (event.button !== 0) return
  dragging = true
  canvas.addEventListener('pointerup', () => { dragging = false }, { once: true })
  canvas.addEventListener('pointercancel', () => { dragging = false }, { once: true })
  const v = viewport ?? { x: 0, y: 0, zoom: 1 }
  const start = { px: event.clientX, py: event.clientY, v, target: event.target }
  // In edit mode a press on a wire takes hold of the straight run under it: a
  // corner grip picks the corner instead, and everything else pans as before.
  const frame = canvas.getBoundingClientRect()
  // Stage pixels are the page's own coordinates, which start at the view box.
  const pressedAt = { x: (event.clientX - frame.left - v.x) / v.zoom + view.x, y: (event.clientY - frame.top - v.y) / v.zoom + view.y }
  // A press on a pin draws a link from it; nothing else in the editor starts there.
  const startPin = editing ? pinRefAt(event.target) : undefined
  if (startPin !== undefined) {
    canvas.setPointerCapture(event.pointerId)
    drawing = { from: startPin, at: pressedAt }
    const track = (e: PointerEvent) => {
      const at = { x: (e.clientX - frame.left - v.x) / v.zoom + view.x, y: (e.clientY - frame.top - v.y) / v.zoom + view.y }
      drawing = { from: startPin, at, to: targetUnder(startPin, e.clientX, e.clientY, at) }
      drawHandles()
    }
    const drop = (e: PointerEvent) => {
      canvas.removeEventListener('pointermove', track)
      const landed = drawing?.to
      drawing = undefined
      if (landed !== undefined) linkPins(startPin, landed)
      else drawHandles()
    }
    canvas.addEventListener('pointermove', track)
    canvas.addEventListener('pointerup', drop, { once: true })
    return
  }
  const handle = editing ? handleAt(event.target) : null
  const pressedWire = editing ? wireAt(event.target) : undefined
  if (editing && (handle !== null || (pressedWire !== undefined && belongsToThisFile(pressedWire)))) {
    if (pressedWire !== undefined && pressedWire !== selectedWire) {
      selectWire(pressedWire)
      const ways = branchesOfSelected()
      if (ways && ways.length > 1) selectWire(pressedWire, branchAt(ways, pressedAt))
    }
    const branches = branchesOfSelected()
    const from = shapeOfSelected()
    if (handle?.classList.contains('vertex')) {
      const index = Number(handle.dataset.index)
      selectedVertex = selectedVertex === index ? undefined : index
      render()
      return
    }
    if (from) {
      const index = handle ? Number(handle.dataset.index) : segmentAt(from, pressedAt)
      canvas.setPointerCapture(event.pointerId)
      const shape = (e: PointerEvent) => {
        const moved = movedSegment(from, index, (e.clientX - start.px) / v.zoom, (e.clientY - start.py) / v.zoom)
        arrangement = shapedTo(arrangement, selectedWire!, (branches ?? [from]).map((path, i) => (i === selectedBranch ? moved : path)))
        relayout()
        render()
      }
      const done = (e: PointerEvent) => {
        canvas.removeEventListener('pointermove', shape)
        if (Math.hypot(e.clientX - start.px, e.clientY - start.py) >= CLICK_SLOP) saveArrangement()
        else render() // a plain click: just the selection
      }
      canvas.addEventListener('pointermove', shape)
      canvas.addEventListener('pointerup', done, { once: true })
      return
    }
  }

  // The fold marker is a button, not a handle: pressing it must not drag the frame.
  const id = markerAt(event.target) ? undefined : nodeAt(event.target)
  const box = id !== undefined ? layout?.nodes[id] : undefined
  const arranging = editing && id !== undefined && box !== undefined && belongsToThisFile(id)
  const resizing = arranging && gripAt(event.target)
  canvas.setPointerCapture(event.pointerId)
  if (!arranging) canvas.classList.add('panning')

  const move = (e: PointerEvent) => {
    const dx = (e.clientX - start.px) / v.zoom
    const dy = (e.clientY - start.py) / v.zoom
    if (resizing) arrangement = resizedTo(arrangement, id!, box!.w + dx, box!.h + dy)
    else if (arranging) arrangement = movedTo(arrangement, id!, box!.x + dx, box!.y + dy)
    else {
      viewport = { ...start.v, x: start.v.x + e.clientX - start.px, y: start.v.y + e.clientY - start.py }
      applyViewport()
      return
    }
    relayout()
    render()
  }
  const up = (e: PointerEvent) => {
    canvas.classList.remove('panning')
    canvas.removeEventListener('pointermove', move)
    const moved = Math.hypot(e.clientX - start.px, e.clientY - start.py) >= CLICK_SLOP
    if (arranging && moved) {
      saveArrangement()
      return
    }
    if (!moved) {
      viewport = start.v
      applyViewport()
      if (fsm) {
        // In a diagram the only thing to pick is a transition, and picking it
        // points at its row in the table.
        const edge = groupAt(start.target, 'g.fsm-edge', 'data-signal')
        selectTransition(edge === undefined ? undefined : Number(edge))
        persist()
        return
      }
      // Any box can be selected — the code behind it is what the palette's
      // "Open the Code of the Selected Box" needs — and a component box also
      // folds when the marker itself was pressed.
      const instance = componentAt(start.target)
      select(nodeAt(start.target))
      if (instance !== undefined && markerAt(start.target)) fold(isUnfolded(instance) ? 'fold' : 'unfold', 'node', instance)
    }
    persist()
  }
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up, { once: true })
})

// Right-click. On a box it asks where to go — the schematic inside it, or the
// line of code it came from. On a wire, while arranging, it turns the corner a
// quarter turn instead: two ways round a corner means clicking again brings it
// back, so it is a way of trying a route rather than a command to remember.
canvas.addEventListener('contextmenu', event => {
  closeMenu()
  const v = viewport ?? { x: 0, y: 0, zoom: 1 }
  const frame = canvas.getBoundingClientRect()
  const at = { x: (event.clientX - frame.left - v.x) / v.zoom + view.x, y: (event.clientY - frame.top - v.y) / v.zoom + view.y }
  const onWire = wireAt(event.target)
  const id = nodeAt(event.target)

  if (id !== undefined && (onWire === undefined || !editing)) {
    event.preventDefault()
    const instance = componentAt(event.target)
    const open = instance !== undefined ? [{
      label: `Open the schematic of ${displayName(instance)}`,
      run: () => vscode.postMessage({ type: 'command', command: 'rtlgraph.openComponent' }),
    }] : []
    if (instance !== undefined) select(instance)
    showMenu({ x: event.clientX - frame.left, y: event.clientY - frame.top }, [
      ...open,
      { label: `Open the code of ${displayName(id)}`, run: () => vscode.postMessage({ type: 'openSource', node: id }) },
      ...(specOf(id) ? [{ label: 'Open the requirement it is here for', run: () => vscode.postMessage({ type: 'openSpec', node: id }) }] : []),
    ])
    return
  }
  if (onWire !== undefined && !editing) {
    event.preventDefault()
    showMenu({ x: event.clientX - frame.left, y: event.clientY - frame.top }, [
      { label: `Open the code of ${displayName(onWire)}`, run: () => vscode.postMessage({ type: 'openSource', signal: onWire }) },
      ...(specOf(undefined, onWire) ? [{ label: 'Open the requirement it carries', run: () => vscode.postMessage({ type: 'openSpec', signal: onWire }) }] : []),
    ])
    return
  }

  if (!editing) return
  const name = onWire ?? selectedWire
  if (name === undefined || !belongsToThisFile(name)) return
  event.preventDefault()
  if (name !== selectedWire) selectWire(name)
  const ways = branchesOfSelected()
  if (ways && ways.length > 1 && wireAt(event.target) !== undefined) selectWire(name, branchAt(ways, at))
  const branches = branchesOfSelected()
  const shape = shapeOfSelected()
  if (!shape) return
  const turned = turnedAt(shape, at, TURN_REACH / (viewport?.zoom ?? 1))
  arrangement = shapedTo(arrangement, name, (branches ?? [shape]).map((path, i) => (i === selectedBranch ? turned : path)))
  selectedVertex = undefined
  saveArrangement()
})

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenu()
  if (event.key === 'Escape' && fsm) {
    if (selectedTransition !== undefined) selectTransition(selectedTransition)
    return
  }
  if (event.key === 'Escape') {
    select(undefined)
    selectWire(undefined)
    return
  }
  if (!editing || (event.key !== 'Delete' && event.key !== 'Backspace')) return
  if (selectedWire === undefined || !belongsToThisFile(selectedWire)) return
  // A corner is picked: take that corner out. Otherwise cut the whole net, which
  // leaves it in the file and the obligation in the panel.
  const points = shapeOfSelected()
  if (selectedVertex !== undefined && points) {
    const branches = branchesOfSelected() ?? [points]
    arrangement = shapedTo(arrangement, selectedWire, branches.map((path, i) => (i === selectedBranch ? removedVertex(points, selectedVertex!) : path)))
    selectedVertex = undefined
    saveArrangement()
    return
  }
  // A link the reader drew is theirs to remove; a net of the RTL is only cut.
  const ends = linkEnds(selectedWire)
  if (ends) {
    arrangement = withoutLink(arrangement, ends.from, ends.to)
    selectedWire = undefined
    saveArrangement()
    return
  }
  if (!isCut(arrangement, selectedWire)) {
    arrangement = withCut(arrangement, selectedWire)
    selectedWire = undefined
    saveArrangement()
  }
})

window.addEventListener('message', (event: MessageEvent<HostToWebview>) => {
  const message = event.data
  if (message.type === 'load') load(message)
  else if (message.type === 'setFilter') {
    const next = normalizeFilter(message.filter)
    if (next) setFilter(next)
  } else if (message.type === 'fold') fold(message.action, message.scope, message.instance)
  else if (message.type === 'fitView') fit()
  else if (message.type === 'rasterize') {
    rasterize(message.scale).then(
      base64 => vscode.postMessage({ type: 'raster', id: message.id, base64 }),
      (err: Error) => vscode.postMessage({ type: 'raster', id: message.id, error: err.message }),
    )
  }
})

render()
applyViewport()
vscode.postMessage({ type: 'ready' })
