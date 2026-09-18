// The requirement, shown inside the document it was written in.
//
// VS Code opens a PDF as "binary file not shown", so the link from a box to the
// brief stopped at the file name. This is a reader for it: pdf.js draws the
// pages, and the sentence the JSON quotes is found and painted on the page it is
// on — the same idea as NodeGraph's highlighting, and the reason `spec` stores
// the sentence rather than coordinates.
//
// pdf.js is used with its worker running on this thread (`globalThis.pdfjsWorker`,
// which is how pdf.js is told not to spawn one). A webview's resources are not
// same-origin with the webview itself, so a real worker would have to be
// smuggled in through a blob wrapper and the CSP opened for it; a brief is a
// page or two and the work is not worth that hole.

// The legacy build, not the modern one: pdf.js 6 calls Map.getOrInsertComputed,
// which the Electron behind VS Code does not have yet ("this[#methodPromises]
// .getOrInsertComputed is not a function", seen in the end-to-end run).
// @ts-expect-error the worker build ships no types; only WorkerMessageHandler is used
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs'
;(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfjsWorker

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
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
}

const vscode = acquireVsCodeApi()

const bar = document.getElementById('bar')!
const title = document.getElementById('title')!
const status = document.getElementById('status')!
const pagesEl = document.getElementById('pages')!
const zoomOut = document.getElementById('zoom-out') as HTMLButtonElement
const zoomIn = document.getElementById('zoom-in') as HTMLButtonElement
const zoomLabel = document.getElementById('zoom')!

interface Sheet {
  page: PDFPageProxy
  holder: HTMLDivElement
  canvas: HTMLCanvasElement
  marks: HTMLDivElement
  drawn: boolean
  drawing?: Promise<void>
}

let doc: PDFDocumentProxy | undefined
let sheets: Sheet[] = []
let zoom = 1 // 1 = fit the width of the panel
let fitted = 1 // the scale that fits, worked out from the first page
let watcher: IntersectionObserver | undefined

const scale = () => fitted * zoom

// Draw a page at the scale now in force. Pages are drawn when they come into
// view: a handout can be forty pages and only one is being read.
async function draw(sheet: Sheet): Promise<void> {
  if (sheet.drawn || sheet.drawing) return sheet.drawing
  const viewport = sheet.page.getViewport({ scale: scale() * (window.devicePixelRatio || 1) })
  const css = sheet.page.getViewport({ scale: scale() })
  sheet.canvas.width = Math.floor(viewport.width)
  sheet.canvas.height = Math.floor(viewport.height)
  sheet.canvas.style.width = `${Math.floor(css.width)}px`
  sheet.canvas.style.height = `${Math.floor(css.height)}px`
  const context = sheet.canvas.getContext('2d')!
  sheet.drawing = sheet.page.render({ canvasContext: context, viewport, canvas: sheet.canvas }).promise.then(() => {
    sheet.drawn = true
    sheet.drawing = undefined
  })
  return sheet.drawing
}

