import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { candidatesFor, connectionGoals, goalsAsDiagnostics, type ComponentGraph } from '../src/index.ts'

const graph = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../demo/acc/acc/acc.rtlgraph-schematic.json'), 'utf8'),
) as ComponentGraph

const ids = (g: ReturnType<typeof connectionGoals>) => g.map(goal => goal.id).sort()

test('a finished schematic leaves nothing to do', () => {
  assert.deepEqual(connectionGoals(graph), [])
})

test('cutting a wire states what the cut left undone', () => {
  const goals = connectionGoals(graph, ['CNT_D'])
  assert.deepEqual(ids(goals), ['cut:CNT_D', 'in:CNT_FF:D', 'out:data_path.u_inc:y'])
  const cut = goals.find(g => g.id === 'cut:CNT_D')!
  assert.match(cut.what, /connect data_path\.u_inc:y to CNT_FF:D again/)
  assert.equal(cut.why, 'you cut CNT_D')
  // The file still says what the RTL does; only the sketch has the hole.
  assert.ok(Object.hasOwn(graph.signals, 'CNT_D'))
})

test('an unconnected input and an unused output are both obligations', () => {
  const open = structuredClone(graph)
  const register = open.nodes.CNT_FF as { consts?: Record<string, string> }
  delete register.consts // EN was tied to 1'b1
  assert.ok(ids(connectionGoals(open)).includes('in:CNT_FF:EN'))

  const spare = structuredClone(graph)
  spare.nodes['data_path.u_spare'] = structuredClone(spare.nodes['data_path.u_inc']) // wired to nothing
  const goals = ids(connectionGoals(spare))
  assert.ok(goals.includes('in:data_path.u_spare:a'))
  assert.ok(goals.includes('out:data_path.u_spare:y'))
})

test('an output port with nothing driving it is an obligation', () => {
  const loose = structuredClone(graph)
  loose.signals.OUT_Q.sinks = []
  assert.ok(ids(connectionGoals(loose)).includes('port:@ACC'))
})

test('candidates are the free pins that face the right way', () => {
  const goals = connectionGoals(graph, ['CNT_D'])
  const forInput = candidatesFor(graph, goals.find(g => g.id === 'in:CNT_FF:D')!, ['CNT_D'])
  assert.ok(forInput.includes('data_path.u_inc:y'), 'the driver it lost')
  assert.ok(!forInput.some(ref => ref.startsWith('CNT_FF:')), 'never its own pins')
  assert.ok(forInput.every(ref => !ref.includes(':D')), 'only outputs drive')
})

test('goals read as diagnostics for the problems list', () => {
  const found = goalsAsDiagnostics(connectionGoals(graph, ['CNT_D']))
  assert.deepEqual(found.map(d => d.code).sort(), ['cut', 'undriven', 'undriven'])
  assert.ok(found.every(d => d.severity === 'warn'))
})
