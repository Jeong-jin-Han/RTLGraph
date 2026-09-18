// The requirement, shown inside the document it was written in.
//
// VS Code opens a PDF as "binary file not shown", so the link from a box to the
// brief used to stop at a file name. This is a reader for it, built on pdf.js's
// own viewer engine (PDFViewer + PDFFindController from pdf_viewer.mjs) rather
// than a list of canvases of our own: that engine brings the text layer, so the
// document can be selected and searched, and its find controller paints a match
// the way every other PDF reader does.
//
// The sentence is found by our own matcher (@rtlgraph/pdf) rather than by asking
// the find controller for the quote: a quote out of a JSON file is not always
// spelled the way the page spells it — a line break mid-word, a ligature, an
// arrow drawn instead of typed, a brief re-issued with one word changed. The
// matcher finds it anyway and hands back *the page's own wording*, which is what
// the find controller is then asked for, so the highlight is pdf.js's own.
//
// The worker runs in a thread of its own. A webview's resources are not
// same-origin with the webview, so `new Worker(<resource uri>)` is refused; the
// worker's source is fetched and started from a blob, which is same-origin. If
// that fails it falls back onto this thread — slower, but it works.

// @ts-expect-error the worker build ships no types; it is only the fallback handler
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs'

// The legacy builds, not the modern ones: pdf.js 6 calls Map.getOrInsertComputed,
// which the Electron behind VS Code does not have yet (seen as
// "this[#methodPromises].getOrInsertComputed is not a function"). The legacy
// bundles carry the polyfill.
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs'
import { findQuote, piecesFrom, type Highlight, type TextItem } from '@rtlgraph/pdf'

declare function acquireVsCodeApi(): { postMessage(message: unknown): void }

interface Show {
  type: 'show'
  src: string
  name: string
  quote?: string
  page?: number
  fonts: string
  cmaps: string
  worker: string
}

const vscode = acquireVsCodeApi()

const bar = document.getElementById('bar')!
const title = document.getElementById('title')!
const status = document.getElementById('status')!
const container = document.getElementById('viewerContainer') as HTMLDivElement
const pageNow = document.getElementById('page-now') as HTMLInputElement
const pageCount = document.getElementById('page-count')!
const zoomLabel = document.getElementById('zoom')!
const findBox = document.getElementById('find') as HTMLInputElement
const backToQuote = document.getElementById('back') as HTMLButtonElement

const bus = new EventBus()
const links = new PDFLinkService({ eventBus: bus })
const finder = new PDFFindController({ eventBus: bus, linkService: links })
const viewer = new PDFViewer({
  container,
  viewer: document.getElementById('viewer') as HTMLDivElement,
  eventBus: bus,
  linkService: links,
  findController: finder,
  textLayerMode: 1,
})
links.setViewer(viewer)

let doc: PDFDocumentProxy | undefined
let hit: { page: number; highlight: Highlight } | undefined
let fitting = true // the scale follows the panel until the reader picks a zoom

const say = (text: string, how = '') => {
  status.textContent = text
  status.className = how
}

function failed(why: string): void {
  say(`could not read the document: ${why}`, 'miss')
  vscode.postMessage({ type: 'shown', pages: 0, found: false, error: why })
}

async function startWorker(src: string): Promise<void> {
  try {
    const source = await fetch(src)
    if (!source.ok) throw new Error(`HTTP ${source.status}`)
    const blob = new Blob([await source.text()], { type: 'text/javascript' })
    GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(blob), { type: 'module' })
  } catch {
    // pdf.js reads this global as "the worker is already here, on this thread".
    ;(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfjsWorker
  }
}

// Where the sentence is. The hinted page first — it is right nearly always — and
// only the text of each page is read, never its pixels.
async function locate(quote: string, hint?: number): Promise<{ page: number; highlight: Highlight } | undefined> {
  if (!doc) return undefined
  const order = [...Array(doc.numPages).keys()].sort((a, b) =>
    Math.abs(a - ((hint ?? 1) - 1)) - Math.abs(b - ((hint ?? 1) - 1)))
  let best: { page: number; highlight: Highlight } | undefined
  for (const index of order) {
    const page = await doc.getPage(index + 1)
    const content = await page.getTextContent()
    const found = findQuote(piecesFrom(content.items as TextItem[], page.getViewport({ scale: 1 })), quote)
    if (!found) continue
    if (found.exact) return { page: index + 1, highlight: found }
    if (!best || found.score > best.highlight.score) best = { page: index + 1, highlight: found }
  }
  return best
}

