import { test } from 'node:test'
import assert from 'node:assert/strict'
import { movedSegment, polylineOf, removedVertex, tidied, type Point } from '../src/webview/edit.ts'

// A wire leaving a pin on the left, stepping down, and arriving on the right.
const path: Point[] = [
  { x: 0, y: 0 },
  { x: 50, y: 0 },
  { x: 50, y: 100 },
  { x: 120, y: 100 },
]
const segmentsOf = (points: Point[]) =>
  points.slice(1).map((p, i) => ({ x1: points[i].x, y1: points[i].y, x2: p.x, y2: p.y }))

test('segments in any order become one ordered path', () => {
  const shuffled = [segmentsOf(path)[2], segmentsOf(path)[0], segmentsOf(path)[1]]
  const found = polylineOf(shuffled)!
  assert.ok(found[0].x === 0 || found[found.length - 1].x === 0)
  assert.deepEqual(found[0].x === 0 ? found : [...found].reverse(), path)
})

test('a net that forks has no single path to drag', () => {
  const fork = [...segmentsOf(path), { x1: 50, y1: 50, x2: 200, y2: 50 }] // a tap in the middle
  assert.equal(polylineOf(fork), undefined)
  assert.equal(polylineOf([]), undefined)
})

test('dragging the middle segment moves it sideways and keeps the corners square', () => {
  const moved = movedSegment(path, 1, 30, 999) // vertical: only x counts
  assert.deepEqual(moved, [
    { x: 0, y: 0 },
    { x: 80, y: 0 },
    { x: 80, y: 100 },
    { x: 120, y: 100 },
  ])
})

test('dragging an end segment grows a corner instead of moving the pin', () => {
  const moved = movedSegment(path, 0, 0, 40) // horizontal at the pin: moves down
  assert.deepEqual(moved[0], { x: 0, y: 0 }, 'the pin stays put')
  assert.deepEqual(moved[1], { x: 0, y: 40 })
  assert.deepEqual(moved[2], { x: 50, y: 40 })
  assert.ok(moved.every((p, i) => i === 0 || p.x === moved[i - 1].x || p.y === moved[i - 1].y), 'still orthogonal')
})

test('taking a corner out routes the other way round, not back to itself', () => {
  // Dropping (50,0) has to send the wire down first and along after.
  assert.deepEqual(removedVertex(path, 1), [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 120, y: 100 }])

  // Where the neighbours already line up, the corner simply goes.
  const stair: Point[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 40, y: 60 }, { x: 90, y: 60 }]
  assert.deepEqual(removedVertex(stair, 2), [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 60 }, { x: 90, y: 60 }])
})

test('the pins themselves cannot be removed', () => {
  assert.deepEqual(removedVertex(path, 0), path)
  assert.deepEqual(removedVertex(path, path.length - 1), path)
})

test('points that repeat or lie on a straight run are dropped', () => {
  assert.deepEqual(tidied([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 50 }, { x: 0, y: 100 }]), [{ x: 0, y: 0 }, { x: 0, y: 100 }])
})
