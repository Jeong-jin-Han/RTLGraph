import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { about, nearness, prefixesIn } from '../src/spec/steps.ts'

// Which specification answers a hover. The rules are small and the whole
// feature turns on them, so they are tested here rather than only through a
// window: one wrong answer looks exactly like a right one.

test('a document is about the files its citations name', () => {
  const prefixes = new Map([['rx', 'uart_receiver.v'], ['top', 'uart.v']])
  const found = about('`rx:58` and `top:24`, and `other/dir/uart_transmitter.v:46`', prefixes)
  assert.deepEqual([...found].sort(), ['uart.v', 'uart_receiver.v', 'uart_transmitter.v'],
    'a path is reduced to its file name, which is what a hover knows')
})

test('a marker the format table never declared is not a file', () => {
  assert.deepEqual([...about('결과: 3 개 · `note:12`', new Map([['rx', 'uart_receiver.v']]))], [],
    'prose with a colon in it names nothing')
})

// A workspace holding two projects holds two files called uart_receiver.v,
// each with its own specification. Picking by name alone answered out of
// whichever was found first.
test('the nearest specification is the one deepest in the same folder', () => {
  const code = '/w/demo/uart-fresh/uart_receiver.v'
  const mine = '/w/demo/uart-fresh/me/spec/30-uart_receiver.md'
  const theirs = '/w/demo/uart-p01/me/spec/30-uart_receiver.md'
  assert.ok(nearness(mine, code) > nearness(theirs, code))
  assert.equal(nearness(code, code), code.split('/').length, 'a file shares all of itself')
  assert.equal(nearness('/a/b', '/x/y'), 1, 'only the root')
})

// The two projects are really there, so the rule is checked against them.
test('the demo projects each have a specification of their own', t => {
  const demo = join(import.meta.dirname, '../../../demo')
  const both = ['uart-p01', 'uart-fresh'].map(p => join(demo, p, 'me/spec/30-uart_receiver.md'))
  if (!both.every(existsSync)) return t.skip('one of the demo projects is not here')
  for (const [at, spec] of both.entries()) {
    const prefixes = prefixesIn(readFileSync(join(spec, '../00-format.md'), 'utf8'))
    assert.ok(about(readFileSync(spec, 'utf8'), prefixes).has('uart_receiver.v'),
      `${spec} documents the receiver`)
    const code = join(demo, ['uart-p01', 'uart-fresh'][at], 'uart_receiver.v')
    const near = both.map(s => nearness(s, code))
    assert.equal(near.indexOf(Math.max(...near)), at, 'and is the nearest to its own copy of it')
  }
})
