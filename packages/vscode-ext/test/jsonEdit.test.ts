import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Layout } from '@rtlgraph/ir'
import { setLayoutEdit, withLayout } from '../src/jsonEdit.ts'

const GOLDEN = join(import.meta.dirname, '../../../demo/acc/acc/acc.rtlgraph-schematic.json')
const file = readFileSync(GOLDEN, 'utf8')
const placed: Layout = { nodes: { CNT_FF: { x: 100, y: 200 } } }

test('adds a layout to a file that has none, and leaves the rest byte for byte', () => {
  const written = withLayout(file, placed)
  assert.deepEqual(JSON.parse(written).layout, placed)
  // Everything before the insertion is untouched.
  const edit = setLayoutEdit(file, placed)!
  assert.equal(written.slice(0, edit.start), file.slice(0, edit.start))
  assert.equal(JSON.stringify(JSON.parse(written).nodes), JSON.stringify(JSON.parse(file).nodes))
})

test('replaces an existing layout without touching its neighbours', () => {
  const once = withLayout(file, placed)
  const next: Layout = { nodes: { CNT_FF: { x: 1, y: 2 } }, cut: ['CNT_D'] }
  const again = withLayout(once, next)
  assert.deepEqual(JSON.parse(again).layout, next)
  // Only the member itself moved: the text on either side of it is the same.
  const edit = setLayoutEdit(once, next)!
  assert.equal(again.slice(0, edit.start), once.slice(0, edit.start))
  assert.equal(again.slice(edit.start + edit.text.length), once.slice(edit.end))
})

test('an empty arrangement takes the member out again', () => {
  const once = withLayout(file, placed)
  assert.equal(withLayout(once, { nodes: {} }), file)
  assert.equal(withLayout(once, undefined), file)
  assert.equal(setLayoutEdit(file, { nodes: {} }), undefined) // nothing to do
})

test('handles a layout that is not the last member', () => {
  const text = `{\n  "a": 1,\n  "layout": {\n    "nodes": {}\n  },\n  "b": [1, 2]\n}\n`
  const written = withLayout(text, placed)
  assert.deepEqual(JSON.parse(written), { a: 1, layout: placed, b: [1, 2] })
  assert.ok(written.includes('"b": [1, 2]'))
})

test('a string holding a brace does not confuse the scan', () => {
  const text = `{\n  "title": "a } {",\n  "layout": { "nodes": {} }\n}\n`
  assert.deepEqual(JSON.parse(withLayout(text, placed)), { title: 'a } {', layout: placed })
})
