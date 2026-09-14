#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { FILTER_PRESETS, loadHierarchy, type FilterPreset } from '@rtlgraph/ir'
import { renderHierarchyPdf, renderHierarchySvg } from './index.ts'

// rtlgraph-render <file> [preset] [--format svg|pdf] [--unfold] [-o file]
// <file> is a root *.rtlgraph.json or a *.rtlgraph-schematic.json; the component
// schematics it refers to are loaded too, and --unfold opens every one of them.
// Writes to stdout unless -o is given. PNG needs a browser canvas; use the extension.

const usage = () => {
  process.stderr.write(`usage: rtlgraph-render <file> [${Object.keys(FILTER_PRESETS).join('|')}] [--format svg|pdf] [--unfold] [-o file]\n`)
  process.exit(2)
}

const args = process.argv.slice(2)
let format = 'svg'
let output: string | undefined
let unfold = false
const positional: string[] = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--format') format = args[++i] ?? ''
  else if (args[i] === '-o') output = args[++i]
  else if (args[i] === '--unfold') unfold = true
  else positional.push(args[i])
}
const [file, preset = 'all'] = positional
if (!file || !Object.hasOwn(FILTER_PRESETS, preset) || (format !== 'svg' && format !== 'pdf') || (args.includes('-o') && !output)) usage()

const read = (path: string) => {
  try {
    return readFileSync(join(dirname(file), path), 'utf8')
  } catch {
    return undefined
  }
}
const { root, diagnostics } = loadHierarchy(basename(file), read)
for (const d of diagnostics) {
  process.stderr.write(`${d.severity} ${d.code}${d.node ? ` [${d.node}]` : ''}${d.signal ? ` [${d.signal}]` : ''}: ${d.msg}\n`)
}
if (!root || diagnostics.some(d => d.severity === 'error')) process.exit(1)

const options = { filter: FILTER_PRESETS[preset as FilterPreset], isUnfolded: () => unfold }
let bytes: string | Uint8Array
if (format === 'pdf') {
  const pdf = renderHierarchyPdf(root, options)
  if (pdf.unsupportedText.length > 0) process.stderr.write(`warn: the PDF fonts cannot draw ${pdf.unsupportedText.join(' ')}; shown as "?"\n`)
  bytes = pdf.bytes
} else {
  bytes = renderHierarchySvg(root, options)
}
if (output) writeFileSync(output, bytes)
else process.stdout.write(bytes)
