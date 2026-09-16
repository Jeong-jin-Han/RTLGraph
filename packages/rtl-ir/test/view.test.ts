import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILTER_PRESETS, visibleElements, type ComponentGraph, type FilterPreset } from '../src/index.ts'

const graph = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../demo/acc/acc/acc.rtlgraph-schematic.json'), 'utf8'),
) as ComponentGraph

const lit = (preset: FilterPreset) => {
  const v = visibleElements(graph, FILTER_PRESETS[preset])
  return { nodes: [...v.litNodes].sort(), signals: [...v.litSignals].sort() }
}

test('the filter picks what to light; nothing is taken away', () => {
  for (const preset of Object.keys(FILTER_PRESETS) as FilterPreset[]) {
    const v = visibleElements(graph, FILTER_PRESETS[preset])
    assert.equal(v.nodes.size, Object.keys(graph.nodes).length, preset)
    assert.equal(v.signals.size, Object.keys(graph.signals).length - 1, preset) // CLK is hidden in the file
    assert.ok(!v.signals.has('CLK'), preset)
  }
})

test('all lights everything that is drawn', () => {
  const v = visibleElements(graph, FILTER_PRESETS.all)
  assert.deepEqual([...v.litNodes].sort(), [...v.nodes].sort())
  assert.deepEqual([...v.litSignals].sort(), [...v.signals].sort())
})

test('datapath lights exactly the slide p.31 picture', () => {
  assert.deepEqual(lit('datapath'), {
    nodes: ['@ACC', 'ACC_FF', 'CNT_FF', 'OUT_FF', 'data_path.u_add', 'data_path.u_inc', 'data_path.u_mux', 'data_path.u_sub'],
    signals: ['ACC_D', 'ACC_Q', 'CNT_D', 'CNT_Q', 'OUT_Q', 'data_path.ADD_OUT', 'data_path.SUB_OUT'],
  })
})

test('comb lights the combinational boxes and the nets between them', () => {
  assert.deepEqual(lit('comb'), {
    nodes: ['@MODE', '@RST', '@SHOW', 'control_path', 'data_path.u_add', 'data_path.u_inc', 'data_path.u_mux', 'data_path.u_sub'],
    signals: ['ACC_SEL', 'MODE', 'RST', 'SHOW', 'data_path.ADD_OUT', 'data_path.SUB_OUT'],
  })
})

test('registers lights the registers; a net into one is only half sequential', () => {
  assert.deepEqual(lit('registers'), { nodes: ['@ACC', 'ACC_FF', 'CNT_FF', 'OUT_FF'], signals: ['OUT_Q'] })
})

test('a register holding state is told apart from one holding data', () => {
  // acc keeps its state in the control block, so nothing here is an FSM register.
  assert.deepEqual(lit('fsm'), { nodes: [], signals: [] })

  const machine = structuredClone(graph)
  const register = machine.nodes.CNT_FF as { fsm?: string }
  register.fsm = 'acc.rtlgraph-fsm.json' // now it holds a machine's state
  const v = visibleElements(machine, FILTER_PRESETS.fsm)
  assert.deepEqual([...v.litNodes].sort(), ['CNT_FF'])
  const rest = visibleElements(machine, FILTER_PRESETS.registers)
  assert.deepEqual([...rest.litNodes].sort(), ['@ACC', 'ACC_FF', 'OUT_FF'])
})

test('each group is picked apart on its own: control logic plus plain registers', () => {
  // Comb → control path, Seq → the registers that hold data. Neither group's
  // kinds mean anything in the other: "control" here is a block of logic, and
  // the registers it steers are still plain registers.
  const v = visibleElements(graph, { comb: ['control'], seq: ['reg'] })
  assert.deepEqual([...v.litNodes].sort(), ['@ACC', '@MODE', '@RST', '@SHOW', 'ACC_FF', 'CNT_FF', 'OUT_FF', 'control_path'])
  assert.deepEqual([...v.litSignals].sort(), ['ACC_RST', 'CNT_RST', 'MODE', 'OUT_EN', 'OUT_Q', 'OUT_RST', 'RST', 'SHOW'])
})

test('a group switched off lights nothing of its own', () => {
  const combOff = visibleElements(graph, { comb: [], seq: ['reg', 'fsm'] })
  assert.ok(![...combOff.litNodes].some(id => (graph.nodes[id] as { time?: string }).time === 'comb'))
  const seqOff = visibleElements(graph, FILTER_PRESETS.comb)
  assert.ok(![...seqOff.litNodes].some(id => graph.nodes[id].kind === 'reg'))
})

test('controlpath lights the control block and its inputs', () => {
  assert.deepEqual(lit('controlpath'), {
    nodes: ['@MODE', '@RST', '@SHOW', 'control_path'],
    signals: ['MODE', 'RST', 'SHOW'],
  })
})
