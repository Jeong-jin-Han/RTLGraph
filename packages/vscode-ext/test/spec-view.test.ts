import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prefixesIn, walksIn } from '../src/spec/steps.ts'
import { loadWebview, type FakeElement, type Harness } from './dom.ts'

// The specification reader, driven the way the host drives it. It exists
// because the thing a reader wants from a spec — "show me this scenario
// running" — could not be reached from VS Code's own markdown preview.

const BUNDLE = join(import.meta.dirname, '../dist/spec.js')
const SPEC = join(import.meta.dirname, '../../../demo/uart-p01/me/spec')

const payload = () => {
  const prefixes = prefixesIn(readFileSync(join(SPEC, '00-format.md'), 'utf8'))
  const text = readFileSync(join(SPEC, '30-uart_receiver.md'), 'utf8')
  return {
    type: 'spec',
    name: '30-uart_receiver.md',
    text,
    walks: walksIn(text, prefixes),
    prefixes: Object.fromEntries(prefixes),
    at: undefined,
    lang: 'ko',
  }
}

const here = existsSync(BUNDLE) && existsSync(join(SPEC, '00-format.md'))
const skip = !here && 'needs `npm run build -w rtlgraph` and demo/uart-p01'

let ui: Harness | undefined
const webview = async (): Promise<Harness> => (ui ??= await loadWebview(BUNDLE))

