import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILTER_PRESETS, loadHierarchy, type ComponentGraph, type FilterPreset } from '@rtlgraph/ir'
import { renderHierarchySvg, renderSvg } from '../src/index.ts'

const DEMO = join(import.meta.dirname, '../../../demo/acc/acc')
const graph = JSON.parse(readFileSync(join(DEMO, 'acc.rtlgraph-schematic.json'), 'utf8')) as ComponentGraph
const render = (preset: FilterPreset) => renderSvg(graph, { filter: FILTER_PRESETS[preset] })
const nodeIds = (svg: string) => [...svg.matchAll(/data-node-id="([^"]+)"/g)].map(m => m[1]).sort()
const signalIds = (svg: string) => [...svg.matchAll(/data-signal="([^"]+)"/g)].map(m => m[1]).sort()

test('renders symbols with registry labels', () => {
  const svg = render('all')
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/)
  for (const label of ['+1', 'ADD', 'SUB', 'CNT_FF', 'ACC_FF', 'OUT_FF', 'acc_cp', 'ACC']) {
    assert.ok(svg.includes(`>${label}</text>`), label)
  }
  assert.match(svg, /<polygon /) // the MUX
})

test('datapath preset draws only the slide p.31 elements', () => {
  const svg = render('datapath')
  assert.deepEqual(nodeIds(svg), ['@ACC', 'ACC_FF', 'CNT_FF', 'OUT_FF', 'data_path.u_add', 'data_path.u_inc', 'data_path.u_mux', 'data_path.u_sub'])
  assert.deepEqual(signalIds(svg), ['ACC_D', 'ACC_Q', 'CNT_D', 'CNT_Q', 'OUT_Q', 'data_path.ADD_OUT', 'data_path.SUB_OUT'])
  assert.ok(!svg.includes('stroke-dasharray'))
})

test('control nets are dashed, reset nets red', () => {
  const svg = render('all')
  assert.match(svg, /data-signal="ACC_SEL"><path [^>]*stroke="#2563eb"[^>]*stroke-dasharray/)
  assert.match(svg, /data-signal="RST"><path [^>]*stroke="#dc2626"/)
})

test('crops to the visible part unless asked not to', () => {
  const size = (svg: string) => /viewBox="(-?\d+) (-?\d+) (\d+) (\d+)"/.exec(svg)!.slice(1).map(Number)
  const full = size(renderSvg(graph, { filter: FILTER_PRESETS.datapath, crop: false }))
  const cropped = size(render('datapath'))
  assert.deepEqual(full.slice(0, 2), [0, 0])
  assert.ok(cropped[2] < full[2] && cropped[0] > 0)
})

test('text is escaped', () => {
  const g = structuredClone(graph)
  g.nodes.control_path = { ...g.nodes.control_path, label: 'a<b & "c"' } as typeof g.nodes.control_path
  assert.ok(renderSvg(g).includes('>a&lt;b &amp; &quot;c&quot;</text>'))
})

// ── hierarchy ──
const PROJECT = join(DEMO, '..')
const fromDisk = (path: string) => {
  try {
    return readFileSync(join(PROJECT, path), 'utf8')
  } catch {
    return undefined
  }
}
const root = loadHierarchy('acc_top.rtlgraph.json', fromDisk).root!
const classOf = (svg: string, id: string) => new RegExp(`<g class="([^"]+)" data-node-id="${id}"`).exec(svg)?.[1]

test('a flat schematic draws the same through the hierarchy renderer', () => {
  const flat = loadHierarchy('acc/acc.rtlgraph-schematic.json', fromDisk).root!
  assert.equal(renderHierarchySvg(flat), renderSvg(graph))
})

test('folded, the root shows its ports and one component box', () => {
  const svg = renderHierarchySvg(root)
  assert.deepEqual(nodeIds(svg), ['@ACC', '@MODE', '@RST', '@SHOW', 'acc'])
  assert.equal(classOf(svg, 'acc'), 'node component folded')
  assert.ok(svg.includes('>acc</text>'))
})