// Ask pdf.js to find its own words, so the highlight is the viewer's own.
const paint = (text: string) => bus.dispatch('find', {
  source: window,
  type: '',
  query: text,
  caseSensitive: false,
  entireWord: false,
  highlightAll: true,
  findPrevious: false,
  matchDiacritics: false,
})

async function open(message: Show): Promise<void> {
  title.textContent = message.name
  say('reading…')
  hit = undefined
  await startWorker(message.worker)

  doc = await getDocument({
    url: message.src,
    standardFontDataUrl: message.fonts,
    cMapUrl: message.cmaps,
    cMapPacked: true,
  }).promise

  const ready = new Promise<void>(resolve => bus.on('pagesinit', () => resolve(), { once: true }))
  viewer.setDocument(doc)
  links.setDocument(doc, null)
  await ready
  viewer.currentScaleValue = 'page-width'
  pageCount.textContent = `/ ${doc.numPages}`
  pageNow.value = String(message.page ?? 1)

  if (message.quote !== undefined) hit = await locate(message.quote, message.page)
  backToQuote.hidden = !hit
  if (hit) {
    viewer.currentPageNumber = hit.page
    paint(hit.highlight.text)
    say(hit.highlight.exact
      ? `page ${hit.page}: “${message.quote}”`
      : `page ${hit.page}: the closest the document now comes to “${message.quote}”`,
      hit.highlight.exact ? '' : 'loose')
  } else if (message.quote !== undefined) {
    say(`the document does not say “${message.quote}” — it may have been re-issued since`, 'miss')
    if (message.page) viewer.currentPageNumber = message.page
  } else {
    say('the brief this design was asked for')
    if (message.page) viewer.currentPageNumber = message.page
  }

  vscode.postMessage({ type: 'shown', pages: doc.numPages, page: hit?.page, found: hit?.highlight.exact ?? false })
}

// ── the toolbar ──

const setScale = (value: string | number) => {
  fitting = typeof value === 'string'
  viewer.currentScaleValue = String(value)
}

bus.on('pagechanging', (event: { pageNumber: number }) => (pageNow.value = String(event.pageNumber)))
bus.on('scalechanging', (event: { scale: number }) => (zoomLabel.textContent = `${Math.round(event.scale * 100)}%`))

document.getElementById('prev')!.addEventListener('click', () => viewer.previousPage())
document.getElementById('next')!.addEventListener('click', () => viewer.nextPage())
document.getElementById('zoom-out')!.addEventListener('click', () => setScale(viewer.currentScale / 1.2))
document.getElementById('zoom-in')!.addEventListener('click', () => setScale(viewer.currentScale * 1.2))
document.getElementById('fit')!.addEventListener('click', () => setScale('page-width'))
backToQuote.addEventListener('click', () => {
  if (!hit) return
  viewer.currentPageNumber = hit.page
  paint(hit.highlight.text)
})
pageNow.addEventListener('change', () => {
  const wanted = Number(pageNow.value)
  if (doc && Number.isInteger(wanted) && wanted >= 1 && wanted <= doc.numPages) viewer.currentPageNumber = wanted
  else pageNow.value = String(viewer.currentPageNumber)
})
findBox.addEventListener('keydown', event => {
  if ((event as KeyboardEvent).key === 'Enter' && findBox.value) paint(findBox.value)
})

// The panel is one pane of an editor: it gets resized by dragging the split, and
// the page should keep filling it until the reader has chosen a zoom of their own.
new ResizeObserver(() => {
  if (fitting && doc) viewer.currentScaleValue = 'page-width'
}).observe(container)

window.addEventListener('error', event => failed(String((event as ErrorEvent).message ?? event)))
window.addEventListener('unhandledrejection', event => failed(String((event as PromiseRejectionEvent).reason)))
window.addEventListener('message', event => {
  const message = event.data as Show
  if (message.type === 'show') void open(message).catch((error: Error) => failed(error?.message ?? String(error)))
})
bar.hidden = false
vscode.postMessage({ type: 'ready' })
