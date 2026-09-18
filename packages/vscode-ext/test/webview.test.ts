import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeElement, loadWebview, type Harness } from './dom.ts'

// The webview, driven the way a hand drives it. These are the paths that kept
// breaking silently: the right-click menu and what its items do.

const DEMO = join(import.meta.dirname, '../../../demo/pwm')
const read = (path: string) => readFileSync(join(DEMO, path), 'utf8')
const FILES = {
  'pwm_top.rtlgraph.json': read('pwm_top.rtlgraph.json'),
  'pwm/pwm.rtlgraph-schematic.json': read('pwm/pwm.rtlgraph-schematic.json'),
  'pwm/pulse/pulse.rtlgraph-schematic.json': read('pwm/pulse/pulse.rtlgraph-schematic.json'),
  'pwm/pulse/cnt/cnt.rtlgraph-schematic.json': read('pwm/pulse/cnt/cnt.rtlgraph-schematic.json'),
  'pwm/rdy/rdy.rtlgraph-schematic.json': read('pwm/rdy/rdy.rtlgraph-schematic.json'),
}

let ui: Harness | undefined
const webview = async (): Promise<Harness> => {
  if (!ui) {
    ui = await loadWebview(join(import.meta.dirname, '../dist/webview.js'))
    ui.send({ type: 'load', root: 'pwm_top.rtlgraph.json', files: FILES })
  }
  return ui
}

// A right-click that landed on the group of a drawn box.
function rightClickOn(ui: Harness, what: { node?: string; wire?: string }) {
  const canvas = ui.byId('canvas')!
  const target = new FakeElement('rect')
  if (what.node !== undefined) {
    const group = new FakeElement('g')
    group.setAttribute('data-node-id', what.node)
    target.matchesAs['g.node'] = group
    if (what.node === 'pwm') target.matchesAs['g.component'] = group
  }
  if (what.wire !== undefined) {
    const group = new FakeElement('g')
    group.setAttribute('data-signal', what.wire)
    target.matchesAs['g.wire'] = group
  }
  return canvas.dispatch('contextmenu', { target, clientX: 120, clientY: 90 })
}

test('the webview draws the schematic it is sent', async () => {
  const ui = await webview()
  const stage = ui.byId('stage')!
  assert.match(stage.innerHTML, /<svg/)
  assert.match(stage.innerHTML, /data-node-id="pwm"/)
  const rendered = ui.posted.filter((m): m is { type: string; state: { nodes: number } } => (m as { type?: string }).type === 'rendered')
  assert.ok(rendered.length > 0 && rendered[rendered.length - 1].state.nodes > 0)
})

test('right-clicking a box opens the menu, and its items reach the host', async () => {
  const ui = await webview()
  const event = rightClickOn(ui, { node: 'pwm' })
  assert.ok(event.defaultPrevented, 'the browser menu is kept out of the way')

  const menu = ui.byId('menu')!
  assert.equal(menu.hidden, false, 'the menu is open')
  const labels = menu.children.map(child => child.textContent)
  assert.deepEqual(labels, [
    'Open the schematic of pwm',
    'Open the code of pwm',
    'Open the requirement it is here for', // demo/pwm cites its brief
  ])

  ui.posted.length = 0
  ui.clickMenuItem('Open the code of pwm')
  assert.deepEqual(ui.posted, [{ type: 'openSource', node: 'pwm' }])
  assert.equal(ui.byId('menu')!.hidden, true, 'and the menu closes behind it')
})

test('a box with no requirement is not offered one', async () => {
  const ui = await webview()
  rightClickOn(ui, { node: 'pwm/PERIOD_FF' })
  const labels = ui.byId('menu')!.children.map(child => child.textContent)
  assert.deepEqual(labels, ['Open the code of PERIOD_FF'])

  ui.posted.length = 0
  ui.clickMenuItem('Open the code of PERIOD_FF')
  assert.deepEqual(ui.posted, [{ type: 'openSource', node: 'pwm/PERIOD_FF' }])
})

test('right-clicking a net offers its line, and its requirement when it has one', async () => {
  const ui = await webview()
  rightClickOn(ui, { wire: 'RDY' })
  assert.deepEqual(ui.byId('menu')!.children.map(child => child.textContent), [
    'Open the code of RDY',
    'Open the requirement it carries',
  ])
  ui.posted.length = 0
  ui.clickMenuItem('Open the requirement it carries')
  assert.deepEqual(ui.posted, [{ type: 'openSpec', signal: 'RDY' }])
})

test('a press on the canvas closes the menu; a press inside it does not', async () => {
  const ui = await webview()
  const canvas = ui.byId('canvas')!
  rightClickOn(ui, { node: 'pwm' })
  const menu = ui.byId('menu')!

  // The press that lands on a menu button must leave the menu standing, or the
  // button is gone before the click arrives.
  const item = menu.children[0]
  canvas.dispatch('pointerdown', { target: item, button: 0 })
  assert.equal(menu.hidden, false, 'pressing a menu item does not close it first')

  canvas.dispatch('pointerdown', { target: new FakeElement('div'), button: 0 })
  assert.equal(menu.hidden, true, 'pressing the drawing does')
})
