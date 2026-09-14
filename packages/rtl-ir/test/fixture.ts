import type { ComponentGraph } from '../src/index.ts'

// Smallest valid component: @A -> INC -> DFF -> @Y.
export function fixture(): ComponentGraph {
  return {
    version: '0.1.0',
    kind: 'component',
    title: 'tiny',
    created: '2026-09-14T00:00:00.000Z',
    modified: '2026-09-14T00:00:00.000Z',
    source: { root: '.', files: ['top.v'], top: 'top' },
    nodes: {
      '@A': { kind: 'port', dir: 'in', flow: 'data' },
      '@CLK': { kind: 'port', dir: 'in', flow: 'clock' },
      '@Y': { kind: 'port', dir: 'out', flow: 'data' },
      'dp.u_inc': {
        kind: 'op', flow: 'data', time: 'comb', module: 'INC',
        params: { BW: 3 }, ports: { a: 'in', y: 'out' },
      },
      R_FF: {
        kind: 'reg', flow: 'data', time: 'seq', module: 'DFF', params: { BW: 3 },
        ports: { CLK: 'in', RST: 'in', EN: 'in', D: 'in', Q: 'out' },
        consts: { RST: "1'b0", EN: "1'b1" },
      },
    },
    signals: {
      A: { width: 4, flow: 'data', driver: '@A', sinks: ['dp.u_inc:a'] },
      R_D: { width: 4, flow: 'data', driver: 'dp.u_inc:y', sinks: ['R_FF:D'] },
      R_Q: { width: 4, flow: 'data', driver: 'R_FF:Q', sinks: ['@Y'], aliases: ['Y'] },
      CLK: { width: 1, flow: 'clock', driver: '@CLK', sinks: ['R_FF:CLK'], hidden: true },
    },
  }
}

// Returns the fixture after an arbitrary (possibly schema-breaking) edit.
export function mutated(edit: (g: any) => void): unknown {
  const g = fixture()
  edit(g)
  return g
}
