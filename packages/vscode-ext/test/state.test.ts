import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FILTER_PRESETS } from '@rtlgraph/ir'
import { fitViewport, normalizeFilter, presetOf, toggleFlow, toggleTime, zoomAt } from '../src/webview/state.ts'

test('every preset is recognised from its filter', () => {
  for (const [key, filter] of Object.entries(FILTER_PRESETS)) assert.equal(presetOf(filter), key)
  assert.equal(presetOf({ flow: ['control'], time: ['seq'] }), undefined)
})

test('toggles keep canonical order and never empty an axis', () => {
  const all = FILTER_PRESETS.all
  assert.deepEqual(toggleFlow(all, 'data'), { flow: ['control'], time: ['comb', 'seq'] })
  assert.deepEqual(toggleFlow({ flow: ['control'], time: ['seq'] }, 'data'), { flow: ['data', 'control'], time: ['seq'] })
  assert.deepEqual(toggleFlow({ flow: ['data'], time: ['seq'] }, 'data'), { flow: ['data'], time: ['seq'] })
  assert.deepEqual(toggleTime(all, 'seq'), { flow: ['data', 'control'], time: ['comb'] })
  assert.deepEqual(toggleTime({ flow: ['data'], time: ['comb'] }, 'comb'), { flow: ['data'], time: ['comb'] })
  assert.equal(presetOf(toggleFlow(all, 'control')), 'datapath')
})

test('stored filters are sanitised', () => {
  assert.deepEqual(normalizeFilter({ flow: ['control', 'data', 'junk'], time: ['seq'] }), { flow: ['data', 'control'], time: ['seq'] })
  assert.equal(normalizeFilter({ flow: [], time: ['seq'] }), undefined)
  assert.equal(normalizeFilter({ flow: ['data'] }), undefined)
  assert.equal(normalizeFilter('all'), undefined)
  assert.equal(normalizeFilter(null), undefined)
})

test('zooming keeps the point under the cursor fixed', () => {
  const v = zoomAt({ x: 10, y: 20, zoom: 1 }, 2, 110, 70)
  assert.equal(v.zoom, 2)
  // content point under (110, 70) before: ((110-10)/1, (70-20)/1) = (100, 50)
  assert.deepEqual([(110 - v.x) / v.zoom, (70 - v.y) / v.zoom], [100, 50])
  assert.equal(zoomAt({ x: 0, y: 0, zoom: 7 }, 10, 0, 0).zoom, 8)
})

test('fit centres the content and caps the zoom', () => {
  const v = fitViewport(400, 200, 832, 832)
  assert.equal(v.zoom, 1.5)
  assert.deepEqual([v.x, v.y], [(832 - 600) / 2, (832 - 300) / 2])
  assert.deepEqual(fitViewport(0, 10, 100, 100), { x: 0, y: 0, zoom: 1 })
})
