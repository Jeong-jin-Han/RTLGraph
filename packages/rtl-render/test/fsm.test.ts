import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FsmGraph } from '@rtlgraph/ir'
import { buildFsmScene, fsmTable, renderFsmPdf, renderFsmSvg } from '../src/fsm.ts'

const machine = (style: 'moore' | 'mealy' = 'moore'): FsmGraph => ({
  version: '0.1.0',
  kind: 'fsm',
  title: 'pwm',
  created: '2026-01-01T00:00:00.000Z',
  modified: '2026-01-01T00:00:00.000Z',
  source: { root: '.', files: ['pwm.v'], top: 'pwm' },
  machine: { name: 'STATE', style, reset: 'IDLE', outputs: [{ name: 'RDY' }] },
  states: {
    IDLE: { meaning: 'waiting to be set up', encoding: "2'd0", outputs: style === 'moore' ? { RDY: "1'b1" } : undefined },
    RUN: { meaning: 'driving the pulse', encoding: "2'd1", outputs: style === 'moore' ? { RDY: "1'b0" } : undefined },
  },
  transitions: [
    { from: 'IDLE', to: 'RUN', when: 'SET is asserted', guard: 'SET & ~STOP', outputs: style === 'mealy' ? { RDY: "1'b0" } : undefined },
    { from: 'RUN', to: 'IDLE', when: 'STOP is asserted', guard: 'STOP' },
  ],
})

test('states and transitions each get a group the editor can point at', () => {
  const scene = buildFsmScene(machine())
  const classes = scene.groups.map(g => g.className)
  assert.deepEqual(classes, ['fsm-reset', 'fsm-edge', 'fsm-edge', 'fsm-state reset', 'fsm-state'])
  assert.deepEqual(
    scene.groups.filter(g => g.className.startsWith('fsm-state')).map(g => g.attribute.value),
    ['IDLE', 'RUN'],
  )
  // Transitions are drawn first, so a state box covers the end of its wires.
  assert.ok(classes.indexOf('fsm-edge') < classes.indexOf('fsm-state reset'))
  assert.deepEqual(scene.groups[1].attribute, { name: 'data-signal', value: '0' }, 'a transition is named by its index')
})

test('the selected transition is the only one picked out', () => {
  const scene = buildFsmScene(machine(), { selected: 1 })
  const selected = scene.groups.filter(g => g.className.includes('selected'))
  assert.deepEqual(selected.map(g => g.attribute.value), ['1'])
})

test('a state says what the code calls it as well as what it is', () => {
  const svg = renderFsmSvg(machine())
  assert.ok(svg.includes('>IDLE<') && svg.includes(">2'd0<"))
  assert.ok(svg.includes('>SET is asserted<'))
  assert.ok(/<svg[^>]*viewBox="0 0 \d+ \d+"/.test(svg))
})

test('the same diagram goes out as a PDF', () => {
  const pdf = renderFsmPdf(machine())
  assert.ok(pdf.bytes.length > 1000)
  assert.equal(String.fromCharCode(...pdf.bytes.slice(0, 5)), '%PDF-')
})

test('the table reads a Moore machine from its states and a Mealy one from its moves', () => {
  const moore = fsmTable(machine())
  assert.deepEqual(moore[0], {
    index: 0, state: 'IDLE', encoding: "2'd0", when: 'SET is asserted', guard: 'SET & ~STOP',
    next: 'RUN', nextEncoding: "2'd1", outputs: "RDY=1'b0",
  })
  assert.equal(moore[1].outputs, "RDY=1'b1", 'landing back in IDLE drives RDY again')

  const mealy = fsmTable(machine('mealy'))
  assert.equal(mealy[0].outputs, "RDY=1'b0", 'a Mealy machine drives while it moves')
  assert.equal(mealy[1].outputs, '', 'and this move drives nothing')
})
