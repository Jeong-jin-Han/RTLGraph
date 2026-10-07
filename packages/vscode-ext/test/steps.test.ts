import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { entriesIn, prefixesIn, walksIn } from '../src/spec/steps.ts'

// A specification written by `components/codespec` carries, per scenario, a
// table of one row per cycle with the lines each cycle ran. That table is a
// walk through the code already; this reads it back as one.

const FORMAT = `# 명세서 양식

## 기준 파일 (줄 번호가 가리키는 판)

| 파일 | sha1 앞 8자 | 표기 |
|---|---|---|
| \`uart.v\` | \`0443d812\` | \`top:줄\` |
| \`uart_receiver.v\` | \`ea15f96e\` | \`rx:줄\` |
`

const SPEC = `## 5. 줄 경로

### RX-N1. 바이트 하나를 받는다

| 사이클 | 참이 된 조건 | 실행된 대입 | 무슨 일 |
|---|---|---|---|
| 0 | \`rx:74\` \`start\` | \`rx:97\` bit_counter <= 4'd10 · \`rx:89\` clock_counter <= 0 | 하강을 보고 프레임을 시작한다 |
| 542 | \`rx:70\` \`sample\` | \`rx:116\` rx_shift <= {serial_in, rx_shift[9:1]} | 시작 비트의 한가운데에서 라인을 읽는다 |
| 10850 | \`rx:124-126\` | \`rx:126\` has_byte <= 1'b1 | 열 비트를 다 모아 바이트를 내놓는다 |

결과: 바이트가 나온다.

### RX-N2. 바깥이 가져간다

| 사이클 | 참이 된 조건 | 실행된 대입 |
|---|---|---|
| c | \`rx:128\` \`data_out_ready\` | \`rx:131\` has_byte <= 1'b0 |

### L-N1. 끝에서 끝까지

| 사이클 | 어디서 | 일어나는 일 |
|---|---|---|
| 0 | A 송신기 | \`top:23\` 선에 실린다 · \`rx:74\` 받는 쪽이 하강을 본다 |

### RX-E9. 아직 안 쓴 것
`

test('the prefixes a spec declares for its files', () => {
  const prefixes = prefixesIn(FORMAT)
  assert.equal(prefixes.get('rx'), 'uart_receiver.v')
  assert.equal(prefixes.get('top'), 'uart.v')
  assert.equal(prefixes.size, 2, 'and nothing else from that table')
})

test('a path table reads back as a walk, one step per row', () => {
  const walks = walksIn(SPEC, prefixesIn(FORMAT))
  assert.deepEqual(walks.map(w => w.id), ['RX-N1', 'RX-N2', 'L-N1'],
    'a scenario with no table yet is not offered as an empty walk')
  assert.equal(walks[0].title, '바이트 하나를 받는다')

  const [first, second, third] = walks[0].steps
  assert.equal(first.cycle, '0')
  assert.equal(first.file, 'uart_receiver.v')
  // three citations in one row, far enough apart to stay three stretches
  assert.deepEqual(first.spans, [{ from: 74, to: 74 }, { from: 89, to: 89 }, { from: 97, to: 97 }])
  assert.match(first.said, /bit_counter/)
  // What a reader walking this is told, which is not the code they are looking at.
  assert.equal(first.why, '하강을 보고 프레임을 시작한다')
  assert.equal(first.why.includes('rx:'), false, 'the sentence carries no citations')
  assert.deepEqual(second.spans, [{ from: 70, to: 70 }, { from: 116, to: 116 }])
  // a range citation keeps its end, and the overlapping single line merges in
  assert.deepEqual(third.spans, [{ from: 124, to: 126 }])
})

// The whole point of a step is to read a stretch of code; one that moves the
// editor to another file halfway through is two steps, not one.
test('a row that cites two files becomes one step per file', () => {
  const walks = walksIn(SPEC, prefixesIn(FORMAT))
  const link = walks.find(w => w.id === 'L-N1')!
  assert.equal(link.steps.length, 2)
  assert.deepEqual(link.steps.map(s => s.file), ['uart.v', 'uart_receiver.v'])
  assert.ok(link.steps.every(s => s.cycle === '0'), 'both are still that one cycle')
  assert.deepEqual(link.steps[0].spans, [{ from: 23, to: 23 }])
})

// A table written before the column existed still has to walk: whatever in
// the row is not a citation is the nearest thing to a sentence it has.
test('a path table with no explanation column falls back to its prose', () => {
  const walks = walksIn(`### RX-N1. 받는다

| 사이클 | 참이 된 조건 | 실행된 대입 |
|---|---|---|
| 0 | \`rx:74\` \`start\` | 프레임이 시작된다 |
`, prefixesIn(FORMAT))
  assert.equal(walks[0].steps[0].why, '프레임이 시작된다')
})

