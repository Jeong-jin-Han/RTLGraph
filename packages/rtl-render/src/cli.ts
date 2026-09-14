#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { FILTER_PRESETS, validateComponentGraph, type ComponentGraph, type FilterPreset } from '@rtlgraph/ir'
import { renderPdf, renderSvg } from './index.ts'

// rtlgraph-render <graph.rtlgraph.json> [preset] [--format svg|pdf] [-o file]
// Writes to stdout unless -o is given. PNG needs a browser canvas; use the extension.

const usage = () => {
  process.stderr.write(`usage: rtlgraph-render <graph.rtlgraph.json> [${Object.keys(FILTER_PRESETS).join('|')}] [--format svg|pdf] [-o file]\n`)
  process.exit(2)
}

const args = process.argv.slice(2)
let format = 'svg'
let output: string | undefined
const positional: string[] = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--format') format = args[++i] ?? ''
  else if (args[i] === '-o') output = args[++i]
  else positional.push(args[i])
}
const [file, preset = 'all'] = positional
if (!file || !Object.hasOwn(FILTER_PRESETS, preset) || (format !== 'svg' && format !== 'pdf') || (args.includes('-o') && !output)) usage()

const graph: unknown = JSON.parse(readFileSync(file, 'utf8'))
const result = validateComponentGraph(graph)
for (const d of result.diagnostics) {
  process.stderr.write(`${d.severity} ${d.code}${d.node ? ` [${d.node}]` : ''}${d.signal ? ` [${d.signal}]` : ''}: ${d.msg}\n`)
}
if (!result.ok) process.exit(1)

const options = { filter: FILTER_PRESETS[preset as FilterPreset] }
let bytes: string | Uint8Array
if (format === 'pdf') {
  const pdf = renderPdf(graph as ComponentGraph, options)
  if (pdf.unsupportedText.length > 0) process.stderr.write(`warn: the PDF fonts cannot draw ${pdf.unsupportedText.join(' ')}; shown as "?"\n`)
  bytes = pdf.bytes
} else {
  bytes = renderSvg(graph as ComponentGraph, options)
}
if (output) writeFileSync(output, bytes)
else process.stdout.write(bytes)
