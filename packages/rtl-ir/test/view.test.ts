import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILTER_PRESETS, visibleElements, type ComponentGraph, type FilterPreset } from '../src/index.ts'

const graph = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../demo/acc/acc/acc.rtlgraph-schematic.json'), 'utf8'),
) as ComponentGraph

const visible = (preset: FilterPreset) => {
  const v = visibleElements(graph, FILTER_PRESETS[preset])
  return { nodes: [...v.nodes].sort(), signals: [...v.signals].sort() }
}

test('datapath preset is exactly the slide p.31 picture', () => {
  assert.deepEqual(visible('datapath'), {
    nodes: ['@ACC', 'ACC_FF', 'CNT_FF', 'OUT_FF', 'data_path.u_add', 'data_path.u_inc', 'data_path.u_mux', 'data_path.u_sub'],
    signals: ['ACC_D', 'ACC_Q', 'CNT_D', 'CNT_Q', 'OUT_Q', 'data_path.ADD_OUT', 'data_path.SUB_OUT'],
  })
})

test('all preset shows every net except hidden ones', () => {
  const v = visible('all')
  assert.equal(v.nodes.length, Object.keys(graph.nodes).length - 1) // @CLK: its only net is hidden
  assert.ok(!v.signals.includes('CLK'))
  assert.equal(v.signals.length, Object.keys(graph.signals).length - 1)
})

test('comb preset drops registers and the nets that touch them', () => {
  assert.deepEqual(visible('comb'), {
    nodes: ['@MODE', '@RST', '@SHOW', 'control_path', 'data_path.u_add', 'data_path.u_inc', 'data_path.u_mux', 'data_path.u_sub'],
    signals: ['ACC_SEL', 'MODE', 'RST', 'SHOW', 'data_path.ADD_OUT', 'data_path.SUB_OUT'],
  })
})

test('seq preset keeps registers, and ports only when a net reaches them', () => {
  assert.deepEqual(visible('seq'), { nodes: ['@ACC', 'ACC_FF', 'CNT_FF', 'OUT_FF'], signals: ['OUT_Q'] })
})

test('controlpath preset shows the control block and its inputs', () => {
  assert.deepEqual(visible('controlpath'), {
    nodes: ['@MODE', '@RST', '@SHOW', 'control_path'],
    signals: ['MODE', 'RST', 'SHOW'],
  })
})
