// Reading a specification's path tables back as something to walk.
//
// `components/codespec` writes, for each scenario, a table of one row per
// cycle: what became true, and what ran. Every cell carries line citations, so
// the table is already a list of places in the code — this turns it into one.
//
// **A step never leaves one file.** A row that cites two files is two steps of
// the same cycle, one per file, because the point of walking is to read a
// stretch of code: a step that moves the editor somewhere else halfway through
// is not a step, it is two.
//
// Nothing here touches VS Code: text in, steps out, so the rules can be tested
// against a document rather than against a screenshot.

export interface Step {
  /** The first column: the cycle this row is about, as the document wrote it. */
  cycle: string
  /**
   * What happens here, in words.
   *
   * The column a path table keeps for it ("무슨 일" / "what happens"), or, in a
   * table written before that column existed, whatever in the row is not code.
   * This is what a reader walking the scenario is actually told; the code is
   * on screen beside them already.
   */
  why: string
  /** The rest of the row, as text, for the reader. */
  said: string
  /** The one file this step is read in. */
  file: string
  /** The stretches to read there, merged and in order. */
  spans: readonly { from: number; to: number }[]
}

export interface Walk {
  id: string
  title: string
  steps: readonly Step[]
}

/**
 * `rx:74` — the short form a spec uses once it has said which file `rx` is.
 *
 * The format file carries that table (`| uart_receiver.v | ea15f96e | rx:줄 |`),
 * so the prefixes are read from the document rather than guessed. A citation
 * that names its file outright works too, and needs no table.
 */
