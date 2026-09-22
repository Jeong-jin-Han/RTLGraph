// Just enough DOM to run the webview bundle under node.
//
// The webview is where the fiddly half of this extension lives — what a press,
// a right-click or a drag does — and it kept breaking in ways the other tests
// could not see (a menu that opened and swallowed its own clicks, a right-click
// that stopped reaching anything). This is not a browser; it is the handful of
// things `main.ts` actually touches, so those paths can be exercised.

export class FakeElement {
  tag: string
  parent: FakeElement | undefined
  children: FakeElement[] = []
  attributes = new Map<string, string>()
  dataset: Record<string, string> = {}
  style: Record<string, string> = {}
  listeners = new Map<string, ((event: FakeEvent) => void)[]>()
  textContent = ''
  innerHTML = ''
  hidden = false
  disabled = false
  title = ''
  type = ''
  value = ''
  // what closest() answers with, keyed by selector — the tests say what a click landed on
  matchesAs: Record<string, FakeElement | null> = {}

  constructor(tag: string) {
    this.tag = tag
  }

  get className(): string {
    return this.attributes.get('class') ?? ''
  }

  set className(value: string) {
    this.attributes.set('class', value)
  }

  get classList() {
    return {
      add: (name: string) => this.className = [...new Set([...this.className.split(' ').filter(Boolean), name])].join(' '),
      remove: (name: string) => this.className = this.className.split(' ').filter(c => c && c !== name).join(' '),
      toggle: (name: string, on?: boolean) => (on ?? !this.className.includes(name))
        ? this.classList.add(name)
        : this.classList.remove(name),
      contains: (name: string) => this.className.split(' ').includes(name),
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  append(...items: (FakeElement | string)[]): void {
    for (const item of items) {
      if (typeof item === 'string') this.textContent += item
      else {
        item.parent = this
        this.children.push(item)
      }
    }
  }

  replaceChildren(...items: (FakeElement | string)[]): void {
    this.children = []
    this.textContent = ''
    this.append(...items)
  }

  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this)
    this.parent = undefined
  }

  contains(other: FakeElement | null | undefined): boolean {
    for (let at = other; at; at = at.parent) if (at === this) return true
    return false
  }

  closest(selector: string): FakeElement | null {
    return this.matchesAs[selector] ?? null
  }

  // Enough to count what was drawn: the scene arrives as a string of SVG, so the
  // selectors the webview counts with are answered from it.
  querySelectorAll(selector: string): FakeElement[] {
    const many = (re: RegExp) => Array.from(this.innerHTML.match(re) ?? [], () => new FakeElement('g'))
    if (selector === '[data-node-id]') return many(/data-node-id="/g)
    if (selector === '[data-signal]') return many(/data-signal="/g)
    if (selector === '.dim') return many(/class="[^"]*\bdim\b/g)
    return []
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }
  }

  setPointerCapture(): void {}
  releasePointerCapture(): void {}

  addEventListener(type: string, handler: (event: FakeEvent) => void, options?: { once?: boolean }): void {
    const wrapped = options?.once
      ? (event: FakeEvent) => {
          this.removeEventListener(type, wrapped)
          handler(event)
        }
      : handler
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), wrapped])
  }

  removeEventListener(type: string, handler: (event: FakeEvent) => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter(h => h !== handler))
  }

  dispatch(type: string, event: Partial<FakeEvent> = {}): FakeEvent {
    const full: FakeEvent = {
      type,
      target: this,
      button: 0,
      clientX: 0,
      clientY: 0,
      deltaY: 0,
      key: '',
      pointerId: 1,
      defaultPrevented: false,
      preventDefault() {
        full.defaultPrevented = true
      },
      stopPropagation() {
        full.propagationStopped = true
      },
      ...event,
    }
    for (const handler of [...(this.listeners.get(type) ?? [])]) handler(full)
    return full
  }

  // Depth-first search for a descendant, for tests that look for what was drawn.
  /** Every descendant the predicate accepts, in document order. */
  findAll(predicate: (element: FakeElement) => boolean): FakeElement[] {
    const found: FakeElement[] = []
    for (const child of this.children) {
      if (predicate(child)) found.push(child)
      found.push(...child.findAll(predicate))
    }
    return found
  }

  find(predicate: (element: FakeElement) => boolean): FakeElement | undefined {
    for (const child of this.children) {
      if (predicate(child)) return child
      const deeper = child.find(predicate)
      if (deeper) return deeper
    }
    return undefined
  }
}

export interface FakeEvent {
  type: string
  target: FakeElement | null
  /** A handler that stops a click reaching the row behind it calls this. */
  stopPropagation(): void
  propagationStopped?: boolean
  button: number
  clientX: number
  clientY: number
  deltaY: number
  key: string
  pointerId: number
  defaultPrevented: boolean
  preventDefault(): void
}

export interface Harness {
  body: FakeElement
  posted: unknown[]
  state: unknown
  send(message: unknown): void
  byId(id: string): FakeElement | undefined
  clickMenuItem(label: string): void
}

// Installs the globals the bundle expects, then loads it. The bundle runs once
// per process, so each test file gets its own harness through a fresh import.
export async function loadWebview(bundlePath: string): Promise<Harness> {
  const body = new FakeElement('body')
  const posted: unknown[] = []
  let state: unknown
  const listeners: ((event: { data: unknown }) => void)[] = []

  const g = globalThis as Record<string, unknown>
  g.document = {
    body,
    createElement: (tag: string) => new FakeElement(tag),
    createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
    elementFromPoint: () => null,
  }
  g.window = {
    addEventListener: (type: string, handler: (event: { data: unknown }) => void) => {
      if (type === 'message') listeners.push(handler)
    },
  }
  g.ResizeObserver = class {
    observe(): void {}
    disconnect(): void {}
  }
  g.acquireVsCodeApi = () => ({
    postMessage: (message: unknown) => posted.push(message),
    getState: () => state,
    setState: (next: unknown) => (state = next),
  })
  g.setTimeout = globalThis.setTimeout
  // `instanceof Element` / `instanceof Node` is how the webview tells a target
  // from nothing; in here they are the same fake.
  g.Element = FakeElement
  g.Node = FakeElement

  await import(bundlePath)

  const byId = (id: string) => body.find(element => element.attributes.get('id') === id || (element as { id?: string }).id === id)
  return {
    body,
    posted,
    get state() {
      return state
    },
    send: (message: unknown) => listeners.forEach(handler => handler({ data: message })),
    byId,
    clickMenuItem: (label: string) => {
      const menu = byId('menu')
      if (!menu) throw new Error('no menu is open')
      const item = menu.children.find(child => child.textContent === label)
      if (!item) throw new Error(`the menu has no "${label}" — it has ${menu.children.map(c => c.textContent).join(' | ')}`)
      item.dispatch('click')
    },
  }
}
