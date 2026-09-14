import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { checkSources, hierarchyEntries, loadHierarchy, type Diagnostic } from '@rtlgraph/ir'
import { checkNodeAgainstRegistry, checkSignalWidths } from '@rtlgraph/registry'

// The validator an agent runs on the RTLGraph files it wrote. Bundled into one
// dependency-free file and copied to .agent/rtlgraph-validate.mjs.
//   node .agent/rtlgraph-validate.mjs <top>.rtlgraph.json [...]
// A root or schematic file is checked together with every component schematic it
// reaches, including that each component box matches the schematic it points at.
// Exit code 1 when any file has errors.

const files = process.argv.slice(2)
if (files.length === 0) {
  process.stderr.write('usage: node rtlgraph-validate.mjs <top>.rtlgraph.json [...]\n')
  process.exit(2)
}

const describe = (d: Diagnostic) => {
  const where = [d.file && `${d.file}${d.line ? `:${d.line}` : ''}`, d.node && `node ${d.node}`, d.signal && `net ${d.signal}`]
    .filter(Boolean)
    .join(', ')
  return `  ${d.severity.padEnd(5)} ${d.code}${where ? ` (${where})` : ''}: ${d.msg}`
}

const readFrom = (dir: string) => (path: string) => {
  try {
    return readFileSync(join(dir, path), 'utf8')
  } catch {
    return undefined
  }
}

let failed = false
for (const file of files) {
  const dir = dirname(file)
  const { root, diagnostics } = loadHierarchy(basename(file), readFrom(dir))
  const found: Diagnostic[] = [...diagnostics]
  const entries = hierarchyEntries(root)
  let recorded = 0
  for (const entry of entries) {
    const g = entry.graph
    recorded += g.diagnostics?.length ?? 0
    const local: Diagnostic[] = []
    for (const [id, node] of Object.entries(g.nodes)) local.push(...checkNodeAgainstRegistry(id, node))
    local.push(...checkSignalWidths(g))
    local.push(...checkSources(g, readFrom(join(dir, dirname(entry.path), g.source.root))))
    // Findings in a component schematic name the file and the instance they belong to.
    found.push(...local.map(d => (entry.instance ? { ...d, msg: `${entry.path}: ${d.msg}`, node: d.node ? `${entry.instance}/${d.node}` : entry.instance } : d)))
  }

  const errors = found.filter(d => d.severity === 'error').length
  const warnings = found.filter(d => d.severity === 'warn').length
  console.log(file)
  for (const entry of entries.slice(1)) console.log(`  + ${entry.path} (component ${entry.instance})`)
  for (const d of found) console.log(describe(d))
  const where = entries.length > 1 ? 'files' : 'file'
  console.log(`  ${errors} errors, ${warnings} warnings${recorded ? ` (plus ${recorded} diagnostics recorded in the ${where})` : ''}`)
  if (errors > 0) failed = true
}
process.exit(failed ? 1 : 0)
