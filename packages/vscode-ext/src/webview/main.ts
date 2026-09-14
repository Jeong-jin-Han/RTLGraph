import { FILTER_PRESETS, hierarchyEntries, loadHierarchy, type Diagnostic, type FilterPreset, type HierarchyEntry, type ViewFilter } from '@rtlgraph/ir'
import { layoutHierarchy, type NestedLayout } from '@rtlgraph/layout'
import { buildHierarchyScene, sceneToSvg } from '@rtlgraph/render'
import type { HostToWebview, ToolbarCommand, WebviewToHost } from '../protocol.ts'
import {
  FLOW_LABELS, FLOWS, PRESET_LABELS, TIME_LABELS, TIMES,
  applyFold, componentInstances, defaultUnfolded, fitViewport, isInstanceShown, normalizeFilter, normalizeUnfolded,
  presetOf, toggleFlow, toggleTime, zoomAt, type FoldAction, type FoldScope, type Viewport,
} from './state.ts'

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
let selected: string | undefined
let viewport: Viewport | undefined = saved.viewport

const isUnfolded = (instance: string) => unfolded.includes(instance)

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

const flowButtons = FLOWS.map(flow => {
  const button = el('button', { type: 'button', textContent: FLOW_LABELS[flow] })
  button.addEventListener('click', () => setFilter(toggleFlow(filter, flow)))
  return button
})
const timeButtons = TIMES.map(time => {
  const button = el('button', { type: 'button', textContent: TIME_LABELS[time] })
  button.addEventListener('click', () => setFilter(toggleTime(filter, time)))
  return button
})
const presetSelect = el('select', { title: 'View preset' })
for (const [key, label] of Object.entries(PRESET_LABELS)) presetSelect.append(el('option', { value: key, textContent: label }))
presetSelect.append(el('option', { value: '', textContent: 'Custom', disabled: true }))
presetSelect.addEventListener('change', () => setFilter(FILTER_PRESETS[presetSelect.value as FilterPreset]))

const commandButton = (text: string, command: ToolbarCommand) => {
  const button = el('button', { type: 'button', textContent: text })
  button.addEventListener('click', () => vscode.postMessage({ type: 'command', command }))
  return button
}
const foldButton = commandButton('Fold', 'rtlgraph.fold')
const unfoldButton = commandButton('Unfold', 'rtlgraph.unfold')
const openButton = commandButton('Open', 'rtlgraph.openComponent')
const selectionLabel = el('span', { className: 'selection' })
const componentTools = el('span', { className: 'group' },
  el('span', { className: 'label', textContent: 'components' }), selectionLabel, foldButton, unfoldButton, openButton)

const exportButton = el('button', { type: 'button', textContent: 'Export…', title: 'Export the current view as SVG, PNG or PDF' })
exportButton.addEventListener('click', () => vscode.postMessage({ type: 'export' }))
const fitButton = el('button', { type: 'button', textContent: 'Fit', title: 'Fit the schematic to the window' })
fitButton.addEventListener('click', fit)

const toolbar = el('div', { id: 'toolbar' },
  el('span', { className: 'label', textContent: 'flow' }), ...flowButtons,
  el('span', { className: 'label', textContent: 'time' }), ...timeButtons,
  el('span', { className: 'label', textContent: 'preset' }), presetSelect,
  componentTools,
  el('span', { className: 'spacer' }), exportButton, fitButton,
)
const stage = el('div', { id: 'stage' })
const canvas = el('div', { id: 'canvas' }, stage)
const problems = el('details', { id: 'problems', hidden: true })
document.body.append(toolbar, canvas, problems)

// ── rendering ──
function updateComponentTools() {
  componentTools.hidden = instances.length === 0
  selectionLabel.textContent = selected ?? 'none selected'
  foldButton.title = selected ? `Fold ${selected}: only it, or it and everything inside` : 'Fold every component'
  unfoldButton.title = selected ? `Unfold ${selected}: only it, or it and everything inside` : 'Unfold every component'
  openButton.title = selected ? `Open the schematic of ${selected}` : 'Select a component box to open its schematic'
  openButton.disabled = selected === undefined
}

function report() {
  vscode.postMessage({
    type: 'rendered',
    state: {
      filter,
      nodes: stage.querySelectorAll('[data-node-id]').length,
      signals: stage.querySelectorAll('[data-signal]').length,
      unfolded,
      ...(selected !== undefined ? { selected } : {}),
    },
  })
}

function markSelection() {
  stage.querySelectorAll('g.selected').forEach(g => g.classList.remove('selected'))
  if (selected === undefined) return
  stage.querySelectorAll('g.component').forEach(g => {
    if (g.getAttribute('data-node-id') === selected) g.classList.add('selected')
  })
}

