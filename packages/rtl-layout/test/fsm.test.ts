import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FsmGraph } from '@rtlgraph/ir'
import { layoutFsm, resetStub } from '../src/fsm.ts'

// IDLE -> ARMED -> RUN, with RUN holding itself and a way back to IDLE: one of
// each kind of edge (forward, self, backward).
const machine = (): FsmGraph => ({
  version: '0.1.0',
  kind: 'fsm',
  title: 'pwm',
  created: '2026-01-01T00:00:00.000Z',
  modified: '2026-01-01T00:00:00.000Z',
  source: { root: '.', files: ['pwm.v'], top: 'pwm' },
  machine: { name: 'STATE', style: 'moore', reset: 'IDLE' },
  states: {
    IDLE: { meaning: 'waiting to be set up', encoding: "2'd0" },
    ARMED: { meaning: 'period and duty are loaded', encoding: "2'd1" },
    RUN: { meaning: 'driving the pulse', encoding: "2'd2" },
  },
  transitions: [
    { from: 'IDLE', to: 'ARMED', when: 'SET is asserted' },
    { from: 'ARMED', to: 'RUN', when: 'the first period begins' },
    { from: 'RUN', to: 'RUN', when: 'the period has not finished' },
    { from: 'RUN', to: 'IDLE', when: 'STOP is asserted' },
  ],
})

const boxOf = (layout: ReturnType<typeof layoutFsm>, id: string) => layout.states.find(s => s.id === id)!

test('states stand in columns of how far they are from reset', () => {
  const layout = layoutFsm(machine())
  const [idle, armed, run] = ['IDLE', 'ARMED', 'RUN'].map(id => boxOf(layout, id))
  assert.ok(idle.x < armed.x && armed.x < run.x, 'left to right from the reset state')
  assert.deepEqual([idle.y, armed.y, run.y], [idle.y, idle.y, idle.y], 'one per column, so one row')
  assert.ok(idle.reset && !armed.reset)
  assert.ok(layout.width > run.x + run.w, 'the last column fits inside the page')
})

test('a state nothing reaches is still drawn, after the ones that are', () => {
  const g = machine()
  g.states.LOST = { meaning: 'never entered; the validator warns about it' }
  const layout = layoutFsm(g)
  assert.ok(boxOf(layout, 'LOST').x >= boxOf(layout, 'RUN').x)
  assert.equal(layout.states.length, 4)
})

test('every transition is drawn with a head at the state it enters', () => {
  const layout = layoutFsm(machine())
  assert.deepEqual(layout.edges.map(e => e.index), [0, 1, 2, 3])
  for (const e of layout.edges) {
    assert.ok(e.segments.length > 0 && e.arrow.length === 3, e.label)
    // Every run is horizontal or vertical: the diagram keeps the schematic's grain.
    for (const s of e.segments) assert.ok(s.x1 === s.x2 || s.y1 === s.y2, e.label)
  }
  const [head] = layout.edges[0].arrow
  const armed = boxOf(layout, 'ARMED')
  assert.deepEqual(head, [armed.x, armed.y + armed.h / 2], 'a forward edge arrives on the left edge')
})

test('a self-loop stands above its state and a return path runs under the diagram', () => {
  const layout = layoutFsm(machine())
  const run = boxOf(layout, 'RUN')
  const loop = layout.edges.find(e => e.from === 'RUN' && e.to === 'RUN')!
  assert.ok(loop.segments.every(s => s.y1 <= run.y && s.y2 <= run.y), 'nothing dips into the box')
  assert.ok(loop.labelAt.y < run.y)

  const back = layout.edges.find(e => e.from === 'RUN' && e.to === 'IDLE')!
  const lane = Math.max(...back.segments.map(s => s.y1))
  assert.ok(lane > run.y + run.h, 'the lane is under every state')
  assert.ok(layout.height > lane, 'and inside the page')
})

test('nothing runs off the page: every label and lane is inside it', () => {
  const layout = layoutFsm(machine())
  for (const e of layout.edges) {
    assert.ok(e.labelAt.y > 0 && e.labelAt.y < layout.height, e.label)
    const half = e.label.length * 3
    assert.ok(e.labelAt.x - half > 0 && e.labelAt.x + half < layout.width, e.label)
  }
  for (const s of layout.states) assert.ok(s.y > 0 && s.x > 0 && s.x + s.w < layout.width)
})

test('the reset arrow points at the state the machine starts in', () => {
  const layout = layoutFsm(machine())
  const idle = boxOf(layout, 'IDLE')
  const { segments, arrow } = resetStub(idle)
  assert.equal(segments[0].y1, idle.y + idle.h / 2)
  assert.ok(segments[0].x1 >= 0, 'the stub stays on the page')
  assert.deepEqual(arrow[0], [idle.x, idle.y + idle.h / 2])
})

// The three machines of demo/pwm, at three depths of one design.
const DEMO_MACHINES = [
  'pwm/pwm/pwm.rtlgraph-fsm.json',
  'pwm/pwm/pulse/pulse.rtlgraph-fsm.json',
  'pwm/pwm/rdy/rdy.rtlgraph-fsm.json',
]

for (const file of DEMO_MACHINES) {
  test(`demo/${file} fits on its page`, () => {
    const graph = JSON.parse(readFileSync(join(import.meta.dirname, '../../../demo', file), 'utf8')) as FsmGraph
    const layout = layoutFsm(graph)
    assert.equal(layout.states.length, Object.keys(graph.states).length)
    assert.equal(layout.edges.length, graph.transitions.length)
    for (const e of layout.edges) {
      const half = e.label.length * 3
      assert.ok(e.labelAt.x - half >= 0 && e.labelAt.x + half <= layout.width, `${e.label} runs off the side`)
      assert.ok(e.labelAt.y > 0 && e.labelAt.y < layout.height, `${e.label} runs off the top or bottom`)
      // A condition written between two columns must not land on a state box.
      const between = layout.states.filter(s => s.y < e.labelAt.y && e.labelAt.y < s.y + s.h)
      for (const s of between) {
        assert.ok(e.labelAt.x + half <= s.x || e.labelAt.x - half >= s.x + s.w, `${e.label} overlaps ${s.id}`)
      }
    }
    for (const s of layout.states) assert.ok(s.x > 0 && s.y > 0 && s.x + s.w < layout.width && s.y + s.h < layout.height)
  })
}
