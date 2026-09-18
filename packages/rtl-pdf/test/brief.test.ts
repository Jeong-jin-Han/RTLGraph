import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { findQuoteInPages } from '../src/match.ts'
import { piecesFrom, type TextItem } from '../src/pieces.ts'

// The matcher against real documents: every sentence a demo quotes is looked for
// in the PDF it names, through pdf.js, with the geometry a page really has.
//
// The IR test already checks the sentence is in the file's bytes. This is the
// other half — that the highlighter can *find* it and paint it somewhere sane,
// which is what the reader sees.

const DEMO = join(import.meta.dirname, '../../../demo')

const pages = async (path: string) => {
  const data = new Uint8Array(readFileSync(path))
  const doc = await getDocument({ data, verbosity: 0 }).promise
  const out = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: 1 })
    out.push({ pieces: piecesFrom((await page.getTextContent()).items as TextItem[], viewport), viewport })
  }
  return out
}

// Every { quote, page } in the demos, with the document it belongs to.
function quoted(): { where: string; file: string; quote: string; page?: number }[] {
  const found: { where: string; file: string; quote: string; page?: number }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.rtlgraph(-schematic|-fsm)?\.json$/.test(entry.name)) {
        const graph = JSON.parse(readFileSync(path, 'utf8'))
        const root = join(dir, graph.source.root ?? '.')
        for (const [id, thing] of [...Object.entries(graph.nodes ?? {}), ...Object.entries(graph.signals ?? {})]) {
          const spec = (thing as { spec?: { quote: string; page?: number; file?: string } }).spec
          if (!spec) continue
          const file = spec.file ?? graph.source.spec
          assert.ok(file, `${path}: ${id} quotes a document it does not name`)
          found.push({ where: `${entry.name}:${id}`, file: join(root, file), quote: spec.quote, page: spec.page })
        }
      }
    }
  }
  walk(DEMO)
  return found
}

test('every sentence a demo quotes is found in its document, on the page it says', async () => {
  const refs = quoted()
  assert.equal(refs.length, 9, 'demo/pwm cites six sentences, demo/hw three')

  const read = new Map<string, Awaited<ReturnType<typeof pages>>>()
  for (const ref of refs) {
    if (!read.has(ref.file)) read.set(ref.file, await pages(ref.file))
    const document = read.get(ref.file)!
    const hit = findQuoteInPages(document.map(p => p.pieces), ref.quote, ref.page)
    assert.ok(hit, `${ref.where}: "${ref.quote}" is not findable in ${ref.file}`)
    assert.equal(hit.highlight.exact, true, `${ref.where}: only a fuzzy match, so the document has moved on`)
    assert.equal(hit.page, ref.page ?? 1, `${ref.where}: it is on page ${hit.page}, not ${ref.page}`)

    // A highlight that falls off the page would be worse than none.
    const { width, height } = document[hit.page - 1].viewport
    for (const rect of hit.highlight.rects) {
      assert.ok(rect.x >= 0 && rect.x + rect.w <= width + 1, `${ref.where}: ${rect.x}..${rect.x + rect.w} is outside the page`)
      assert.ok(rect.y >= 0 && rect.y + rect.h <= height + 1, `${ref.where}: ${rect.y}..${rect.y + rect.h} is outside the page`)
      assert.ok(rect.w > 4 && rect.h > 4, `${ref.where}: a ${rect.w}x${rect.h} box is not a highlight`)
    }
  }
})
