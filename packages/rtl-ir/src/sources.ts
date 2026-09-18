import type { ComponentGraph, Diagnostic, Origin } from './types.ts'

// Cross-checks a graph against the Verilog it claims to describe: the listed
// files exist and every `origin` points at a line that mentions the thing it
// locates. This is what catches an extractor inventing line numbers.

// Reads a file given a '/'-separated path relative to source.root; undefined if missing.
export type ReadSource = (path: string) => string | undefined

const IDENT_CHAR = '[A-Za-z0-9_$]'
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mentions = (text: string, token: string) =>
  new RegExp(`(^|[^A-Za-z0-9_$])${escapeRegExp(token)}(?!${IDENT_CHAR})`).test(text)
const lastSegment = (name: string) => name.replace(/^@/, '').split('.').pop()!

// Inferred elements are named after the net they produce: "op_<net>" for logic
// recovered from an expression, "<net>_reg" for a register recovered from an
// always block, "<net>__t1" for a step of a split expression, "<net>_D" for the
// value going into a register. None of those spellings is in the code, so the
// origin line is allowed to mention the net they are derived from — and, since
// those names are chained ("op_Q_D__t1" is a step of the value going into Q),
// the whole chain back to the name the code does use.
export function originTokens(id: string): string[] {
  const seg = lastSegment(id)
  const tokens = new Set([seg])
  let base = seg
  const peel = (next: string | undefined) => {
    if (next === undefined || next === '' || tokens.has(next)) return false
    base = next
    tokens.add(next)
    return true
  }
  if (base.startsWith('op_')) peel(base.slice(3))
  if (base.endsWith('_reg')) peel(base.slice(0, -4))
  for (let more = true; more; ) {
    more = peel(/^(.+?)__t\d+$/.exec(base)?.[1]) || peel(/^(.+)_[DQ]$/.exec(base)?.[1])
  }
  return [...tokens]
}

export function checkSources(graph: ComponentGraph, read: ReadSource): Diagnostic[] {
  const out: Diagnostic[] = []
  const cache = new Map<string, string[] | undefined>()
  const linesOf = (file: string) => {
    if (!cache.has(file)) cache.set(file, read(file)?.split(/\r?\n/))
    return cache.get(file)
  }

  for (const file of graph.source.files) {
    if (!linesOf(file)) out.push({ severity: 'error', code: 'source-missing', msg: `source file "${file}" not found`, file })
  }
  const lib = graph.source.lib && graph.source.lib !== '.' ? `${graph.source.lib.replace(/\/+$/, '')}/` : ''
  for (const file of graph.source.libFiles ?? []) {
    if (!linesOf(lib + file)) out.push({ severity: 'warn', code: 'source-missing', msg: `library file "${lib + file}" not found`, file: lib + file })
  }

  const check = (origin: Origin, tokens: string[] | RegExp, what: string, at: Partial<Diagnostic>, also: RegExp[] = []) => {
    const where = { ...at, file: origin.file, line: origin.line }
    const lines = linesOf(origin.file)
    if (!lines) {
      out.push({ severity: 'error', code: 'origin', msg: `${what}: file "${origin.file}" not found`, ...where })
      return
    }
    if (!Number.isInteger(origin.line) || origin.line < 1 || origin.line > lines.length) {
      out.push({ severity: 'error', code: 'origin', msg: `${what}: line ${origin.line} is outside the file (${lines.length} lines)`, ...where })
      return
    }
    const text = lines[origin.line - 1]
    const ok = (tokens instanceof RegExp ? tokens.test(text) : tokens.some(t => mentions(text, t))) || also.some(re => re.test(text))
    if (!ok) {
      const expected = tokens instanceof RegExp ? String(tokens) : tokens.map(t => `"${t}"`).join(' or ')
      out.push({ severity: 'warn', code: 'origin-mismatch', msg: `${what}: line ${origin.line} does not mention ${expected}: ${text.trim()}`, ...where })
    }
  }

  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.origin) {
      // A component box's origin may be its instance line or its module declaration.
      const tokens = node.kind === 'component' ? [...originTokens(id), node.module] : originTokens(id)
      // A register recovered from an always block sits on that block, and an
      // "always @(posedge …)" line names the clock, not the register.
      const always = lastSegment(id).endsWith('_reg') ? [/\balways\b/] : []
      check(node.origin, tokens, `node ${id}`, { node: id }, always)
    }
    if (node.kind === 'control' && node.truthTable?.origin) {
      check(node.truthTable.origin, /\b(case[xz]?|if)\b/, `truth table of ${id}`, { node: id })
    }
    if (node.kind === 'control') {
      for (const eq of node.equations ?? []) {
        if (eq.origin) check(eq.origin, originTokens(eq.output), `equation ${eq.output} of ${id}`, { node: id })
      }
    }
  }
  for (const [name, signal] of Object.entries(graph.signals)) {
    if (signal.origin) {
      check(signal.origin, [name, ...(signal.aliases ?? [])].flatMap(originTokens), `signal ${name}`, { signal: name })
    }
  }
  return out
}
