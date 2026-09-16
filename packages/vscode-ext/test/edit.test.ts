import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Layout } from '@rtlgraph/ir'
import { belongsToThisFile, cleared, emptyLayout, isArranged, isCut, movedTo, resizedTo, shapedTo, withCut, withoutCut } from '../src/webview/edit.ts'

test('only what this file draws can be arranged here', () => {
  assert.ok(belongsToThisFile('CNT_FF'))
  assert.ok(belongsToThisFile('data_path.u_inc')) // a flattened instance is still ours
  assert.ok(!belongsToThisFile('acc/CNT_FF')) // lives in the component's own file
  assert.ok(!belongsToThisFile('sys/u_dev/u_inbuf'))
})

test('moving and resizing round to whole pixels and keep the rest', () => {
  const moved = movedTo(emptyLayout(), 'CNT_FF', 100.4, 20.6)
  assert.deepEqual(moved.nodes, { CNT_FF: { x: 100, y: 21 } })
  const sized = resizedTo(moved, 'acc', 300.2, 180.8)
  assert.deepEqual(sized.sizes, { acc: { w: 300, h: 181 } })
  assert.deepEqual(sized.nodes, { CNT_FF: { x: 100, y: 21 } })
})

test('cutting a wire drops the shape it had, and can be undone', () => {
  const shaped = shapedTo(emptyLayout(), 'CNT_D', [[{ x: 1.2, y: 2 }, { x: 30, y: 2 }]])
  assert.deepEqual(shaped.wires, { CNT_D: { points: [{ x: 1, y: 2 }, { x: 30, y: 2 }] } })

  const cut = withCut(shaped, 'CNT_D')
  assert.ok(isCut(cut, 'CNT_D'))
  assert.equal(cut.wires, undefined, 'a cut wire is not drawn, so its shape is gone')
  assert.equal(withCut(cut, 'CNT_D'), cut, 'cutting twice changes nothing')

  const back = withoutCut(cut, 'CNT_D')
  assert.ok(!isCut(back, 'CNT_D'))
  assert.equal(back.cut, undefined, 'an empty list is left out of the file')
})

test('cuts are stored in a stable order', () => {
  const layout = withCut(withCut(emptyLayout(), 'ZZ'), 'AA')
  assert.deepEqual(layout.cut, ['AA', 'ZZ'])
})

test('an untouched arrangement is empty, and can be cleared back to it', () => {
  assert.ok(!isArranged(undefined))
  assert.ok(!isArranged(emptyLayout()))
  const busy: Layout = withCut(movedTo(emptyLayout(), 'CNT_FF', 1, 2), 'CNT_D')
  assert.ok(isArranged(busy))
  assert.ok(!isArranged(cleared(busy)))
  assert.deepEqual(cleared({ ...busy, grid: 10, collapsed: ['g'] }), { nodes: {}, grid: 10, collapsed: ['g'] })
})

test('a net with several branches keeps one path each', () => {
  const two = shapedTo(emptyLayout(), 'SUM_Q', [
    [{ x: 0, y: 0 }, { x: 40, y: 0 }],
    [{ x: 0, y: 0 }, { x: 0, y: 60 }, { x: 80, y: 60 }],
  ])
  assert.deepEqual(two.wires!.SUM_Q.paths!.length, 2)
  assert.equal(two.wires!.SUM_Q.points, undefined, 'the short form is only for one path')
})
