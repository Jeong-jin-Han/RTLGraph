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

/** One step per file, with the stretches in that file merged. */
function stepsForRow(cycle: string, said: string, places: ReturnType<typeof placesIn>): Step[] {
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
    out.push({ cycle, said, file, spans })
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
  let current: { id: string; title: string; steps: Step[]; header: boolean } | undefined
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
      current = { id: heading[1], title: heading[2].trim(), steps: [], header: false }
      continue
    }
    if (!current) continue
    if (line.startsWith('#')) { close(); continue }
    if (!line.trimStart().startsWith('|')) continue
    if (RULE.test(line)) { current.header = true; continue }
    if (!current.header) continue // the first row is the header until the rule
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (cells.length < 2) continue
    const places = placesIn(line, prefixes)
    if (places.length === 0) continue // a row that cites nothing is nowhere to go
    current.steps.push(...stepsForRow(cells[0], cells.slice(1).join(' · '), places))
  }
  close()
  return out
}
