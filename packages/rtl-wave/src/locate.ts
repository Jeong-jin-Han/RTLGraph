// Which line of the testbench printed this?
//
// A check reaches the report as the words it printed, and the reader's next
// question is always "where does that come from?". The line is findable without
// parsing Verilog: whatever the bench printed, the wording came from a string
// literal in its source, either in the `$display` itself or in the argument of
// the task that did the printing. Find the literal, and the line is the answer.
//
// It reports only what it is sure of. A check printed entirely from variables
// has no literal to find, and gets no line rather than a plausible one.

export interface Located {
  /** Line number, 1-based. */
  line: number
  /** The source text of that line, trimmed — so a reader can see it matched. */
  text: string
  /** How the line relates to the signal, strongest first — see `locateSignal`. */
  kind?: 'clocked' | 'continuous' | 'blocking' | 'declaration'
}

const LITERAL = /"([^"\n]*)"/g

/**
 * What is left of a line once the parts a simulator filled in are gone: the
 * `[%0t]` we ask benches to print, the specifiers themselves, and the brackets
 * that held them — `"[%0t] ok: cleared"` and `"[1480000] ok: cleared"` have to
 * meet somewhere, and this is where.
 */
function words(text: string): string {
  return text
    .replace(/^\[\s*\d+\s*\]\s*/, '')
    .replace(/%[0-9]*[a-zA-Z]/g, ' ')
    .replace(/[[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The line whose string literal the printed line quotes. Longest literal wins,
 * so `"ok: %0s (%h)"` in a task loses to the caller's own wording.
 */
export function locateCheck(source: string, printed: string): Located | undefined {
  const said = words(printed)
  if (said.length < 4) return undefined
  let best: (Located & { length: number }) | undefined
  source.split('\n').forEach((text, index) => {
    for (const [, literal] of text.matchAll(LITERAL)) {
      const piece = words(literal)
      // Long enough to mean something, and actually in what was printed.
      if (piece.length < 6 || !said.includes(piece)) continue
      if (!best || piece.length > best.length) best = { line: index + 1, text: text.trim(), length: piece.length }
    }
  })
  if (!best) return undefined
  const { line, text } = best
  return { line, text }
}

/** Every printed line at once, in the order they were given. */
export function locateChecks(source: string, printed: readonly string[]): (Located | undefined)[] {
  return printed.map(line => locateCheck(source, line))
}

/**
 * Where a signal comes from, in the code. Matching every instant of a waveform
 * to a line is not possible; matching a *signal* to the line that drives it is,
 * and that is the jump a reader actually wants: "this trace — who makes it?"
 *
 * Driving statements win over declarations, because the question is almost
 * always "why does it do that?" rather than "how wide is it?".
 */
export function locateSignal(source: string, name: string): Located | undefined {
  const word = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // In order of how much they answer: a clocked assignment, a continuous one,
  // then the declaration that at least says what it is.
  const kinds = [
    ['clocked', new RegExp(`(^|[^\\w.])${word}\\s*<=`)],
    ['continuous', new RegExp(`\\bassign\\s+${word}\\s*=`)],
    ['blocking', new RegExp(`(^|[^\\w.])${word}\\s*=[^=]`)],
    ['declaration', new RegExp(`\\b(reg|wire|logic|output|input|inout)\\b[^;]*?(^|[^\\w.])${word}\\b`)],
  ] as const
  const lines = source.split('\n')
  for (const [kind, pattern] of kinds) {
    const at = lines.findIndex(line => !line.trim().startsWith('//') && pattern.test(line))
    if (at >= 0) return { line: at + 1, text: lines[at].trim(), kind }
  }
  return undefined
}
