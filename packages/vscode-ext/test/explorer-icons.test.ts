import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MATERIAL_ICON, RTLGRAPH_FILES, withRtlgraphFiles } from '../src/explorerIcons.ts'

// The Explorer's icon comes from the reader's icon theme, so the only thing we
// can do is add a line per pattern — without touching whatever else is there.

test('every RTLGraph pattern is added to what is already associated', () => {
  const now = withRtlgraphFiles({ '*.proto': 'proto' })
  assert.deepEqual(now, {
    '*.proto': 'proto',
    '*.rtlgraph.json': MATERIAL_ICON,
    '*.rtlgraph-schematic.json': MATERIAL_ICON,
    '*.rtlgraph-fsm.json': MATERIAL_ICON,
    '*.waveform.json': MATERIAL_ICON,
  })
})

test('a setting that already says it is left alone', () => {
  const said = Object.fromEntries(RTLGRAPH_FILES.map(p => [p, MATERIAL_ICON]))
  assert.equal(withRtlgraphFiles(said), undefined, 'nothing to write, so nothing is asked')
  assert.equal(withRtlgraphFiles(undefined)?.['*.rtlgraph.json'], MATERIAL_ICON, 'but an empty setting is written')
})

test('a reader who picked another icon for one of them is asked again', () => {
  const half = { '*.rtlgraph.json': 'json', '*.rtlgraph-fsm.json': MATERIAL_ICON }
  const now = withRtlgraphFiles(half)
  assert.equal(now?.['*.rtlgraph.json'], MATERIAL_ICON)
  assert.equal(now?.['*.rtlgraph-schematic.json'], MATERIAL_ICON)
})
