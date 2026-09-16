import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeLayout, validateComponentGraph } from '../src/index.ts'
import { fixture } from './fixture.ts'

test('without a previous graph everything is added', () => {
  const next = fixture()
  const r = mergeLayout(undefined, next)
  assert.equal(r.graph, next)
  assert.deepEqual(r.added, ['@A', '@CLK', '@Y', 'R_FF', 'dp.u_inc'])
  assert.deepEqual(r.removed, [])
})

test('keeps user positions for surviving ids and reports added/removed nodes', () => {
  const prev = fixture()
  prev.created = '2020-01-01T00:00:00.000Z'
  prev.layout = { grid: 20, nodes: { R_FF: { x: 40, y: 400 }, 'dp.u_inc': { x: 40, y: 240 } } }
  prev.view = { filter: { comb: ['data'], seq: ['reg'] } }

  // Re-extraction after an edit: the incrementer is renamed, positions come back empty.
  const next = fixture()
  next.nodes['dp.u_inc2'] = next.nodes['dp.u_inc']
  delete next.nodes['dp.u_inc']
  next.signals.A.sinks = ['dp.u_inc2:a']
  next.signals.R_D.driver = 'dp.u_inc2:y'
  next.layout = { nodes: { 'dp.u_inc2': { x: 5, y: 5 } } }

  const r = mergeLayout(prev, next)
  assert.deepEqual(r.added, ['dp.u_inc2'])
  assert.deepEqual(r.removed, ['dp.u_inc'])
  assert.deepEqual(r.graph.layout, { grid: 20, nodes: { R_FF: { x: 40, y: 400 }, 'dp.u_inc2': { x: 5, y: 5 } } })
  assert.deepEqual(r.graph.view, prev.view)
  assert.equal(r.graph.created, prev.created)
  assert.equal(r.graph.signals, next.signals)
  assert.equal(validateComponentGraph(r.graph).ok, true)
})

test('previous positions win over positions in the new extraction', () => {
  const prev = fixture()
  prev.layout = { nodes: { R_FF: { x: 1, y: 1 } } }
  const next = fixture()
  next.layout = { nodes: { R_FF: { x: 9, y: 9 } } }
  assert.deepEqual(mergeLayout(prev, next).graph.layout?.nodes.R_FF, { x: 1, y: 1 })
})

test('drops collapsed state for groups that no longer exist', () => {
  const prev = fixture()
  prev.groups = { keep: { label: 'K', members: ['R_FF'] }, gone: { label: 'G', members: ['dp.u_inc'] } }
  prev.layout = { nodes: {}, collapsed: ['keep', 'gone'] }
  const next = fixture()
  next.groups = { keep: { label: 'K', members: ['R_FF'] } }
  assert.deepEqual(mergeLayout(prev, next).graph.layout?.collapsed, ['keep'])
})
