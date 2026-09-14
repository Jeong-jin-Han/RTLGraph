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

// Inferred nodes are named after the net they produce: "op_<net>" for logic
// recovered from an expression, "<net>_reg" for a register recovered from an
// always block. Their origin line mentions that net rather than the id.
export function originTokens(id: string): string[] {
  const seg = lastSegment(id)
  const tokens = [seg]
  if (seg.startsWith('op_') && seg.length > 3) tokens.push(seg.slice(3))
  if (seg.endsWith('_reg') && seg.length > 4) tokens.push(seg.slice(0, -4))
  return tokens
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

  const check = (origin: Origin, tokens: string[] | RegExp, what: string, at: Partial<Diagnostic>) => {
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
    const ok = tokens instanceof RegExp ? tokens.test(text) : tokens.some(t => mentions(text, t))
    if (!ok) {
      const expected = tokens instanceof RegExp ? String(tokens) : tokens.map(t => `"${t}"`).join(' or ')
      out.push({ severity: 'warn', code: 'origin-mismatch', msg: `${what}: line ${origin.line} does not mention ${expected}: ${text.trim()}`, ...where })
    }
  }

  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.origin) check(node.origin, originTokens(id), `node ${id}`, { node: id })
    if (node.kind === 'control' && node.truthTable?.origin) {
      check(node.truthTable.origin, /\b(case[xz]?|if)\b/, `truth table of ${id}`, { node: id })
    }
  }
  for (const [name, signal] of Object.entries(graph.signals)) {
    if (signal.origin) check(signal.origin, [name, ...(signal.aliases ?? [])].map(lastSegment), `signal ${name}`, { signal: name })
  }
  return out
}
