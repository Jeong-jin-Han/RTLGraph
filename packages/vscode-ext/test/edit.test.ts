import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ComponentGraph, Layout } from '@rtlgraph/ir'
import {
  belongsToThisFile, cleared, emptyLayout, isArranged, isCut, linkedPair, movedTo, resizedTo, shapedTo,
  cornerFor, linkDecision, turnedAt, vertexAt, withCut, withLink, withoutCut, withoutLink,
} from '../src/webview/edit.ts'

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

test('a right-click turns the corner under the hand the other way round', () => {
  // along, then down: (0,0) → (40,0) → (40,30)
  const elbow = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }]
  const turned = turnedAt(elbow, { x: 40, y: 0 }, 8)
  assert.deepEqual(turned, [{ x: 0, y: 0 }, { x: 0, y: 30 }, { x: 40, y: 30 }], 'down, then along')
  assert.deepEqual(turnedAt(turned, { x: 0, y: 30 }, 8), elbow, 'and back again')
})

test('a click between corners turns the nearest one, not the first', () => {
  //  (0,0) → (20,0) → (20,30) → (60,30): corners at (20,0) and (20,30)
  const zig = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 60, y: 30 }]
  assert.equal(cornerFor(zig, { x: 55, y: 30 }, 4), 2, 'the far end of the last run belongs to the corner it starts at')
  assert.equal(cornerFor(zig, { x: 5, y: 0 }, 4), 1)
  // A straight run has no corner to turn, so it is left alone.
  const straight = [{ x: 0, y: 0 }, { x: 40, y: 0 }]
  assert.equal(cornerFor(straight, { x: 20, y: 0 }, 8), undefined)
  assert.deepEqual(turnedAt(straight, { x: 20, y: 0 }, 8), straight)
})

test('the pins at the ends are never taken for a corner', () => {
  const elbow = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }]
  assert.equal(vertexAt(elbow, { x: 0, y: 0 }, 8), undefined)
  assert.equal(vertexAt(elbow, { x: 40, y: 0 }, 8), 1)
  assert.equal(vertexAt(elbow, { x: 20, y: 0 }, 8), undefined, 'the middle of a run is not a corner')
})

test('a link the reader drew is kept apart from the nets of the RTL', () => {
  const drawn = withLink(emptyLayout(), 'CNT_FF:Q', 'data_path.u_inc:a')
  assert.deepEqual(drawn.links, [{ from: 'CNT_FF:Q', to: 'data_path.u_inc:a' }])
  assert.ok(linkedPair(drawn, 'CNT_FF:Q', 'data_path.u_inc:a'))
  assert.equal(withLink(drawn, 'CNT_FF:Q', 'data_path.u_inc:a'), drawn, 'drawing it twice changes nothing')
  assert.equal(withLink(emptyLayout(), 'X:a', 'X:a').links, undefined, 'a pin to itself is nothing')

  const shaped = shapedTo(drawn, 'CNT_FF:Q->data_path.u_inc:a', [[{ x: 0, y: 0 }, { x: 10, y: 0 }]])
  const gone = withoutLink(shaped, 'CNT_FF:Q', 'data_path.u_inc:a')
  assert.equal(gone.links, undefined)
  assert.equal(gone.wires, undefined, 'its shape goes with it')
  assert.ok(isArranged(drawn) && !isArranged(gone))
})

// The file the screenshots came from: a register with its two sides, and an
// output port under it.
const inbuf = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../demo/sys/sys/dev/inbuf/inbuf.rtlgraph-schematic.json'), 'utf8'),
) as ComponentGraph

test('drawing a pair the RTL carries brings a cut wire back', () => {
  const cut = withCut(emptyLayout(), 'BUF_Q')
  assert.deepEqual(linkDecision(inbuf, cut, 'BUF_FF:Q', '@DOUT'), { kind: 'uncut', net: 'BUF_Q' })
  assert.deepEqual(linkDecision(inbuf, cut, '@DOUT', 'BUF_FF:Q'), { kind: 'uncut', net: 'BUF_Q' }, 'either way round')
})

test('and says what stopped it when it cannot', () => {
  const nothing = emptyLayout()
  // Two sinks: the clock input on the right, and an output port below.
  const both = linkDecision(inbuf, nothing, 'BUF_FF:CLK', '@DOUT')
  assert.equal(both.kind, 'none')
  assert.match((both as { why: string }).why, /both of those pins read/)

  const already = linkDecision(inbuf, nothing, 'BUF_FF:Q', '@DOUT')
  assert.deepEqual(already, { kind: 'none', why: 'BUF_Q already carries BUF_FF:Q to @DOUT' })
  assert.deepEqual(linkDecision(inbuf, nothing, '@DOUT', '@DOUT'), { kind: 'none', why: 'a pin cannot be linked to itself' })
  assert.match((linkDecision(inbuf, nothing, 'BUF_FF:Q', 'nobody:D') as { why: string }).why, /not in this file/)
})

test('a pair the RTL has no net for becomes a link of the reader, once', () => {
  const drawn = linkDecision(inbuf, emptyLayout(), '@EN', 'BUF_FF:D')
  assert.deepEqual(drawn, { kind: 'link', from: '@EN', to: 'BUF_FF:D' })
  const after = withLink(emptyLayout(), '@EN', 'BUF_FF:D')
  assert.deepEqual(linkDecision(inbuf, after, '@EN', 'BUF_FF:D'), { kind: 'none', why: 'that link is already drawn' })
})
