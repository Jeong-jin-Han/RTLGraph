import type { Layout } from '@rtlgraph/ir'

// Writing the reader's arrangement back into the file without reformatting it.
//
// These files are written by hand or by an agent and are read in diffs, so
// re-serialising the whole document to change one member would turn every small
// edit into a whole-file change. Instead the top-level members are located with
// a small scanner and only the one member is rewritten.

export interface Edit {
  start: number
  end: number
  text: string
}

interface Member {
  key: string
  start: number // the opening quote of the key
  end: number // just past the value
}

// The top-level members of a JSON object, in order. Undefined if the text is not
// an object — a broken file is left alone rather than guessed at.
export function topLevelMembers(text: string): Member[] | undefined {
  let i = 0
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++
  }
  const string = () => {
    if (text[i] !== '"') return false
    i++
    while (i < text.length) {
      if (text[i] === '\\') i += 2
      else if (text[i] === '"') return (i++, true)
      else i++
    }
    return false
  }
  const value = (): boolean => {
    ws()
    const ch = text[i]
    if (ch === '"') return string()
    if (ch === '{' || ch === '[') {
      const close = ch === '{' ? '}' : ']'
      i++
      for (;;) {
        ws()
        if (i >= text.length) return false
        if (text[i] === close) return (i++, true)
        if (text[i] === ',') {
          i++
          continue
        }
        if (ch === '{') {
          if (!string()) return false
          ws()
          if (text[i] !== ':') return false
          i++
        }
        if (!value()) return false
      }
    }
    const rest = /^[^,}\]\s]+/.exec(text.slice(i))
    if (!rest) return false
    i += rest[0].length
    return true
  }

  ws()
  if (text[i] !== '{') return undefined
  i++
  const members: Member[] = []
  for (;;) {
    ws()
    if (i >= text.length) return undefined
    if (text[i] === '}') return members
    if (text[i] === ',') {
      i++
      continue
    }
    const start = i
    if (!string()) return undefined
    const key = JSON.parse(text.slice(start, i)) as string
    ws()
    if (text[i] !== ':') return undefined
    i++
    if (!value()) return undefined
    members.push({ key, start, end: i })
  }
}

const isEmpty = (layout: Layout | undefined) =>
  !layout ||
  (Object.keys(layout.nodes ?? {}).length === 0 &&
    Object.keys(layout.sizes ?? {}).length === 0 &&
    Object.keys(layout.wires ?? {}).length === 0 &&
    (layout.cut ?? []).length === 0 &&
    (layout.collapsed ?? []).length === 0)

const indentAt = (text: string, at: number) => /[ \t]*$/.exec(text.slice(0, at))?.[0] ?? '  '

// The edit that puts `layout` into `text`, or takes it out when it holds nothing.
// Undefined when the file already says exactly this, or cannot be read.
export function setLayoutEdit(text: string, layout: Layout | undefined): Edit | undefined {
  const members = topLevelMembers(text)
  if (!members) return undefined
  const found = members.find(m => m.key === 'layout')

  if (isEmpty(layout)) {
    if (!found) return undefined
    const index = members.indexOf(found)
    const previous = members[index - 1]
    const next = members[index + 1]
    if (previous) return { start: previous.end, end: found.end, text: '' } // takes the comma before it
    if (next) return { start: found.start, end: next.start, text: '' } // and the comma after it
    return { start: text.indexOf('{') + 1, end: found.end, text: '' }
  }

  const written = (indent: string) => `"layout": ${JSON.stringify(layout, null, 2).split('\n').join(`\n${indent}`)}`
  if (found) return { start: found.start, end: found.end, text: written(indentAt(text, found.start)) }

  const last = members[members.length - 1]
  if (!last) return undefined // an empty object: leave it to the extractor
  const indent = indentAt(text, last.start)
  return { start: last.end, end: last.end, text: `,\n${indent}${written(indent)}` }
}

// Convenience for tests and for callers that do not need a range.
export function withLayout(text: string, layout: Layout | undefined): string {
  const edit = setLayoutEdit(text, layout)
  return edit ? text.slice(0, edit.start) + edit.text + text.slice(edit.end) : text
}
