// The specification, read as a document with its workflows built in.
//
// VS Code's markdown preview renders the text and stops there: a code lens
// cannot live in it, so the scenarios in a spec were unreachable from the one
// place a reader actually reads them. This is the preview we need instead —
// the same document, plus, under every scenario heading, the steps of that
// scenario as a list you can open, click and walk, with the one you are on
// marked as the editors on the right move.
//
// Nothing here decides anything: the host sends the text, the scenarios it
// found and where the walk is, and gets back "walk this", "step", "open that
// line".

import katex from 'katex'

interface Step {
  cycle: string
  said: string
  file: string
  spans: { from: number; to: number }[]
}

interface Walk {
  id: string
  title: string
  steps: Step[]
}

interface At {
  id: string
  index: number
  total: number
}

interface Words {
  walk: string
  steps: (n: number) => string
  stop: string
  source: string
  nothing: string
}

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void
  getState(): unknown
  setState(state: unknown): void
}
const vscode = acquireVsCodeApi()

const WORDS: Record<'ko' | 'en', Words> = {
  ko: {
    walk: '걷기',
    steps: n => `${n} 스텝`,
    stop: '끝',
    source: '본문 열기',
    nothing: '이 문서에는 걸을 수 있는 5 절 표가 없다.',
  },
  en: {
    walk: 'Walk',
    steps: n => `${n} steps`,
    stop: 'Stop',
    source: 'Open the source',
    nothing: 'This document has no section 5 table to walk.',
  },
}

let words = WORDS.en
let walks: Walk[] = []
let prefixes: Record<string, string> = {}
let at: At | undefined
/** Which scenarios the reader has closed; everything else stays open. */
const closed = new Set<string>((vscode.getState() as { closed?: string[] } | undefined)?.closed ?? [])

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

// ── the document ────────────────────────────────────────────────────────────

/** `rx:74`, `uart_receiver.v:115-116` — a place in the code, wherever it sits. */
const CITATION = /([A-Za-z_][\w./-]*(?:\.s?v)?):(\d+)(?:\s*[-–]\s*(\d+))?/g
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/
const HEADING = /^(#{1,6})\s+(.*)$/

function fileOf(name: string): string | undefined {
  return /\.s?v$/.test(name) ? name : prefixes[name]
}

function openCode(file: string, line: number): void {
  vscode.postMessage({ type: 'open', file, line })
}

/** A citation, as something to press. Anything that resolves to no file is text. */
function citation(name: string, from: string, to?: string): HTMLElement {
  const file = fileOf(name)
  const label = `${name}:${from}${to ? `-${to}` : ''}`
  if (!file) return el('code', 'cite dead', label)
  const button = el('button', 'cite')
  button.textContent = label
  button.title = `${file}:${from}`
  button.addEventListener('click', () => openCode(file, Number(from)))
  return button
}

function math(text: string, display: boolean): HTMLElement {
  const node = el(display ? 'div' : 'span', display ? 'math block' : 'math')
  try {
    node.innerHTML = katex.renderToString(text, { displayMode: display, throwOnError: false, output: 'html' })
  } catch {
    node.textContent = display ? `$$${text}$$` : `$${text}$`
  }
  return node
}

/**
 * One line of prose, with the few things a specification writes in it.
 *
 * Deliberately small: bold, code, maths, links and citations. A spec is read
 * for its tables and its line numbers, and a renderer that tries to be a whole
 * markdown implementation is a renderer nobody can fix.
 */
function inline(text: string): HTMLElement[] {
  const out: HTMLElement[] = []
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\$([^$]+)\$|\[([^\]]+)\]\(([^)]+)\)/g
  let from = 0
  const plain = (part: string) => {
    // Bare citations outside code spans are still places to go.
    let last = 0
    for (const found of part.matchAll(CITATION)) {
      if (!fileOf(found[1])) continue
      if (found.index > last) out.push(el('span', undefined, part.slice(last, found.index)))
      out.push(citation(found[1], found[2], found[3]))
      last = found.index + found[0].length
    }
    if (last < part.length) out.push(el('span', undefined, part.slice(last)))
  }
  for (const found of text.matchAll(pattern)) {
    if (found.index > from) plain(text.slice(from, found.index))
    const [whole, bold, code, formula, label, href] = found
    if (bold !== undefined) out.push(el('strong', undefined, bold))
    else if (code !== undefined) {
      const cite = new RegExp(`^${CITATION.source}$`).exec(code)
      out.push(cite && fileOf(cite[1]) ? citation(cite[1], cite[2], cite[3]) : el('code', undefined, code))
    } else if (formula !== undefined) out.push(math(formula, false))
    else if (label !== undefined) {
      const link = el('a', 'link', label)
      link.addEventListener('click', () => vscode.postMessage({ type: 'link', href }))
      out.push(link)
    } else out.push(el('span', undefined, whole))
    from = found.index + whole.length
  }
  if (from < text.length) plain(text.slice(from))
  return out
}

