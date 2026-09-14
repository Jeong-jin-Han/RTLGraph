import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILTER_PRESETS, type ComponentGraph, type FilterPreset } from '@rtlgraph/ir'
import { renderSvg } from '../src/index.ts'

const DEMO = join(import.meta.dirname, '../../../demo/acc')
const graph = JSON.parse(readFileSync(join(DEMO, 'acc_top.rtlgraph.json'), 'utf8')) as ComponentGraph
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

// Golden SVGs: regenerate with `npm run golden` after an intended visual change.
for (const preset of ['all', 'datapath'] as const) {
  test(`matches the golden ${preset} SVG`, () => {
    const file = join(DEMO, preset === 'all' ? 'acc_top.svg' : `acc_top.${preset}.svg`)
    const svg = render(preset)
    if (process.env.UPDATE_GOLDEN) writeFileSync(file, svg)
    assert.equal(svg, readFileSync(file, 'utf8'))
  })
}