test('a citation that names its own file needs no prefix table', () => {
  const walks = walksIn(`### TX-N1. 보낸다

| 사이클 | 조건 | 대입 |
|---|---|---|
| 0 | \`uart_transmitter.v:46\` | \`uart_transmitter.v:60\` |
`)
  assert.equal(walks[0].steps[0].file, 'uart_transmitter.v')
  assert.deepEqual(walks[0].steps[0].spans, [{ from: 46, to: 46 }, { from: 60, to: 60 }])
})

test('prose that looks like a citation is not one', () => {
  const walks = walksIn(`### RX-N1. 받는다

| 사이클 | 조건 | 대입 |
|---|---|---|
| 0 | 결과: 3 개 | \`rx:74\` |
`, prefixesIn(FORMAT))
  assert.deepEqual(walks[0].steps[0].spans, [{ from: 74, to: 74 }], '"결과: 3" is prose, not a place')
})

// The format this reads is the one the course project actually writes.
test('the specification in the demo project reads back as walks', t => {
  const spec = join(import.meta.dirname, '../../../demo/uart-p01/me/spec')
  if (!existsSync(spec)) return t.skip('demo/uart-p01/me is not here')
  const prefixes = prefixesIn(readFileSync(join(spec, '00-format.md'), 'utf8'))
  assert.ok(prefixes.size >= 3, `the format file names its files: ${[...prefixes]}`)
  const walks = walksIn(readFileSync(join(spec, '30-uart_receiver.md'), 'utf8'), prefixes)
  assert.ok(walks.length >= 4, `the receiver's scenarios: ${walks.map(w => w.id)}`)
  for (const walk of walks) {
    assert.ok(walk.steps.length > 0, `${walk.id} has somewhere to go`)
    for (const step of walk.steps) {
      assert.match(step.file, /\.s?v$/, `${walk.id} ${step.cycle} lands in a source file`)
      assert.ok(step.spans.every(s => s.from > 0 && s.to >= s.from), `${walk.id} ${step.cycle} spans forwards`)
    }
  }
})

// Citations a line apart are one thing to read: `rx:115` is the condition and
// `rx:116` the assignment under it, and opening two one-line windows for them
// is two windows showing the same `if`.
test('citations a line apart merge into one stretch', () => {
  const walks = walksIn(`### RX-N1. 받는다

| 사이클 | 조건 | 대입 |
|---|---|---|
| 542 | \`rx:115\` | \`rx:116\` |
`, prefixesIn(FORMAT))
  assert.deepEqual(walks[0].steps[0].spans, [{ from: 115, to: 116 }])
})

// Hovering a name in the Verilog should say what the specification says about
// it. Two shapes of section 6 are in use, and both are read.
test('section 6 reads back as one entry per name, in either shape', () => {
  const entries = entriesIn(`## 5. 줄 경로

| 사이클 | 조건 |
|---|---|
| 0 | \`rx:74\` |

## 6. 세부

### 신호

**\`clock_counter\`** (\`rx:58\`) \`reg\` 11비트.
- 만드는 곳 : \`rx:89\`. reset 이나 start 면 0, 아니면 +1.
- 값의 범위 : 0 ~ 1084. 쉬는 중에도 돈다.

**\`sample\`** (\`rx:54\`) \`wire\`.
- 만드는 곳 : \`rx:70\`.
`)
  assert.deepEqual([...entries.keys()], ['clock_counter', 'sample'])
  assert.match(entries.get('clock_counter')!.text, /0 ~ 1084/)
  assert.equal(entries.get('clock_counter')!.text.includes('sample'), false, 'an entry stops at the next one')

  const table = entriesIn(`## 6. 세부

| 이름 | 줄 | 무엇인가 |
|---|---|---|
| \`running\` | 64 | \`bit_counter != 0\`. "받는 중" |
`)
  assert.equal(table.get('running')!.text, '64 · `bit_counter != 0`. "받는 중"')
})

test('nothing outside section 6 becomes an entry', () => {
  const entries = entriesIn(`## 2. 그 일에 필요한 것

**\`rx_shift\`** 는 여기서 설명하지 않는다.

## 6. 세부

**\`has_byte\`** (\`rx:60\`) \`reg\`.
- 쓰는 곳 : \`rx:79\`.
`)
  assert.deepEqual([...entries.keys()], ['has_byte'])
})
