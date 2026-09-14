#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { FILTER_PRESETS, validateComponentGraph, type FilterPreset } from '@rtlgraph/ir'
import { renderSvg } from './index.ts'

const [file, preset = 'all'] = process.argv.slice(2)
if (!file || !Object.hasOwn(FILTER_PRESETS, preset)) {
  process.stderr.write(`usage: rtlgraph-render <graph.rtlgraph.json> [${Object.keys(FILTER_PRESETS).join('|')}] > out.svg\n`)
  process.exit(2)
}

const graph: unknown = JSON.parse(readFileSync(file, 'utf8'))
const result = validateComponentGraph(graph)
for (const d of result.diagnostics) {
  process.stderr.write(`${d.severity} ${d.code}${d.node ? ` [${d.node}]` : ''}${d.signal ? ` [${d.signal}]` : ''}: ${d.msg}\n`)
}
if (!result.ok) process.exit(1)

process.stdout.write(renderSvg(graph as Parameters<typeof renderSvg>[0], { filter: FILTER_PRESETS[preset as FilterPreset] }))
