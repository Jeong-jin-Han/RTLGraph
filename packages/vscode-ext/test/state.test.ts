import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FILTER_PRESETS } from '@rtlgraph/ir'
import type { ComponentGraph, HierarchyEntry } from '@rtlgraph/ir'
import {
  applyFold, componentInstances, defaultUnfolded, fitViewport, isInstanceShown, normalizeFilter, normalizeUnfolded,
  presetOf, toggleFlow, toggleTime, zoomAt,
} from '../src/webview/state.ts'

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

// root ─ u_a ─ u_a/u_x ─ u_a/u_x/u_deep
//      └ u_b
const entry = (instance: string, kind: 'system' | 'component', children: HierarchyEntry[] = []): HierarchyEntry => ({
  path: `${instance || 'root'}.json`,
  instance,
  graph: { kind } as ComponentGraph,
  children: Object.fromEntries(children.map(c => [c.instance.split('/').pop()!, c])),
})
const tree = entry('', 'system', [
  entry('u_a', 'component', [entry('u_a/u_x', 'component', [entry('u_a/u_x/u_deep', 'component')])]),
  entry('u_b', 'component'),
])
const ALL = componentInstances(tree)

test('instances are listed parents first', () => {
  assert.deepEqual(ALL, ['u_a', 'u_a/u_x', 'u_a/u_x/u_deep', 'u_b'])
})

test('with nothing selected, fold and unfold act on the whole hierarchy', () => {
  assert.deepEqual(applyFold([], ALL, 'unfold', 'all'), ALL)
  assert.deepEqual(applyFold(ALL, ALL, 'fold', 'all'), [])
  assert.deepEqual(applyFold(['u_b'], ALL, 'unfold', 'node'), ALL) // no instance: whole hierarchy
})

test('a selected box folds alone or with everything inside', () => {
  assert.deepEqual(applyFold(ALL, ALL, 'fold', 'node', 'u_a'), ['u_a/u_x', 'u_a/u_x/u_deep', 'u_b'])
  assert.deepEqual(applyFold(ALL, ALL, 'fold', 'descendants', 'u_a'), ['u_b'])
  assert.deepEqual(applyFold([], ALL, 'unfold', 'node', 'u_a'), ['u_a'])
  assert.deepEqual(applyFold([], ALL, 'unfold', 'descendants', 'u_a'), ['u_a', 'u_a/u_x', 'u_a/u_x/u_deep'])
})

test('folding a box keeps what was open inside it for next time', () => {
  const folded = applyFold(ALL, ALL, 'fold', 'node', 'u_a')
  assert.ok(!isInstanceShown('u_a/u_x', folded))
  assert.deepEqual(applyFold(folded, ALL, 'unfold', 'node', 'u_a'), ALL)
})

test('unfolding a nested box opens the way to it', () => {
  assert.deepEqual(applyFold([], ALL, 'unfold', 'node', 'u_a/u_x/u_deep'), ['u_a', 'u_a/u_x', 'u_a/u_x/u_deep'])
  assert.ok(isInstanceShown('u_a/u_x/u_deep', ['u_a', 'u_a/u_x']))
  assert.ok(!isInstanceShown('u_a/u_x/u_deep', ['u_a/u_x']))
  assert.ok(isInstanceShown('u_b', []))
})

test('a root wrapping one main component opens it by default', () => {
  assert.deepEqual(defaultUnfolded(tree), [])
  assert.deepEqual(defaultUnfolded(entry('', 'system', [entry('u_main', 'component')])), ['u_main'])
  assert.deepEqual(defaultUnfolded(entry('', 'component', [entry('u_main', 'component')])), [])
})

test('stored fold state is sanitised against the current hierarchy', () => {
  assert.deepEqual(normalizeUnfolded(['u_b', 'gone', 'u_a'], ALL), ['u_a', 'u_b'])
  assert.deepEqual(normalizeUnfolded([], ALL), [])
  assert.equal(normalizeUnfolded('u_a', ALL), undefined)
})
