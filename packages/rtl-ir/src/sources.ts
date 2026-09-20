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

// `source.root` is relative to the JSON file, and so is the folder the files
// were found in — the new root is simply the two put together.
function normalizeRoot(root: string, found: string): string {
  const parts = [...(root === '.' || root === '' ? [] : root.split('/')), ...found.split('/')]
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..' && out.length > 0 && out[out.length - 1] !== '..') out.pop()
    else out.push(part)
  }
  return out.join('/') || '.'
}

export function checkSources(graph: ComponentGraph, read: ReadSource): Diagnostic[] {
  const out: Diagnostic[] = []
  const cache = new Map<string, string[] | undefined>()
  const linesOf = (file: string) => {
    if (!cache.has(file)) cache.set(file, read(file)?.split(/\r?\n/))
    return cache.get(file)
  }

  // A name the code uses must be on the line it claims; a name the extractor had
  // to invent — a condition used twice, the enable of a register recovered from an
  // always block, a block of assigns drawn as one control node — is on no line at
  // all, so for those the line has to name something the element is wired to.
  // "Is this a name the code uses?" — asked of the file the element came from,
  // not of the whole project. A project can hold two modules with a wire of the
  // same name (uart_transmitter has bit_counter_d, uart_receiver invents one),
  // and the second would otherwise be held to the first one's spelling.
  const known = new Map<string, boolean>()
  const declared = (token: string, file?: string) => {
    const where = file !== undefined && graph.source.files.includes(file) ? [file] : graph.source.files
    const key = `${where.join('|')}\u0000${token}`
    if (!known.has(key)) {
      known.set(key, where.some(f => (linesOf(f) ?? []).some(line => mentions(line, token))))
    }
    return known.get(key)!
  }
  const netsAt = new Map<string, Set<string>>() // node id -> the nets on its pins
  for (const [name, signal] of Object.entries(graph.signals)) {
    for (const ref of [signal.driver, ...(Array.isArray(signal.sinks) ? signal.sinks : [])]) {
      const node = ref.replace(/^@/, '@').split(':')[0]
      netsAt.set(node, (netsAt.get(node) ?? new Set()).add(name))
    }
  }
  // Around an invented name: the nets on its own pins, and the nets on the pins of
  // whatever it is wired to — the line that computes it names its inputs.
  const around = (id: string): string[] => {
    const nets = new Set(netsAt.get(id) ?? [])
    for (const name of [...nets]) {
      const signal = graph.signals[name]
      if (!signal) continue
      for (const ref of [signal.driver, ...(signal.sinks ?? [])]) {
        for (const other of netsAt.get(ref.split(':')[0]) ?? []) nets.add(other)
      }
    }
    return [...nets]
  }

  // When nothing is where `source.root` says, the cause is one thing, not one
  // thing per file: the JSON was moved (into a folder of its own, say) and the
  // root was left behind. Saying it once — with the folder the code seems to be
  // in — beats a page of "not found" that never names the reason.
  const missing = graph.source.files.filter(file => !linesOf(file))
  const rootWrong = missing.length > 0 && missing.length === graph.source.files.length
  if (rootWrong) {
    const first = graph.source.files[0]
    const elsewhere = ['..', '../..', '../src', 'src', '../rtl', '../hdl']
      .find(where => read(`${where}/${first}`) !== undefined)
    const root = graph.source.root === '.' || graph.source.root === '' ? 'the folder of this file' : `"${graph.source.root}"`
    out.push({
      severity: 'error',
      code: 'source-root',
      msg: elsewhere === undefined
        ? `none of the ${missing.length} source files are where source.root (${root}) points`
        : `none of the ${missing.length} source files are where source.root (${root}) points — "${first}" is at "${elsewhere}/${first}", so source.root should be "${normalizeRoot(graph.source.root, elsewhere)}"`,
      file: first,
    })
  } else {
    for (const file of missing) {
      out.push({ severity: 'error', code: 'source-missing', msg: `source file "${file}" not found`, file })
    }
  }
  const lib = graph.source.lib && graph.source.lib !== '.' ? `${graph.source.lib.replace(/\/+$/, '')}/` : ''
  const libFiles = graph.source.libFiles ?? []
  const libMissing = libFiles.filter(file => !linesOf(lib + file))
  // The shared library has a root of its own, and it goes wrong the same way.
  if (libMissing.length > 0 && libMissing.length === libFiles.length) {
    const first = libFiles[0]
    const elsewhere = ['..', '../..', '../../..']
      .find(where => read(`${where}/${lib}${first}`) !== undefined)
    out.push({
      severity: 'warn',
      code: 'source-lib',
      msg: elsewhere === undefined
        ? `none of the ${libMissing.length} library files are under source.lib ("${graph.source.lib ?? '.'}")`
        : `none of the ${libMissing.length} library files are under source.lib ("${graph.source.lib ?? '.'}") — "${first}" is at "${elsewhere}/${lib}${first}", so source.lib should be "${normalizeRoot(graph.source.lib ?? '.', elsewhere)}"`,
      file: lib + first,
    })
  } else {
    for (const file of libMissing) {
      out.push({ severity: 'warn', code: 'source-missing', msg: `library file "${lib + file}" not found`, file: lib + file })
    }
  }

  const check = (origin: Origin, tokens: string[] | RegExp, what: string, at: Partial<Diagnostic>, also: RegExp[] = []) => {
    const where = { ...at, file: origin.file, line: origin.line }
    const lines = linesOf(origin.file)
    if (!lines) {
      // One broken root is one fault, not one per element: it has been reported.
      if (!rootWrong) out.push({ severity: 'error', code: 'origin', msg: `${what}: file "${origin.file}" not found`, ...where })
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
      const own = node.kind === 'component' ? [...originTokens(id), node.module] : originTokens(id)
      // A register or a block recovered from an always block sits on that block,
      // and an "always" line names the clock, not what was recovered from it.
      const recovered = !own.some(token => declared(token, node.origin?.file))
      const always = recovered || lastSegment(id).endsWith('_reg') ? [/\balways\b/] : []
      const tokens = recovered ? [...own, ...around(id)] : own
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
      const own = [name, ...(signal.aliases ?? [])].flatMap(originTokens)
      const tokens = own.some(token => declared(token, signal.origin?.file))
        ? own
        : [...own, ...new Set([signal.driver, ...(signal.sinks ?? [])].flatMap(ref => around(ref.split(':')[0])))]
      check(signal.origin, tokens, `signal ${name}`, { signal: name })
    }
  }
  return out
}