function table(lines: string[]): HTMLElement {
  const made = el('table', 'md-table')
  let head = true
  for (const row of lines) {
    if (/^\s*\|[\s|:-]+\|\s*$/.test(row)) { head = false; continue }
    const tr = el('tr')
    for (const cell of row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')) {
      const td = el(head ? 'th' : 'td')
      for (const part of inline(cell.trim())) td.append(part)
      tr.append(td)
    }
    made.append(tr)
  }
  return made
}

function list(lines: string[]): HTMLElement {
  const made = el(/^\s*\d+[.)]\s/.test(lines[0]) ? 'ol' : 'ul', 'md-list')
  let item: HTMLElement | undefined
  for (const line of lines) {
    if (BULLET.test(line)) {
      item = el('li')
      // An indented bullet is a bullet under the one above it; shown as one
      // level, because two levels of indent in a webview read as noise.
      if (/^\s{2,}/.test(line)) item.className = 'under'
      for (const part of inline(line.replace(BULLET, ''))) item.append(part)
      made.append(item)
    } else if (item && line.trim()) {
      for (const part of inline(` ${line.trim()}`)) item.append(part)
    }
  }
  return made
}

// ── the steps of one scenario ───────────────────────────────────────────────

const whereOf = (step: Step): string =>
  `${step.file}:${step.spans.map(s => (s.from === s.to ? `${s.from}` : `${s.from}-${s.to}`)).join(', ')}`

/**
 * The control under a scenario heading: how many steps there are, what each
 * one is, and a way into any of them.
 *
 * Open by default — the whole complaint about the lens was that "6 steps" told
 * you nothing about what those six were — and closable per scenario, which is
 * remembered.
 */
function walkCard(walk: Walk): HTMLElement {
  const card = el('div', 'walk')
  card.dataset.id = walk.id

  const bar = el('div', 'walk-bar')
  const fold = el('button', 'fold')
  fold.title = walk.id
  bar.append(fold)
  card.append(bar)

  const steps = el('ol', 'steps')
  for (const [index, step] of walk.steps.entries()) {
    const row = el('li', 'step')
    row.append(el('span', 'n', `${index + 1}`))
    const body = el('div', 'body')
    const head = el('div', 'head')
    head.append(el('span', 'cycle', step.cycle))
    head.append(el('span', 'where', whereOf(step)))
    body.append(head)
    const said = el('div', 'said')
    for (const part of inline(step.said)) said.append(part)
    body.append(said)
    row.append(body)
    row.addEventListener('click', () => vscode.postMessage({ type: 'walk', id: walk.id, index }))
    steps.append(row)
  }
  card.append(steps)

  // Opening or closing a scenario changes that scenario and nothing else.
  // Redrawing the page for it threw the reader back to the top of the
  // document, which is the one thing a fold must never do.
  fold.addEventListener('click', () => {
    if (closed.has(walk.id)) closed.delete(walk.id)
    else closed.add(walk.id)
    vscode.setState({ closed: [...closed] })
    showFold(walk.id)
  })

  shown.set(walk.id, { card, bar, steps, walk })
  showFold(walk.id)
  markWalk(walk.id)
  return card
}

/** The open/closed half of a card, applied where it stands. */
function showFold(id: string): void {
  const found = shown.get(id)
  if (!found) return
  const open = !closed.has(id)
  found.steps.hidden = !open
  const fold = found.bar.children[0] as HTMLElement | undefined
  if (fold) fold.textContent = open ? '▾' : '▸'
}

/**
 * Where the walk is, applied where the cards stand.
 *
 * Also in place rather than by redrawing: a step arriving from the editors
 * must not move the document the reader is holding their place in.
 */
