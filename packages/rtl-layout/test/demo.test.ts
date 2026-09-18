import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEndpoint, type ComponentGraph } from '@rtlgraph/ir'
import { layoutComponent, PORT_PIN } from '../src/index.ts'
import { assertCleanWires, assertConnects, assertNoOverlap } from './invariants.ts'

// Every schematic in demo/, laid out on its own the way the editor draws it when
// the file itself is opened. A wire that left a pin straight for another pin —
// a hugging port whose net had a second reader — used to come out diagonal here.
const DEMO = join(import.meta.dirname, '../../../demo')
const FILES = [
  'acc/acc/acc.rtlgraph-schematic.json',
  'updown/updown/updown.rtlgraph-schematic.json',
  'sys/sys/sys.rtlgraph-schematic.json',
  'sys/sys/host/host.rtlgraph-schematic.json',
  'sys/sys/dev/dev.rtlgraph-schematic.json',
  'sys/sys/dev/inbuf/inbuf.rtlgraph-schematic.json',
  'pwm/pwm/pwm.rtlgraph-schematic.json',
  'pwm/pwm/pulse/pulse.rtlgraph-schematic.json',
  'pwm/pwm/pulse/cnt/cnt.rtlgraph-schematic.json',
  'pwm/pwm/rdy/rdy.rtlgraph-schematic.json',
  'hw/hw.rtlgraph-schematic.json',
  'hw/counter.rtlgraph-schematic.json',
  'acc/acc_top.rtlgraph.json',
  'sys/sys_top.rtlgraph.json',
  'updown/updown.rtlgraph.json',
  'pwm/pwm_top.rtlgraph.json',
  'hw/hw_top.rtlgraph.json',
]

for (const file of FILES) {
  test(`demo/${file} lays out cleanly on its own`, () => {
    const graph = JSON.parse(readFileSync(join(DEMO, file), 'utf8')) as ComponentGraph
    const layout = layoutComponent(graph)
    assertNoOverlap(Object.entries(layout.nodes))
    assertCleanWires({ ...layout, children: {} })
    for (const [name, wire] of Object.entries(layout.wires)) {
      const s = graph.signals[name]
      const points = [s.driver, ...s.sinks].map(ref => {
        const { node, port } = parseEndpoint(ref)
        return layout.nodes[node].pins[port ?? PORT_PIN]
      })
      assertConnects(name, wire.segments, points)
    }
  })
}