// The whole document is laid out first, at its real proportions, so scrolling
// and the scrollbar are right before anything has been drawn.
function lay(): void {
  for (const sheet of sheets) {
    const css = sheet.page.getViewport({ scale: scale() })
    sheet.holder.style.width = `${Math.floor(css.width)}px`
    sheet.holder.style.height = `${Math.floor(css.height)}px`
    sheet.canvas.style.width = `${Math.floor(css.width)}px`
    sheet.canvas.style.height = `${Math.floor(css.height)}px`
    sheet.drawn = false
  }
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`
}

function setZoom(next: number): void {
  zoom = Math.min(4, Math.max(0.25, next))
  lay()
  // Whatever is on screen is wanted now; the rest waits for the scroll.
  for (const sheet of sheets) if (onScreen(sheet.holder)) void draw(sheet)
  place()
}

const onScreen = (element: HTMLElement): boolean => {
  const box = element.getBoundingClientRect()
  return box.bottom > 0 && box.top < window.innerHeight
}

// Where the quote was found, kept so it can be painted again after a zoom.
let hit: { page: number; highlight: Highlight } | undefined

function place(): void {
  for (const sheet of sheets) sheet.marks.replaceChildren()
  if (!hit) return
  const sheet = sheets[hit.page - 1]
  if (!sheet) return
  for (const rect of hit.highlight.rects) {
    const mark = document.createElement('div')
    mark.className = hit.highlight.exact ? 'mark' : 'mark loose'
    mark.style.left = `${rect.x * scale()}px`
    mark.style.top = `${rect.y * scale()}px`
    mark.style.width = `${rect.w * scale()}px`
    mark.style.height = `${rect.h * scale()}px`
    sheet.marks.append(mark)
  }
}

// The sentence, looked for on the page the JSON points at and then anywhere
// else. Only text is read for the search — pages are not drawn to be searched.
async function find(quote: string, hint?: number): Promise<{ page: number; highlight: Highlight } | undefined> {
  const order = [...sheets.keys()].sort((a, b) => Math.abs(a - ((hint ?? 1) - 1)) - Math.abs(b - ((hint ?? 1) - 1)))
  let best: { page: number; highlight: Highlight } | undefined
  for (const index of order) {
    const page = sheets[index].page
    const content = await page.getTextContent()
    const found = findQuote(piecesFrom(content.items as TextItem[], page.getViewport({ scale: 1 })), quote)
    if (!found) continue
    if (found.exact) {
      best = { page: index + 1, highlight: found }
      break
    }
    if (!best || found.score > best.highlight.score) best = { page: index + 1, highlight: found }
  }
  return best
}

function say(quote: string | undefined): void {
  if (quote === undefined) {
    status.textContent = `${sheets.length} page${sheets.length === 1 ? '' : 's'}`
    status.className = ''
    return
  }
  if (!hit) {
    status.textContent = `the document does not say "${quote}" — it may have been re-issued since`
    status.className = 'miss'
    return
  }
  status.textContent = hit.highlight.exact
    ? `page ${hit.page}: "${quote}"`
    : `page ${hit.page}: the closest the document now comes to "${quote}"`
  status.className = hit.highlight.exact ? '' : 'loose'
}

async function open(message: Show): Promise<void> {
  title.textContent = message.name
  status.textContent = 'reading…'
  pagesEl.replaceChildren()
  watcher?.disconnect()
  hit = undefined

  doc = await getDocument({
    url: message.src,
    standardFontDataUrl: message.fonts,
    cMapUrl: message.cmaps,
    cMapPacked: true,
  }).promise

  sheets = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const holder = document.createElement('div')
    holder.className = 'sheet'
    const canvas = document.createElement('canvas')
    const marks = document.createElement('div')
    marks.className = 'marks'
    holder.append(canvas, marks)
    pagesEl.append(holder)
    sheets.push({ page, holder, canvas, marks, drawn: false })
  }

  // Fit the width of the panel, once, off the first page.
  const first = sheets[0].page.getViewport({ scale: 1 })
  fitted = Math.max(0.1, (pagesEl.clientWidth - 24) / first.width)
  zoom = 1
  lay()

  watcher = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const sheet = sheets.find(s => s.holder === entry.target)
      if (sheet) void draw(sheet)
    }
  }, { rootMargin: '200px' })
  for (const sheet of sheets) watcher.observe(sheet.holder)

  if (message.quote !== undefined) hit = await find(message.quote, message.page)
  say(message.quote)

  const wanted = hit?.page ?? message.page ?? 1
  const sheet = sheets[wanted - 1]
  if (sheet) {
    await draw(sheet)
    place()
    sheet.holder.scrollIntoView({ block: hit ? 'center' : 'start' })
    if (hit) sheet.marks.classList.add('flash')
  }
  vscode.postMessage({ type: 'shown', pages: sheets.length, page: hit?.page, found: hit?.highlight.exact ?? false })
}

zoomIn.addEventListener('click', () => setZoom(zoom * 1.25))
zoomOut.addEventListener('click', () => setZoom(zoom / 1.25))
// Anything that goes wrong is reported, not swallowed: the host is waiting to
// hear what the reader is looking at, and a silent failure would leave the panel
// blank with no word of why.
const failed = (why: string) => {
  status.textContent = `could not read the document: ${why}`
  status.className = 'miss'
  vscode.postMessage({ type: 'shown', pages: 0, found: false, error: why })
}

window.addEventListener('error', event => failed(String((event as ErrorEvent).message ?? event)))
window.addEventListener('unhandledrejection', event => failed(String((event as PromiseRejectionEvent).reason)))
window.addEventListener('message', event => {
  const message = event.data as Show
  if (message.type === 'show') void open(message).catch((error: Error) => failed(error?.message ?? String(error)))
})
bar.hidden = false
vscode.postMessage({ type: 'ready' })