function markWalk(only?: string): void {
  for (const [id, found] of shown) {
    if (only !== undefined && id !== only) continue
    const live = at?.id === id
    found.card.classList.toggle('live', live)

    // The bar is rebuilt — it gains ◀ ▶ ■ while this scenario is the one being
    // walked — but only this bar, and only when what it says has changed.
    const want = live && at ? `${at.index + 1}/${at.total}` : ''
    if (found.bar.dataset.now === want) continue
    found.bar.dataset.now = want
    const fold = found.bar.children[0]
    found.bar.replaceChildren(fold)
    const go = el('button', 'go', `▶ ${words.walk}`)
    go.addEventListener('click', () => vscode.postMessage({ type: 'walk', id, index: 0 }))
    found.bar.append(go)
    found.bar.append(el('span', 'count', words.steps(found.walk.steps.length)))
    if (live && at) {
      found.bar.append(el('span', 'now', want))
      for (const [label, by] of [['◀', -1], ['▶', 1]] as const) {
        const button = el('button', 'move', label)
        // A step that does not exist is not offered: there is nothing before
        // the first, and nothing after the last.
        button.disabled = by < 0 ? at.index === 0 : at.index + 1 >= at.total
        button.addEventListener('click', () => vscode.postMessage({ type: 'step', by }))
        found.bar.append(button)
      }
      // An icon, not a word: the bar has to fit a narrow panel on one row.
      const stop = el('button', 'stop', '■')
      stop.title = words.stop
      stop.addEventListener('click', () => vscode.postMessage({ type: 'stop' }))
      found.bar.append(stop)
    }
  }
  // And the row itself.
  for (const [id, found] of shown) {
    if (only !== undefined && id !== only) continue
    for (let index = 0; index < found.steps.children.length; index += 1) {
      const row = found.steps.children[index] as HTMLElement
      row.classList.toggle('now', at?.id === id && at.index === index)
    }
  }
  // Bring the step into view only if it is not already there: `nearest` leaves
  // a visible row alone, so clicking a row does not scroll under the hand.
  if (at) {
    const found = shown.get(at.id)
    const row = found?.steps.children[at.index] as HTMLElement | undefined
    if (row && !found?.steps.hidden) row.scrollIntoView?.({ block: 'nearest' })
  }
}

// ── putting the page together ───────────────────────────────────────────────

let text = ''
let name = ''
/** The cards on screen, so a fold or a step can change one in place. */
const shown = new Map<string, { card: HTMLElement; bar: HTMLElement; steps: HTMLElement; walk: Walk }>()

const idIn = (heading: string): string | undefined =>
  /^([A-Z]{1,4}-[NE]\d+)[.\s]/.exec(heading.trim())?.[1]

function draw(): void {
  // A document rewritten under the reader (an agent writing it in another
  // window) should come back where they were standing in it.
  const was = (document.body.querySelector?.('.spec-doc') as HTMLElement | undefined)?.scrollTop ?? 0
  shown.clear()
  document.body.replaceChildren()

  const bar = el('div', 'spec-bar')
  bar.append(el('span', 'name', name))
  bar.append(el('span', 'spacer'))
  const source = el('button', 'plain', words.source)
  source.addEventListener('click', () => vscode.postMessage({ type: 'source' }))
  bar.append(source)
  document.body.append(bar)

  const doc = el('div', 'spec-doc')
  document.body.append(doc)

  const lines = text.split('\n')
  let fenced = false
  let pending: { kind: 'table' | 'list' | 'para' | 'code'; lines: string[] } | undefined
  const flush = () => {
    if (!pending) return
    if (pending.kind === 'table') doc.append(table(pending.lines))
    else if (pending.kind === 'list') doc.append(list(pending.lines))
    else if (pending.kind === 'code') {
      const pre = el('pre', 'code')
      pre.textContent = pending.lines.join('\n')
      doc.append(pre)
    } else {
      const para = el('p')
      for (const part of inline(pending.lines.join(' '))) para.append(part)
      doc.append(para)
    }
    pending = undefined
  }
  const start = (kind: 'table' | 'list' | 'para' | 'code', line: string) => {
    if (pending?.kind === kind) pending.lines.push(line)
    else {
      flush()
      pending = { kind, lines: [line] }
    }
  }

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (fenced) { flush(); fenced = false } else { flush(); fenced = true; pending = { kind: 'code', lines: [] } }
      continue
    }
    if (fenced) { pending?.lines.push(line); continue }
    if (!line.trim()) { flush(); continue }

    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      const level = Math.min(heading[1].length, 4)
      const head = el(`h${level}` as 'h1', 'head')
      for (const part of inline(heading[2])) head.append(part)
      doc.append(head)
      const id = idIn(heading[2])
      const walk = id ? walks.find(w => w.id === id) : undefined
      if (walk) doc.append(walkCard(walk))
      continue
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); doc.append(el('hr')); continue }
    if (line.trimStart().startsWith('|')) { start('table', line); continue }
    if (BULLET.test(line) || (pending?.kind === 'list' && /^\s{2,}\S/.test(line))) { start('list', line); continue }
    if (line.trimStart().startsWith('>')) { start('para', line.replace(/^\s*>\s?/, '')); continue }
    start('para', line)
  }
  flush()
  if (walks.length === 0) doc.append(el('p', 'nothing', words.nothing))
  if (was > 0) doc.scrollTop = was
}

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as {
    type?: string
    text?: string
    name?: string
    walks?: Walk[]
    prefixes?: Record<string, string>
    at?: At
    lang?: 'ko' | 'en'
  }
  if (message.type === 'spec') {
    text = message.text ?? ''
    name = message.name ?? ''
    walks = message.walks ?? []
    prefixes = message.prefixes ?? {}
    words = WORDS[message.lang ?? 'en']
    at = message.at
    draw()
  } else if (message.type === 'at') {
    at = message.at
    markWalk()
  }
})

vscode.postMessage({ type: 'ready' })