const all = (root: FakeElement, className: string): FakeElement[] => {
  const out: FakeElement[] = []
  const walk = (node: FakeElement) => {
    if (node.className.split(' ').includes(className)) out.push(node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return out
}

test('what the host sends can cross into a webview at all', { skip }, () => {
  assert.doesNotThrow(() => structuredClone(payload()))
})

test('a scenario heading carries its steps, not just a count', { skip }, async () => {
  const ui = await webview()
  ui.send(payload())
  const cards = all(ui.body, 'walk')
  assert.ok(cards.length >= 4, `one card per scenario with a table: ${cards.length}`)
  const first = cards[0]
  assert.equal(first.dataset.id, 'RX-N1')

  const steps = all(first, 'step')
  assert.ok(steps.length >= 3, `the steps themselves are listed: ${steps.length}`)
  // Each one says which cycle it is and where in the code it lands, which is
  // what "6 steps" on its own never said.
  const said = steps[0].children.map(c => c.textContent).join(' ')
  assert.match(all(steps[0], 'where')[0].textContent, /uart_receiver\.v:\d+/)
  assert.ok(all(steps[0], 'cycle')[0].textContent.length > 0, `a cycle: ${said}`)
})

test('clicking a step asks the host to walk to exactly that step', { skip }, async () => {
  const ui = await webview()
  ui.send(payload())
  ui.posted.length = 0
  const steps = all(all(ui.body, 'walk')[0], 'step')
  steps[2].listeners.get('click')?.[0]({} as never)
  assert.deepEqual(ui.posted, [{ type: 'walk', id: 'RX-N1', index: 2 }])
})

test('the step being walked is marked, and the buttons appear on that scenario', { skip }, async () => {
  const ui = await webview()
  ui.send({ ...payload(), at: { id: 'RX-N1', index: 1, total: 6 } })
  const card = all(ui.body, 'walk').find(c => c.dataset.id === 'RX-N1')!
  assert.ok(card.className.includes('live'), 'the scenario being walked is the one marked')
  const now = all(card, 'now')
  assert.ok(now.some(n => n.textContent === '2/6'), `where the walk is: ${now.map(n => n.textContent)}`)
  assert.equal(all(card, 'step').filter(s => s.className.includes('now')).length, 1, 'exactly one step is current')
  const moves = all(card, 'move')
  assert.deepEqual(moves.map(m => m.textContent), ['◀', '▶'], 'and it is steppable from here')
  assert.deepEqual(moves.map(m => m.disabled), [false, false], 'both ways, from the middle of a walk')

  ui.posted.length = 0
  moves[1].listeners.get('click')?.[0]({} as never)
  assert.deepEqual(ui.posted, [{ type: 'step', by: 1 }])

  // At either end there is no step that way, so the button is not offered.
  ui.send({ type: 'at', at: { id: 'RX-N1', index: 0, total: 6 } })
  assert.deepEqual(all(card, 'move').map(m => m.disabled), [true, false], 'nothing before the first step')
  ui.send({ type: 'at', at: { id: 'RX-N1', index: 5, total: 6 } })
  assert.deepEqual(all(card, 'move').map(m => m.disabled), [false, true], 'nor after the last')
  ui.send({ type: 'at', at: { id: 'RX-N1', index: 1, total: 6 } })

  // A scenario nobody is walking keeps just its ▶ and its count.
  const other = all(ui.body, 'walk').find(c => c.dataset.id !== 'RX-N1')!
  assert.equal(all(other, 'move').length, 0)
})

test('a citation anywhere in the document is a way into the code', { skip }, async () => {
  const ui = await webview()
  ui.send(payload())
  const cites = all(ui.body, 'cite')
  assert.ok(cites.length > 20, `the document is full of them: ${cites.length}`)
  ui.posted.length = 0
  cites[0].listeners.get('click')?.[0]({} as never)
  const [sent] = ui.posted as { type: string; file: string; line: number }[]
  assert.equal(sent.type, 'open')
  assert.match(sent.file, /\.s?v$/)
  assert.ok(sent.line > 0)
})

test('a scenario can be folded away and stays folded', { skip }, async () => {
  const ui = await webview()
  ui.send(payload())
  const card = () => all(ui.body, 'walk').find(c => c.dataset.id === 'RX-N1')!
  assert.equal(all(card(), 'steps')[0].hidden, false, 'open to start with: the steps are the point')
  all(card(), 'fold')[0].listeners.get('click')?.[0]({} as never)
  assert.equal(all(card(), 'steps')[0].hidden, true)
  // and the choice survives the document being rewritten under it
  ui.send(payload())
  assert.equal(all(card(), 'steps')[0].hidden, true, 'a fold the reader closed stays closed')
  all(card(), 'fold')[0].listeners.get('click')?.[0]({} as never)
  assert.equal(all(card(), 'steps')[0].hidden, false)
})

// Folding a scenario used to redraw the page, which threw the reader back to
// the top of the document every time they opened or closed one.
test('folding a scenario, or stepping, leaves the document where it was', { skip }, async () => {
  const ui = await webview()
  ui.send(payload())
  const doc = () => all(ui.body, 'spec-doc')[0]
  const was = doc()
  const card = () => all(ui.body, 'walk').find(c => c.dataset.id === 'RX-N1')!

  all(card(), 'fold')[0].listeners.get('click')?.[0]({} as never)
  assert.equal(doc(), was, 'the page is not rebuilt to fold one scenario')
  assert.equal(all(card(), 'steps')[0].hidden, true)

  const steps = all(card(), 'steps')[0]
  ui.send({ type: 'at', at: { id: 'RX-N1', index: 3, total: 6 } })
  assert.equal(doc(), was, 'nor to mark where the walk has got to')
  assert.equal(all(card(), 'steps')[0], steps, 'the step rows are the same rows')
  assert.ok(card().className.includes('live'))
  assert.ok(all(card(), 'now').some(n => n.textContent === '4/6'), 'and the bar says where it is')

  all(card(), 'fold')[0].listeners.get('click')?.[0]({} as never)
  assert.equal(all(card(), 'steps')[0].hidden, false)
})

test('the document itself is rendered, headings and tables and all', { skip }, async () => {
  const ui = await webview()
  ui.send(payload())
  const doc = all(ui.body, 'spec-doc')[0]
  const tags = (tag: string) => {
    const out: FakeElement[] = []
    const walk = (node: FakeElement) => {
      if (node.tag === tag) out.push(node)
      for (const child of node.children) walk(child)
    }
    walk(doc)
    return out
  }
  assert.ok(tags('h2').length >= 5, `the six sections: ${tags('h2').map(h => h.textContent)}`)
  assert.ok(tags('table').length >= 4, 'the path tables are tables')
  assert.ok(tags('li').length > 10, 'and the lists are lists')
})
