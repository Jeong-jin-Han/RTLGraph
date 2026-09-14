import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { ComponentGraph, RtlNode } from '@rtlgraph/ir'
import { BASE_REGISTRY, checkNodeAgainstRegistry, checkSignalWidths, lookupSymbol, portWidth } from '../src/index.ts'

const DEMO = join(import.meta.dirname, '../../../demo')
const BASE_DIR = process.env.RTLGRAPH_BASE_DIR ?? join(DEMO, 'base')

// Just enough Verilog to read an ANSI port list of a base/ primitive.
function readPrimitive(src: string) {
  const module = /\bmodule\s+(\w+)/.exec(src)?.[1]
  const param = /\bparameter\s+(\w+)\s*=\s*(\d+)/.exec(src)
  const ports = [...src.matchAll(/\b(input|output|inout)\s+(?:wire|reg)?\s*(\[[^\]]*\])?\s*(\w+)/g)].map(m => ({
    name: m[3],
    dir: m[1] === 'input' ? 'in' : m[1] === 'output' ? 'out' : 'inout',
    width: m[2] === undefined ? 1 : m[2].replace(/\s/g, '') === `[${param?.[1]}:0]` ? 'param' : m[2],
  }))
  return { module, param: param && { name: param[1], default: Number(param[2]) }, ports }
}

test('registry matches base/ module for module', () => {
  const files = readdirSync(BASE_DIR).filter(f => f.endsWith('.v'))
  assert.deepEqual(files.map(f => basename(f, '.v')).sort(), Object.keys(BASE_REGISTRY).sort())
  for (const f of files) {
    const prim = readPrimitive(readFileSync(join(BASE_DIR, f), 'utf8'))
    const def = BASE_REGISTRY[prim.module!]
    assert.ok(def, `${f}: module ${prim.module} not in registry`)
    assert.deepEqual(prim.ports, def.ports.map(p => ({ name: p.name, dir: p.dir, width: p.width })), f)
    assert.deepEqual(prim.param, { name: def.widthParam.name, default: def.widthParam.default }, f)
  }
})

test('port widths follow the BW = MSB index convention', () => {
  const dff = lookupSymbol('DFF')!
  assert.equal(portWidth(dff, 'D', { BW: 5 }), 6)
  assert.equal(portWidth(dff, 'D'), 6)
  assert.equal(portWidth(dff, 'CLK', { BW: 5 }), 1)
  assert.equal(portWidth(lookupSymbol('CMP_EQ')!, 'y', { BW: 1 }), 1)
  assert.equal(portWidth(dff, 'nope'), undefined)
  assert.equal(lookupSymbol('toString'), undefined)
})

test('registry check flags drifted ports, kind and time', () => {
  const node: RtlNode = {
    kind: 'op', flow: 'data', time: 'seq', module: 'MUX2',
    ports: { sel: 'in', d0: 'in', y: 'in', extra: 'out' },
  }
  const msgs = checkNodeAgainstRegistry('m', node).map(d => d.code).sort()
  assert.deepEqual(msgs, ['registry-kind', 'registry-ports', 'registry-ports', 'registry-ports', 'registry-time'])
  assert.deepEqual(checkNodeAgainstRegistry('p', { kind: 'port', dir: 'in', flow: 'data' }), [])
  assert.deepEqual(checkNodeAgainstRegistry('u', { kind: 'module', flow: 'data', time: 'comb', module: 'acc_unit', ports: {} }), [])
})

test('golden D01-2 graph agrees with the registry', () => {
  const graph = JSON.parse(readFileSync(join(DEMO, 'acc/acc_top.rtlgraph.json'), 'utf8')) as ComponentGraph
  for (const [id, node] of Object.entries(graph.nodes)) assert.deepEqual(checkNodeAgainstRegistry(id, node), [], id)
  assert.deepEqual(checkSignalWidths(graph), [])
})

test('signal width check catches a mismatch', () => {
  const graph = JSON.parse(readFileSync(join(DEMO, 'acc/acc_top.rtlgraph.json'), 'utf8')) as ComponentGraph
  graph.signals.CNT_Q.width = 5
  const codes = checkSignalWidths(graph).map(d => `${d.code}:${d.node}`)
  assert.deepEqual(codes, ['width:CNT_FF', 'width:data_path.u_inc', 'width:data_path.u_add', 'width:data_path.u_sub'])
})
