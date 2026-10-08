// What the specification says about the name under the pointer.
//
// Section 6 of a module file describes every signal: where it is made, where it
// is read, what range it holds. That is the documentation a reader of the
// Verilog wants, and it is two files away. This brings it to the pointer, the
// way a library's hover brings a function's doc comment.
//
// It reads, and only reads, what `components/codespec` writes. A name section 6
// never mentions gets no hover at all — a guess here is worse than silence.

import * as vscode from 'vscode'
import { entriesIn, prefixesIn, type Entry } from './steps.ts'
import { sourceOf } from './walk.ts'

/** One spec file, parsed, with what it is about. */
interface Read {
  stamp: number
  entries: Map<string, Entry>
  /** The source files this document cites — the ones it documents. */
  about: Set<string>
}

// Backticks optional, as everywhere else a citation is read: "made at rx:89"
// is a citation whether or not the writer marked it up as one.
const CITATION = /`?([A-Za-z_][\w./-]*(?:\.s?v)?):(\d+)(?:\s*[-–]\s*\d+)?`?/g

/** How much of two paths is the same folder, in segments. */
function shared(one: string, other: string): number {
  const a = one.split('/')
  const b = other.split('/')
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1
  return n
}

/** Every file a document's citations name, through the project's prefixes. */
function about(doc: string, prefixes: Map<string, string>): Set<string> {
  const out = new Set<string>()
  for (const [, name] of doc.matchAll(CITATION)) {
    const file = /\.s?v$/.test(name) ? name : prefixes.get(name)
    if (file) out.add(file.split('/').at(-1)!)
  }
  return out
}

export class SpecHover implements vscode.HoverProvider {
  private readonly specs = new Map<string, Read>()
  private readonly prefixes = new Map<string, Map<string, string>>()

  async provideHover(doc: vscode.TextDocument, at: vscode.Position): Promise<vscode.Hover | undefined> {
    const range = doc.getWordRangeAtPosition(at, /[A-Za-z_]\w*/)
    if (!range) return undefined
    const found = await this.find(doc.getText(range), doc.uri)
    if (!found) return undefined
    return new vscode.Hover(await this.card(found.entry, found.spec), range)
  }

  /**
   * The entry for a name, from the specification that is about this file —
   * and, where several are, the nearest one.
   *
   * A workspace holding two projects holds two files called
   * `uart_receiver.v`, each with its own specification, and the first match
   * is as likely to be the other project's as this one's. Nearest means the
   * longest shared path, which is the folder the reader is working in.
   */
  private async find(word: string, doc: vscode.Uri): Promise<{ entry: Entry; spec: vscode.Uri } | undefined> {
    const here = doc.path.split('/').at(-1)!
    let best: { entry: Entry; spec: vscode.Uri; near: number } | undefined
    let loose: { entry: Entry; spec: vscode.Uri } | undefined
    for (const spec of await vscode.workspace.findFiles('**/spec/*.md', '**/node_modules/**', 40)) {
      const read = await this.read(spec)
      const entry = read?.entries.get(word)
      if (!read || !entry) continue
      if (!read.about.has(here)) { loose ??= { entry, spec }; continue }
      const near = shared(spec.path, doc.path)
      if (!best || near > best.near) best = { entry, spec, near }
    }
    return best ?? loose
  }

  /** Parsed on first ask, and again whenever the file has been written. */
  private async read(spec: vscode.Uri): Promise<Read | undefined> {
    try {
      const stat = await vscode.workspace.fs.stat(spec)
      const had = this.specs.get(spec.toString())
      if (had && had.stamp === stat.mtime) return had
      const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(spec))
      const fresh: Read = {
        stamp: stat.mtime,
        entries: entriesIn(text),
        about: about(text, await this.prefixesFor(spec)),
      }
      this.specs.set(spec.toString(), fresh)
      return fresh
    } catch {
      return undefined // deleted between the search and the read
    }
  }

  /** The folder's `rx:` → `uart_receiver.v` table, read once per folder. */
  private async prefixesFor(spec: vscode.Uri): Promise<Map<string, string>> {
    const folder = vscode.Uri.joinPath(spec, '..')
    const had = this.prefixes.get(folder.toString())
    if (had) return had
    let out = new Map<string, string>()
    try {
      const text = new TextDecoder().decode(
        await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, '00-format.md')))
      out = prefixesIn(text)
    } catch {
      // no format file: only citations that name their own file resolve
    }
    this.prefixes.set(folder.toString(), out)
    return out
  }

  /**
   * The card itself: the entry as the document wrote it, with its citations
   * turned into links, and a link to the entry in the specification.
   */
  private async card(entry: Entry, spec: vscode.Uri): Promise<vscode.MarkdownString> {
    const prefixes = await this.prefixesFor(spec)
    const body = await replace(entry.text, CITATION, async (whole, name, line) => {
      const file = /\.s?v$/.test(name) ? name : prefixes.get(name)
      if (!file) return whole
      // Including citations into the file being read: "made at rx:89" is worth
      // one click whether or not 89 is in this same file.
      const uri = await sourceOf(spec, file)
      return uri ? `[\`${name}:${line}\`](${uri.with({ fragment: `L${line}` })})` : whole
    })
    const where = spec.path.split('/').at(-1)
    const card = new vscode.MarkdownString(
      `**\`${entry.name}\`**\n\n${body}\n\n[${where} §6](${spec.with({ fragment: `L${entry.line + 1}` })})`)
    card.isTrusted = true
    card.supportHtml = false
    return card
  }
}

/** `String.replace` with an async replacer, which the standard one is not. */
async function replace(
  text: string,
  pattern: RegExp,
  by: (whole: string, ...groups: string[]) => Promise<string>,
): Promise<string> {
  const matches = [...text.matchAll(pattern)]
  let out = ''
  let from = 0
  for (const match of matches) {
    out += text.slice(from, match.index) + await by(match[0], ...match.slice(1))
    from = match.index + match[0].length
  }
  return out + text.slice(from)
}
