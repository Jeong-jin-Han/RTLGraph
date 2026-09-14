import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateComponentGraph, type Diagnostic } from '../src/index.ts'
import { fixture, mutated } from './fixture.ts'

const codes = (ds: Diagnostic[], severity: Diagnostic['severity']) =>
  ds.filter(d => d.severity === severity).map(d => d.code)

function expectError(input: unknown, code: string) {
  const r = validateComponentGraph(input)
  assert.equal(r.ok, false)
  assert.ok(codes(r.diagnostics, 'error').includes(code), JSON.stringify(r.diagnostics, null, 2))
}

test('the fixture is valid with no diagnostics', () => {
  assert.deepEqual(validateComponentGraph(fixture()), { ok: true, diagnostics: [] })
})

test('rejects a non-object and a wrong kind', () => {
  expectError(42, 'schema')
  expectError(mutated(g => { g.kind = 'fsm' }), 'schema')
  expectError(mutated(g => { g.kind = 'system' }), 'system-logic') // a root file holds no logic
})

test('rejects bad node ids', () => {
  expectError(mutated(g => { g.nodes['@ports'] = g.nodes['@A']; g.nodes['@ports'].kind = 'op' }), 'schema')
  expectError(mutated(g => { g.nodes['CLK'] = g.nodes['@CLK']; delete g.nodes['@CLK'] }), 'node-id')
  expectError(mutated(g => { g.nodes['1bad'] = { ...g.nodes['dp.u_inc'] } }), 'node-id')
})

test('requires flow and time tags on instances', () => {
  expectError(mutated(g => { g.nodes['dp.u_inc'].flow = 'clock' }), 'schema')
  expectError(mutated(g => { delete g.nodes['R_FF'].time }), 'schema')
})

test('endpoints must resolve to an existing port with the right direction', () => {
  expectError(mutated(g => { g.signals.A.sinks = ['nope:a'] }), 'endpoint')
  expectError(mutated(g => { g.signals.A.sinks = ['dp.u_inc:zz'] }), 'endpoint')
  expectError(mutated(g => { g.signals.A.sinks = ['dp.u_inc:y'] }), 'endpoint')
  expectError(mutated(g => { g.signals.A.driver = '@A:p' }), 'endpoint')
  expectError(mutated(g => { g.signals.A.sinks = ['dp.u_inc'] }), 'endpoint')
})

test('a net needs a driver and an input takes one net', () => {
  expectError(mutated(g => { delete g.signals.A.driver }), 'undriven')
  expectError(mutated(g => { g.signals.CLK.sinks.push('dp.u_inc:a') }), 'multi-driven')
  expectError(mutated(g => { g.signals.R_D.sinks.push('R_FF:EN') }), 'multi-driven')
})

test('an output drives one net; aliases must be unique names', () => {
  expectError(mutated(g => { g.signals.X = { width: 4, flow: 'data', driver: 'R_FF:Q', sinks: [] } }), 'endpoint')
  expectError(mutated(g => { g.signals.R_Q.aliases = ['A'] }), 'schema')
})

test('constants only on input ports', () => {
  expectError(mutated(g => { g.nodes['R_FF'].consts.Q = "1'b0" }), 'endpoint')
})

test('truth tables must match the node ports and row widths', () => {
  const withControl = (edit: (t: any) => void) => mutated(g => {
    g.nodes.cp = {
      kind: 'control', flow: 'control', time: 'comb', module: 'cp', ports: { I: 'in', O: 'out' },
      truthTable: { inputs: ['I'], outputs: ['O'], rows: [{ in: ['1'], out: ['0'] }] },
    }
    g.signals.CLK.sinks.push('cp:I')
    edit(g.nodes.cp.truthTable)
  })
  assert.equal(validateComponentGraph(withControl(() => {})).ok, true)
  expectError(withControl(t => { t.rows[0].in = ['1', '0'] }), 'truth-table')
  expectError(withControl(t => { t.rows[0].out = ['z'] }), 'truth-table')
  expectError(withControl(t => { t.outputs = ['I'] }), 'truth-table')
  expectError(withControl(t => { t.default = { out: [] } }), 'truth-table')
})

test('warns on unconnected inputs and stale layout, but stays ok', () => {
  const r = validateComponentGraph(mutated(g => {
    delete g.nodes['R_FF'].consts.EN
    g.layout = { nodes: { ghost: { x: 0, y: 0 }, R_FF: { x: 1, y: 2 } } }
  }))
  assert.equal(r.ok, true)
  assert.deepEqual(codes(r.diagnostics, 'warn').sort(), ['layout-stale', 'undriven'])
})

test('groups must reference existing nodes', () => {
  expectError(mutated(g => { g.groups = { grp: { label: 'G', members: ['nope'] } } }), 'group')
  expectError(mutated(g => { g.nodes['R_FF'].group = 'missing' }), 'group')
})

test('prototype keys are not mistaken for nodes', () => {
  expectError(mutated(g => { g.signals.A.sinks = ['constructor:a'] }), 'endpoint')
})
