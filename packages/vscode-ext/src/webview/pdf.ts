// The bridge between RTLGraph and pdf.js's own viewer.
//
// The reader is not ours: `assets/pdfjs-viewer/web/viewer.html` is Mozilla's
// reference viewer, mounted whole — toolbar, sidebar, thumbnails, find bar,
// zoom, rotate, print, keyboard shortcuts. Writing a viewer instead of using
// that one was the wrong call: everything a person expects of a PDF window has
// already been built there, and NodeGraph mounts the same thing.
//
// What is ours is the part the viewer cannot do: finding the sentence a box
// quotes. A quote in a JSON file is not always spelled the way the page spells
// it — a line break mid-word, a ligature, an arrow typed rather than drawn, a
// brief re-issued with one word changed — so @rtlgraph/pdf locates it and hands
// back *the page's own wording*, and that is what the viewer's find controller
// is asked for. The highlight is then the viewer's, exactly as if the reader had
// typed it into the find bar.
//
// The worker is the other thing a webview cannot do straight: its resources are
// not same-origin, so `new Worker(<resource uri>)` is refused. The worker's
// source is fetched and started from a blob instead.

import { findQuote, piecesFrom, type Highlight, type TextItem } from '@rtlgraph/pdf'

declare function acquireVsCodeApi(): { postMessage(message: unknown): void }

interface Show {
  type: 'show'
  src: string
  name: string
  quote?: string
  page?: number
}

// Only the parts of the viewer this file touches.
interface Viewer {
  initializedPromise: Promise<void>
  eventBus: { on(name: string, handler: (event: never) => void, options?: { once: boolean }): void; dispatch(name: string, payload: unknown): void }
  open(args: { url: string }): Promise<void>
  pdfDocument?: {
    numPages: number
    getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }>; getViewport(o: { scale: number }): { transform: number[]; scale: number } }>
  }
  page: number
  findController?: { scrollMatchIntoView(match: unknown): void }
}

const app = () => (window as unknown as { PDFViewerApplication: Viewer }).PDFViewerApplication
const options = () => (window as unknown as {
  PDFViewerApplicationOptions: { set(name: string, value: unknown): void }
}).PDFViewerApplicationOptions
const settings = (window as unknown as { __RTLGRAPH__: { worker: string; fonts: string; cmaps: string } }).__RTLGRAPH__

// The viewer otherwise opens the sample document it ships with
// (`compressed.tracemonkey-pldi-09.pdf`), which is not shipped here — the
// end-to-end run caught it as a 403 while the real brief was still loading.
// `webviewerloaded` is the viewer's own hook for settings, dispatched a moment
// before it starts; its options object does not exist any earlier than that.
// ...and the hook is dispatched on `parent.document` when that is reachable,
// which inside a VS Code webview it is, so both are listened to.
const blankDefault = () => {
  try {
    options().set('defaultUrl', '')
  } catch {
    // The viewer is not there yet; the guard below covers what slips through.
  }
}
document.addEventListener('webviewerloaded', blankDefault, { once: true })
try {
  parent.document.addEventListener('webviewerloaded', blankDefault, { once: true })
} catch {
  // A parent of another origin: the listener above is the one that fires.
}

const vscode = acquireVsCodeApi()

// The viewer has nowhere to say "this sentence is why you are here", so one line
// is added under its toolbar.
const note = document.createElement('div')
note.id = 'rtlgraph-note'
document.body.append(note)

const say = (text: string, how = '') => {
  note.textContent = text
  note.className = how
}

say('reading the document…')

// What the reader was asked to open. An error about any other document — the
// sample the viewer ships with, most of all — is not this panel's failure.
let asked: string | undefined

function failed(why: string): void {
  if (asked === undefined || (/retrieving PDF "([^"]+)"/.exec(why)?.[1] ?? asked) !== asked) {
    console.warn('RTLGraph: ignoring an error about another document —', why)
    return
  }
  say(`RTLGraph could not read the document: ${why}`, 'miss')
  vscode.postMessage({ type: 'shown', pages: 0, found: false, error: why })
}

// A worker of its own, started from a blob so that it counts as same-origin.
async function worker(): Promise<Worker | undefined> {
  try {
    const source = await fetch(settings.worker)
    if (!source.ok) throw new Error(`HTTP ${source.status}`)
    const blob = new Blob([await source.text()], { type: 'text/javascript' })
    return new Worker(URL.createObjectURL(blob), { type: 'module' })
  } catch {
    return undefined // pdf.js falls back to its own thread and says so in the console
  }
}

// Where the sentence is. The hinted page first — it is right nearly always — and
// only the text of a page is read, never its pixels.
async function locate(quote: string, hint?: number): Promise<{ page: number; highlight: Highlight } | undefined> {
  const doc = app().pdfDocument
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

// Ask the viewer to find its own words: the highlight, the match count and the
// find bar all come out right, because this is the viewer's own search.
const paint = (text: string) => app().eventBus.dispatch('find', {
  source: window,
  type: '',
  query: text,
  caseSensitive: false,
  entireWord: false,
  highlightAll: true,
  findPrevious: false,
  matchDiacritics: false,
})

let hit: { page: number; highlight: Highlight } | undefined

async function show(message: Show): Promise<void> {
  asked = message.src
  const viewer = app()
  await viewer.initializedPromise
  const port = await worker()
  if (port) options().set('workerPort', port)
  options().set('standardFontDataUrl', settings.fonts)
  options().set('cMapUrl', settings.cmaps)

  const loaded = new Promise<void>(resolve => viewer.eventBus.on('documentloaded', () => resolve(), { once: true }))
  await viewer.open({ url: message.src })
  await loaded

  hit = message.quote === undefined ? undefined : await locate(message.quote, message.page)
  if (hit) {
    viewer.page = hit.page
    paint(hit.highlight.text)
    say(hit.highlight.exact
      ? `the requirement, on page ${hit.page}: “${message.quote}”`
      : `page ${hit.page} — the closest the document now comes to “${message.quote}”`,
      hit.highlight.exact ? '' : 'loose')
  } else if (message.quote !== undefined) {
    say(`the document does not say “${message.quote}” — it may have been re-issued since`, 'miss')
    if (message.page) viewer.page = message.page
  } else {
    say('the brief this design was asked for')
    if (message.page) viewer.page = message.page
  }

  vscode.postMessage({
    type: 'shown',
    pages: viewer.pdfDocument?.numPages ?? 0,
    page: hit?.page,
    found: hit?.highlight.exact ?? false,
  })
}

window.addEventListener('error', event => failed(String((event as ErrorEvent).message ?? event)))
window.addEventListener('unhandledrejection', event => failed(String((event as PromiseRejectionEvent).reason)))
window.addEventListener('message', event => {
  const message = event.data as Show
  if (message.type === 'show') void show(message).catch((error: Error) => failed(error?.message ?? String(error)))
})
vscode.postMessage({ type: 'ready' })