export function prefixesIn(formatDoc: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const row of formatDoc.split('\n')) {
    if (!row.trimStart().startsWith('|')) continue
    const cells = row.split('|').map(c => c.trim().replace(/`/g, ''))
    const file = cells.find(c => /^[\w./-]+\.s?v$/.test(c))
    const marker = cells.find(c => /^[A-Za-z_]\w*:/.test(c))
    if (file && marker) out.set(marker.split(':')[0], file)
  }
  return out
}

const CITATION = /`?([A-Za-z_][\w./-]*(?:\.s?v)?):(\d+)(?:\s*[-–]\s*(\d+))?`?/g
const SCENARIO = /^#{2,4}\s+([A-Z]{1,4}-[NE]\d+)\.?\s*(.*)$/
const RULE = /^\s*\|[\s|:-]+\|\s*$/

/** The citations in one row, kept in the order they were written. */
function placesIn(text: string, prefixes: Map<string, string>): { file: string; from: number; to: number }[] {
  const out: { file: string; from: number; to: number }[] = []
  for (const [, name, from, to] of text.matchAll(CITATION)) {
    const file = /\.s?v$/.test(name) ? name : prefixes.get(name)
    if (!file) continue // a word before a colon is prose, not a citation
    out.push({ file, from: Number(from), to: Number(to ?? from) })
  }
  return out
}

/**
 * Which column of a path table is the explanation.
 *
 * Named in the header, because a table is free to call it what it likes and a
 * guess from the content would move about from row to row.
 */
const EXPLAINS = /무슨\s*일|일어나는\s*일|해설|설명|뜻|what\s*happens|in\s*words|meaning/i

/** One step per file, with the stretches in that file merged. */
function stepsForRow(cycle: string, why: string, said: string, places: ReturnType<typeof placesIn>): Step[] {
  const byFile = new Map<string, { from: number; to: number }[]>()
  for (const place of places) {
    byFile.set(place.file, [...(byFile.get(place.file) ?? []), { from: place.from, to: place.to }])
  }
  const out: Step[] = []
  for (const [file, found] of byFile) {
    const spans: { from: number; to: number }[] = []
    for (const span of [...found].sort((a, b) => a.from - b.from)) {
      const last = spans.at(-1)
      // Two citations a line apart are one thing to read, not two.
      if (last && span.from <= last.to + 1) last.to = Math.max(last.to, span.to)
      else spans.push({ ...span })
    }
    out.push({ cycle, why, said, file, spans })
  }
  return out
}

/**
 * Every scenario in a spec file that has a table under it.
 *
 * A heading with no table is a scenario someone named and has not written the
 * path for yet; it is skipped rather than offered as an empty walk.
 */
export function walksIn(doc: string, prefixes: Map<string, string> = new Map()): Walk[] {
  const out: Walk[] = []
  let current: { id: string; title: string; steps: Step[]; header: boolean; explains: number } | undefined
  const close = () => {
    if (current && current.steps.length > 0) {
      out.push({ id: current.id, title: current.title, steps: current.steps })
    }
    current = undefined
  }
  for (const line of doc.split('\n')) {
    const heading = SCENARIO.exec(line)
    if (heading) {
      close()
      current = { id: heading[1], title: heading[2].trim(), steps: [], header: false, explains: -1 }
      continue
    }
    if (!current) continue
    if (line.startsWith('#')) { close(); continue }
    if (!line.trimStart().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (RULE.test(line)) { current.header = true; continue }
    if (!current.header) {
      // The row before the rule names the columns, which is how the
      // explanation column is found rather than guessed at.
      current.explains = cells.findIndex(cell => EXPLAINS.test(cell))
      continue
    }
    if (cells.length < 2) continue
    const places = placesIn(line, prefixes)
    if (places.length === 0) continue // a row that cites nothing is nowhere to go
    const explains = current.explains
    const why = explains > 0
      ? cells[explains] ?? ''
      // A table written before the column existed: whatever in it is not a
      // citation and not Verilog is the nearest thing to a sentence it has.
      : cells.slice(1).filter(cell => placesIn(cell, prefixes).length === 0).join(' · ')
    const said = cells
      .map((cell, at) => (at === 0 || at === explains ? '' : cell))
      .filter(Boolean)
      .join(' · ')
    current.steps.push(...stepsForRow(cells[0], why, said, places))
  }
  close()
  return out
}

/** What a specification says about one name, ready to show on hover. */
export interface Entry {
  name: string
  /** The markdown as the document wrote it, minus the heading itself. */
  text: string
  /** Where in the spec it is, so the hover can link back. */
  line: number
}

// The three shapes section 6 is written in: a bold name (as a paragraph or as
// a bullet), a subheading per signal, and a row of a table. A document that
// used any of them was written by someone describing signals; none of them is
// a shape a sentence falls into by accident.
const BOLD_ENTRY = /^(?:[-*]\s+)?\*\*`?([A-Za-z_]\w*)`?\*\*\s*(.*)$/
const HEAD_ENTRY = /^#{3,4}\s+`?([A-Za-z_]\w*)`?\s*(.*)$/
const ROW_ENTRY = /^\|\s*\**`([A-Za-z_]\w*)`\**\s*\|(.+)\|\s*$/

/**
 * Section 6, read back as one entry per signal.
 *
 * Two shapes are in use and both are honoured: a bold name followed by `- key :
 * value` lines, and a row of a table whose first cell is the name. Anything
 * else in the section is left alone — a hover that guesses is worse than one
 * that says nothing.
 */
export function entriesIn(doc: string): Map<string, Entry> {
  const out = new Map<string, Entry>()
  const lines = doc.split('\n')
  let deep = false
  let current: Entry | undefined
  const close = () => {
    if (current) {
      current.text = current.text.trim()
      if (current.text) out.set(current.name, current)
    }
    current = undefined
  }
  for (const [at, line] of lines.entries()) {
    // `## 6. 세부`, `## 6 — Detail`, `## 6) Detail`: the number is what says
    // which section this is, and a writer should not lose their hovers to a
    // dash instead of a full stop.
    const section = /^##\s+(\d+)\b/.exec(line)
    if (section) { close(); deep = section[1] === '6'; continue }
    if (!deep) continue
    const row = ROW_ENTRY.exec(line)
    if (row) {
      close()
      const cells = row[2].split('|').map(c => c.trim()).filter(Boolean)
      out.set(row[1], { name: row[1], line: at, text: cells.join(' · ') })
      continue
    }
    const named = BOLD_ENTRY.exec(line) ?? HEAD_ENTRY.exec(line)
    if (named) {
      close()
      current = { name: named[1], line: at, text: named[2] ? `${named[2]}\n` : '' }
      continue
    }
    if (current) current.text += `${line}\n`
  }
  close()
  return out
}

// ── which document is about which file ──────────────────────────────────────

/**
 * A citation anywhere in a document, with or without the backticks a writer
 * may have put round it. The walk reads a table row with its own copy of this;
 * this one runs over whole files.
 */
export const ANY_CITATION = /`?([A-Za-z_][\w./-]*(?:\.s?v)?):(\d+)(?:\s*[-\u2013]\s*\d+)?`?/g

/** Every file a document's citations name, through the project's prefixes. */
export function about(doc: string, prefixes: Map<string, string>): Set<string> {
  const out = new Set<string>()
  for (const [, name] of doc.matchAll(ANY_CITATION)) {
    const file = /\.s?v$/.test(name) ? name : prefixes.get(name)
    if (file) out.add(file.split('/').at(-1)!)
  }
  return out
}

/**
 * How much of two paths is the same folder, in segments.
 *
 * A workspace holding two projects holds two files called `uart_receiver.v`,
 * each with a specification of its own. The one that shares more of the path
 * is the one the reader is working in.
 */
export function nearness(one: string, other: string): number {
  const a = one.split('/')
  const b = other.split('/')
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1
  return n
}
