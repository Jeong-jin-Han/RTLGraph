import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  checkSources, graphFileKind, hierarchyEntries, loadHierarchy, validateFsmGraph,
  type Diagnostic, type HierarchyEntry,
} from '@rtlgraph/ir'
import { checkNodeAgainstRegistry, checkSignalWidths } from '@rtlgraph/registry'

// The validator an agent runs on the RTLGraph files it wrote. Bundled into one
// dependency-free file and copied to .agent/rtlgraph/validate.mjs.
//   node .agent/rtlgraph/validate.mjs <top>.rtlgraph.json [...]
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

// The machines a schematic names, checked where they are named: a node pointing
// at a file that is not there, or at one that does not hold a sound machine, is
// as broken as a component box pointing nowhere.
function checkMachines(entry: HierarchyEntry, read: (path: string) => string | undefined): { paths: string[]; found: Diagnostic[] } {
  const paths: string[] = []
  const found: Diagnostic[] = []
  for (const [id, node] of Object.entries(entry.graph.nodes)) {
    const ref = 'fsm' in node ? node.fsm : undefined
    if (typeof ref !== 'string') continue
    const path = join(dirname(entry.path), ref)
    const text = read(path)
    if (text === undefined) {
      found.push({ severity: 'error', code: 'fsm-missing', msg: `${path} not found`, node: id })
      continue
    }
    paths.push(path)
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      found.push({ severity: 'error', code: 'json', msg: `${path}: ${(err as Error).message}`, node: id })
      continue
    }
    found.push(...validateFsmGraph(parsed).diagnostics.map(d => ({ ...d, msg: `${path}: ${d.msg}` })))
  }
  return { paths, found }
}

let failed = false
for (const file of files) {
  const dir = dirname(file)

  // A machine file on its own: there is no hierarchy to walk.
  if (graphFileKind(basename(file)) === 'fsm') {
    const text = readFrom(dir)(basename(file))
    let parsed: unknown
    try {
      parsed = text === undefined ? undefined : JSON.parse(text)
    } catch (err) {
      parsed = undefined
      console.log(file)
      console.log(describe({ severity: 'error', code: 'json', msg: (err as Error).message }))
    }
    const result = parsed === undefined
      ? { diagnostics: [{ severity: 'error' as const, code: 'read', msg: 'the file could not be read' }] }
      : validateFsmGraph(parsed)
    const errors = result.diagnostics.filter(d => d.severity === 'error').length
    const warnings = result.diagnostics.filter(d => d.severity === 'warn').length
    if (parsed !== undefined) console.log(file)
    for (const d of result.diagnostics) console.log(describe(d))
    console.log(`  ${errors} errors, ${warnings} warnings`)
    if (errors > 0) failed = true
    continue
  }

  const { root, diagnostics } = loadHierarchy(basename(file), readFrom(dir))
  const found: Diagnostic[] = [...diagnostics]
  const entries = hierarchyEntries(root)
  const machines: string[] = []
  let recorded = 0
  for (const entry of entries) {
    const g = entry.graph
    recorded += g.diagnostics?.length ?? 0
    const local: Diagnostic[] = []
    for (const [id, node] of Object.entries(g.nodes)) local.push(...checkNodeAgainstRegistry(id, node))
    local.push(...checkSignalWidths(g))
    local.push(...checkSources(g, readFrom(join(dir, dirname(entry.path), g.source.root))))
    const seen = checkMachines(entry, readFrom(dir))
    machines.push(...seen.paths)
    local.push(...seen.found)
    // Findings in a component schematic name the file and the instance they belong to.
    found.push(...local.map(d => (entry.instance ? { ...d, msg: `${entry.path}: ${d.msg}`, node: d.node ? `${entry.instance}/${d.node}` : entry.instance } : d)))
  }

  const errors = found.filter(d => d.severity === 'error').length
  const warnings = found.filter(d => d.severity === 'warn').length
  console.log(file)
  for (const entry of entries.slice(1)) console.log(`  + ${entry.path} (component ${entry.instance})`)
  for (const path of machines) console.log(`  + ${path} (state machine)`)
  for (const d of found) console.log(describe(d))
  const where = entries.length + machines.length > 1 ? 'files' : 'file'
  console.log(`  ${errors} errors, ${warnings} warnings${recorded ? ` (plus ${recorded} diagnostics recorded in the ${where})` : ''}`)
  if (errors > 0) failed = true
}
process.exit(failed ? 1 : 0)
