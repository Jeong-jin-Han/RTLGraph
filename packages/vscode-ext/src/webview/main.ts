import { FILTER_PRESETS, validateComponentGraph, type ComponentGraph, type Diagnostic, type FilterPreset, type ViewFilter } from '@rtlgraph/ir'
import { layoutComponent, type LayoutResult } from '@rtlgraph/layout'
import { buildScene, renderSvg, sceneToSvg } from '@rtlgraph/render'
import type { HostToWebview, WebviewToHost } from '../protocol.ts'
import {
  FLOW_LABELS, FLOWS, PRESET_LABELS, TIME_LABELS, TIMES,
  fitViewport, normalizeFilter, presetOf, toggleFlow, toggleTime, zoomAt, type Viewport,
} from './state.ts'

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHost): void
  getState(): unknown
  setState(state: unknown): void
}

interface SavedState {
  filter?: ViewFilter
  viewport?: Viewport
}

const vscode = acquireVsCodeApi()
const saved = (vscode.getState() as SavedState | undefined) ?? {}

let graph: ComponentGraph | undefined
let layout: LayoutResult | undefined
let filter: ViewFilter = normalizeFilter(saved.filter) ?? FILTER_PRESETS.all
let filterChosenHere = normalizeFilter(saved.filter) !== undefined
let viewport: Viewport | undefined = saved.viewport

function persist() {
  vscode.setState({ filter: filterChosenHere ? filter : undefined, viewport } satisfies SavedState)
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
const exportButton = el('button', { type: 'button', textContent: 'Export…', title: 'Export the current view as SVG, PNG or PDF' })
exportButton.addEventListener('click', () => vscode.postMessage({ type: 'export' }))
const fitButton = el('button', { type: 'button', textContent: 'Fit', title: 'Fit the schematic to the window' })
fitButton.addEventListener('click', fit)

const toolbar = el('div', { id: 'toolbar' },
  el('span', { className: 'label', textContent: 'flow' }), ...flowButtons,
  el('span', { className: 'label', textContent: 'time' }), ...timeButtons,
  el('span', { className: 'label', textContent: 'preset' }), presetSelect,
  el('span', { className: 'spacer' }), exportButton, fitButton,
)
const stage = el('div', { id: 'stage' })
const canvas = el('div', { id: 'canvas' }, stage)
const problems = el('details', { id: 'problems', hidden: true })
document.body.append(toolbar, canvas, problems)

// ── rendering ──
function render() {
  flowButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(filter.flow.includes(FLOWS[i]))))
  timeButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(filter.time.includes(TIMES[i]))))
  presetSelect.value = presetOf(filter) ?? ''
  if (!graph || !layout) {
    stage.replaceChildren()
    return
  }
  // Full layout, no cropping: switching the filter must not move anything.
  stage.innerHTML = renderSvg(graph, { filter, layout, crop: false })
  vscode.postMessage({
    type: 'rendered',
    state: {
      filter,
      nodes: stage.querySelectorAll('[data-node-id]').length,
      signals: stage.querySelectorAll('[data-signal]').length,
    },
  })
}

// PNG export: draw the cropped view (the same scene the SVG/PDF exports use) onto
// a canvas at `scale` and return it base64-encoded.
async function rasterize(scale: number): Promise<string> {
  if (!graph || !layout) throw new Error('nothing is drawn yet')
  const scene = buildScene(graph, { filter, layout })
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

const describe = (d: Diagnostic) =>
  `${d.severity} ${d.code}${d.file ? ` ${d.file}${d.line ? `:${d.line}` : ''}` : ''}${d.node ? ` [${d.node}]` : ''}${d.signal ? ` [${d.signal}]` : ''}: ${d.msg}`

function showDiagnostics(diagnostics: Diagnostic[]) {
  const errors = diagnostics.filter(d => d.severity === 'error').length
  problems.hidden = diagnostics.length === 0
  problems.open = errors > 0
  problems.replaceChildren(
    el('summary', { textContent: errors > 0 ? `${errors} error(s) — schematic not drawn` : `${diagnostics.length} warning(s)` }),
    ...diagnostics.map(d => el('div', { className: d.severity, textContent: describe(d) })),
  )
}

function load(text: string, storedFilter: ViewFilter | undefined) {
  let parsed: unknown
  try {
    parsed = text.trim() === '' ? undefined : JSON.parse(text)
  } catch (err) {
    graph = layout = undefined
    showDiagnostics([{ severity: 'error', code: 'json', msg: (err as Error).message }])
    render()
    return
  }
  const result = validateComponentGraph(parsed)
  if (!result.ok) {
    graph = layout = undefined
    showDiagnostics(result.diagnostics)
    render()
    return
  }
  const first = graph === undefined
  graph = parsed as ComponentGraph
  layout = layoutComponent(graph)
  showDiagnostics([...result.diagnostics, ...(graph.diagnostics ?? [])])
  if (!filterChosenHere) filter = normalizeFilter(storedFilter) ?? normalizeFilter(graph.view?.filter) ?? FILTER_PRESETS.all
  render()
  if (first && !viewport) fit()
  else applyViewport()
}

// ── pan & zoom ──
canvas.addEventListener('wheel', event => {
  event.preventDefault()
  const box = canvas.getBoundingClientRect()
  viewport = zoomAt(viewport ?? { x: 0, y: 0, zoom: 1 }, event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - box.left, event.clientY - box.top)
  applyViewport()
  persist()
}, { passive: false })

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return
  const start = { px: event.clientX, py: event.clientY, v: viewport ?? { x: 0, y: 0, zoom: 1 } }
  canvas.setPointerCapture(event.pointerId)
  canvas.classList.add('panning')
  const move = (e: PointerEvent) => {
    viewport = { ...start.v, x: start.v.x + e.clientX - start.px, y: start.v.y + e.clientY - start.py }
    applyViewport()
  }
  const up = () => {
    canvas.classList.remove('panning')
    canvas.removeEventListener('pointermove', move)
    persist()
  }
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up, { once: true })
})

window.addEventListener('message', (event: MessageEvent<HostToWebview>) => {
  const message = event.data
  if (message.type === 'load') load(message.text, message.filter)
  else if (message.type === 'setFilter') {
    const next = normalizeFilter(message.filter)
    if (next) setFilter(next)
  } else if (message.type === 'fitView') fit()
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