test('unfolded, the child is drawn inside the frame under prefixed ids', () => {
  const svg = renderHierarchySvg(root, { isUnfolded: () => true })
  assert.equal(classOf(svg, 'acc'), 'node component unfolded')
  const inner = nodeIds(svg).filter(id => id.startsWith('acc/'))
  assert.deepEqual(inner, nodeIds(render('all')).map(id => `acc/${id}`).sort())
  for (const name of ['acc/ACC_D', 'acc/RST', 'acc/SHOW', 'acc/MODE', 'acc/OUT_Q']) assert.ok(signalIds(svg).includes(name), name)
  assert.equal([...svg.matchAll(/class="wire connector /g)].length, 4) // RST SHOW MODE ACC; CLK is hidden
})

test('fold markers are drawn for the editor only, never in an export', () => {
  const marker = (svg: string) => (svg.match(/width="10" height="10"/g) ?? []).length // the marker box
  const folded = renderHierarchySvg(root)
  const open = renderHierarchySvg(root, { isUnfolded: () => true })
  assert.equal(marker(folded), 0)
  assert.equal(marker(open), 0)
  assert.ok(marker(renderHierarchySvg(root, { controls: true })) > 0)
  assert.ok(marker(renderHierarchySvg(root, { isUnfolded: () => true, controls: true })) > 0)
})

test('an export leaves out a root that only wraps one component', () => {
  const figure = renderHierarchySvg(root, { isUnfolded: () => true, unwrap: true })
  assert.deepEqual(nodeIds(figure), nodeIds(render('all'))) // exactly the component's own schematic
  assert.ok(!figure.includes('data-node-id="acc"'))
  assert.equal(figure.match(/>ACC<\/text>/g)?.length, 1) // one port pill, not the doubled pair

  // Folded, or with something of its own in the root, the root stays.
  assert.ok(renderHierarchySvg(root, { unwrap: true }).includes('data-node-id="acc"'))
  assert.ok(renderHierarchySvg(sysRoot, { isUnfolded: () => true, unwrap: true }).includes('data-node-id="u_host"'))
})

test('an export draws no frame around an open component', () => {
  const open = { isUnfolded: () => true }
  const editor = renderHierarchySvg(sysRoot, open)
  const figure = renderHierarchySvg(sysRoot, { ...open, frames: false })
  for (const name of ['host', 'dev', 'inbuf']) assert.ok(editor.includes(`>${name}</text>`), `the editor titles ${name}`)
  for (const name of ['host', 'dev', 'inbuf']) assert.ok(!figure.includes(`>${name}</text>`), `the figure drops the ${name} panel`)
  // The boxes and wires inside them stay, and so do the connectors across the edge.
  assert.deepEqual(nodeIds(figure), nodeIds(editor))
  assert.deepEqual(signalIds(figure), signalIds(editor))
})

test('the filter applies inside frames, connectors included', () => {
  const svg = renderHierarchySvg(root, { isUnfolded: () => true, filter: FILTER_PRESETS.datapath })
  assert.ok(!svg.includes('stroke-dasharray'))
  assert.ok(nodeIds(svg).includes('acc/data_path.u_mux'))
  assert.ok(!nodeIds(svg).includes('acc/control_path'))
})

// ── three levels: demo/sys ──
const SYS = join(DEMO, '../../sys')
const sysRoot = loadHierarchy('sys_top.rtlgraph.json', (path: string) => {
  try {
    return readFileSync(join(SYS, path), 'utf8')
  } catch {
    return undefined
  }
}).root!

test('ids carry the whole instance path, however deep', () => {
  const svg = renderHierarchySvg(sysRoot, { isUnfolded: () => true })
  for (const id of ['sys', 'sys/u_host', 'sys/u_dev', 'sys/u_dev/u_inbuf', 'sys/u_dev/u_inbuf/BUF_FF', 'sys/u_host/data_path.u_inc']) {
    assert.ok(nodeIds(svg).includes(id), id)
  }
  assert.ok(signalIds(svg).includes('sys/u_dev/u_inbuf/BUF_Q'), 'a net two levels down')
  assert.equal(classOf(svg, 'sys/u_dev/u_inbuf'), 'node component unfolded')

  // Folding a branch hides what is inside it, and only that.
  const inner = renderHierarchySvg(sysRoot, { isUnfolded: i => i !== 'sys/u_dev/u_inbuf' })
  assert.equal(classOf(inner, 'sys/u_dev/u_inbuf'), 'node component folded')
  assert.ok(!nodeIds(inner).some(id => id.startsWith('sys/u_dev/u_inbuf/')))
  assert.ok(nodeIds(inner).includes('sys/u_host/CNT_FF'))
})

// Golden SVGs: regenerate with `npm run golden` after an intended visual change.
for (const preset of ['all', 'datapath'] as const) {
  test(`matches the golden ${preset} SVG`, () => {
    const file = join(DEMO, preset === 'all' ? 'acc.svg' : `acc.${preset}.svg`)
    const svg = render(preset)
    if (process.env.UPDATE_GOLDEN) writeFileSync(file, svg)
    assert.equal(svg, readFileSync(file, 'utf8'))
  })
}

test('matches the golden unfolded root SVG', () => {
  const file = join(PROJECT, 'acc_top.svg')
  const svg = renderHierarchySvg(root, { isUnfolded: () => true })
  if (process.env.UPDATE_GOLDEN) writeFileSync(file, svg)
  assert.equal(svg, readFileSync(file, 'utf8'))
})

test('matches the golden three-level SVG', () => {
  const file = join(SYS, 'sys_top.svg')
  const svg = renderHierarchySvg(sysRoot, { isUnfolded: () => true })
  if (process.env.UPDATE_GOLDEN) writeFileSync(file, svg)
  assert.equal(svg, readFileSync(file, 'utf8'))
})