function render() {
  flowButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(filter.flow.includes(FLOWS[i]))))
  timeButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(filter.time.includes(TIMES[i]))))
  presetSelect.value = presetOf(filter) ?? ''
  updateComponentTools()
  if (!root || !layout) {
    stage.replaceChildren()
    return
  }
  // Full layout, no cropping: switching the filter must not move anything.
  // controls: the fold markers are for clicking here; exports leave them out.
  stage.innerHTML = sceneToSvg(buildHierarchyScene(root, { filter, layout, crop: false, isUnfolded, controls: true }))
  markSelection()
  report()
}

// PNG export: draw the cropped view (the same scene the SVG/PDF exports use) onto
// a canvas at `scale` and return it base64-encoded.
async function rasterize(scale: number): Promise<string> {
  if (!root || !layout) throw new Error('nothing is drawn yet')
  // The PNG is an export like the others: same scene, wrapper root left out.
  const scene = buildHierarchyScene(root, { filter, isUnfolded, unwrap: true })
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
}

function fit() {
  if (!layout) return
  const box = canvas.getBoundingClientRect()
  viewport = fitViewport(layout.width, layout.height, box.width, box.height)
  applyViewport()
  persist()
}

function setFilter(next: ViewFilter) {
  filter = next
  filterChosenHere = true
  persist()
  vscode.postMessage({ type: 'setFilter', filter })
  render()
}

function fold(action: FoldAction, scope: FoldScope, instance?: string) {
  if (!root) return
  unfolded = applyFold(unfolded, instances, action, scope, instance)
  foldChosenHere = true
  if (selected !== undefined && !isInstanceShown(selected, unfolded)) selected = undefined
  layout = layoutHierarchy(root, isUnfolded)
  persist()
  vscode.postMessage({ type: 'setFold', unfolded })
  render()
}

function select(instance: string | undefined) {
  if (instance === selected) return
  selected = instance
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
  instances = componentInstances(root)
  unfolded = foldChosenHere ? normalizeUnfolded(unfolded, instances)! : normalizeUnfolded(message.unfolded, instances) ?? defaultUnfolded(root)
  if (selected !== undefined && !(instances.includes(selected) && isInstanceShown(selected, unfolded))) selected = undefined
  if (!filterChosenHere) filter = normalizeFilter(message.filter) ?? normalizeFilter(root.graph.view?.filter) ?? FILTER_PRESETS.all
  layout = layoutHierarchy(root, isUnfolded)
  render()
  if (first && !viewport) fit()
  else applyViewport()
}

// ── pan, zoom, select ──
canvas.addEventListener('wheel', event => {
  event.preventDefault()
  const box = canvas.getBoundingClientRect()
  viewport = zoomAt(viewport ?? { x: 0, y: 0, zoom: 1 }, event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - box.left, event.clientY - box.top)
  applyViewport()
  persist()
}, { passive: false })

const componentAt = (target: EventTarget | null) =>
  (target instanceof Element ? target.closest('g.component')?.getAttribute('data-node-id') : undefined) ?? undefined

const CLICK_SLOP = 4
const DOUBLE_CLICK_MS = 400
let lastClick: { instance?: string; at: number } | undefined

// Pointer capture retargets later events to the canvas, so what was clicked is
// taken from the press. A click selects a component box (or clears the
// selection); a second click on the same box folds or unfolds just that box.
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return
  const start = { px: event.clientX, py: event.clientY, v: viewport ?? { x: 0, y: 0, zoom: 1 }, target: event.target }
  canvas.setPointerCapture(event.pointerId)
  canvas.classList.add('panning')
  const move = (e: PointerEvent) => {
    viewport = { ...start.v, x: start.v.x + e.clientX - start.px, y: start.v.y + e.clientY - start.py }
    applyViewport()
  }
  const up = (e: PointerEvent) => {
    canvas.classList.remove('panning')
    canvas.removeEventListener('pointermove', move)
    if (Math.hypot(e.clientX - start.px, e.clientY - start.py) < CLICK_SLOP) {
      viewport = start.v
      applyViewport()
      const instance = componentAt(start.target)
      const now = performance.now()
      if (instance !== undefined && lastClick?.instance === instance && now - lastClick.at < DOUBLE_CLICK_MS) {
        lastClick = undefined
        fold(isUnfolded(instance) ? 'fold' : 'unfold', 'node', instance)
      } else {
        lastClick = { instance, at: now }
        select(instance)
      }
    }
    persist()
  }
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up, { once: true })
})

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') select(undefined)
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
