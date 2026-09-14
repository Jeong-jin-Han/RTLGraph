import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { checkSources, validateComponentGraph, type ComponentGraph, type Diagnostic } from '@rtlgraph/ir'
import { checkNodeAgainstRegistry, checkSignalWidths } from '@rtlgraph/registry'

// The validator an agent runs on the *.rtlgraph.json it wrote. Bundled into one
// dependency-free file and copied to .agent/rtlgraph-validate.mjs.
//   node .agent/rtlgraph-validate.mjs <file.rtlgraph.json> [...]
// Exit code 1 when any file has errors.

const files = process.argv.slice(2)
if (files.length === 0) {
  process.stderr.write('usage: node rtlgraph-validate.mjs <file.rtlgraph.json> [...]\n')
  process.exit(2)
}

const describe = (d: Diagnostic) => {
  const where = [d.file && `${d.file}${d.line ? `:${d.line}` : ''}`, d.node && `node ${d.node}`, d.signal && `net ${d.signal}`]
    .filter(Boolean)
    .join(', ')
  return `  ${d.severity.padEnd(5)} ${d.code}${where ? ` (${where})` : ''}: ${d.msg}`
}

let failed = false
for (const file of files) {
  const found: Diagnostic[] = []
  let graph: unknown
  try {
    graph = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    found.push({ severity: 'error', code: 'json', msg: (err as Error).message })
  }
  let recorded = 0
  if (graph !== undefined) {
    const result = validateComponentGraph(graph)
    found.push(...result.diagnostics)
    if (result.ok) {
      const g = graph as ComponentGraph
      recorded = g.diagnostics?.length ?? 0
      for (const [id, node] of Object.entries(g.nodes)) found.push(...checkNodeAgainstRegistry(id, node))
      found.push(...checkSignalWidths(g))
      const root = join(dirname(file), g.source.root)
      found.push(...checkSources(g, path => {
        try {
          return readFileSync(join(root, path), 'utf8')
        } catch {
          return undefined
        }
      }))
    }
  }

  const errors = found.filter(d => d.severity === 'error').length
  const warnings = found.filter(d => d.severity === 'warn').length
  console.log(file)
  for (const d of found) console.log(describe(d))
  console.log(`  ${errors} errors, ${warnings} warnings${recorded ? ` (plus ${recorded} diagnostics recorded in the file)` : ''}`)
  if (errors > 0) failed = true
}
process.exit(failed ? 1 : 0)
