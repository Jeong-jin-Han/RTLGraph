import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FILTER_PRESETS, type ComponentGraph } from '@rtlgraph/ir'
import { buildScene, DIM_OPACITY, renderPdf, renderSvg } from '../src/index.ts'

const DEMO = join(import.meta.dirname, '../../../demo/acc/acc')
const graph = JSON.parse(readFileSync(join(DEMO, 'acc.rtlgraph-schematic.json'), 'utf8')) as ComponentGraph
const latin1 = (bytes: Uint8Array) => Array.from(bytes, b => String.fromCharCode(b)).join('')

test('PDF has a valid cross-reference table', () => {
  const text = latin1(renderPdf(graph).bytes)
  assert.ok(text.startsWith('%PDF-1.4\n'))
  assert.ok(text.endsWith('%%EOF\n'))
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)![1])
  assert.equal(text.slice(startxref, startxref + 4), 'xref')
  const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]))
  assert.equal(entries.length, 7)
  entries.forEach((offset, i) => assert.equal(text.slice(offset, offset + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`))
  const length = Number(/\/Length (\d+) >>\nstream\n/.exec(text)![1])
  const start = text.indexOf('stream\n') + 'stream\n'.length
  assert.equal(text.slice(start + length, start + length + '\nendstream'.length), '\nendstream')
})

test('page size follows the cropped view and labels are drawn as text', () => {
  const scene = buildScene(graph, { filter: FILTER_PRESETS.datapath })
  const text = latin1(renderPdf(graph, { filter: FILTER_PRESETS.datapath }).bytes)
  assert.match(text, new RegExp(`/MediaBox \\[0 0 ${scene.view.w} ${scene.view.h}\\]`))
  for (const label of ['CNT_FF', 'ACC_FF', 'OUT_FF', '+1', 'ADD', 'SUB', 'ACC']) assert.ok(text.includes(`(${label}) Tj`), label)
  assert.ok(text.includes('(acc_cp) Tj'), 'the control block is dimmed, not dropped')
  // What the filter passed over is faded through a graphics state of its own.
  assert.match(text, new RegExp(`/ExtGState << /GS0 << /Type /ExtGState /ca ${DIM_OPACITY} /CA ${DIM_OPACITY} >> >>`))
  assert.ok(text.includes('/GS0 gs'))
  const everything = latin1(renderPdf(graph).bytes)
  assert.ok(!everything.includes('/ExtGState') && !everything.includes('/GS0 gs'))
})

test('PDF output is deterministic', () => {
  assert.deepEqual(renderPdf(graph).bytes, renderPdf(graph).bytes)
})

test('text the built-in fonts cannot draw is reported, and PDF strings are escaped', () => {
  const g = structuredClone(graph)
  g.nodes.control_path = { ...g.nodes.control_path, label: '제어 (cp)\\' } as typeof g.nodes.control_path
  const pdf = renderPdf(g)
  assert.deepEqual(pdf.unsupportedText.sort(), ['어', '제'])
  assert.ok(latin1(pdf.bytes).includes('(?? \\(cp\\)\\\\) Tj'))
})

test('SVG and PDF come from the same scene', () => {
  const scene = buildScene(graph)
  const svgTexts = [...renderSvg(graph).matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map(m => m[1].replace(/&amp;/g, '&'))
  const pdfTexts = [...latin1(renderPdf(graph).bytes).matchAll(/\((.*)\) Tj/g)].map(m => m[1])
  assert.deepEqual(pdfTexts, svgTexts)
  assert.equal(scene.groups.length, (renderSvg(graph).match(/<g class=/g) ?? []).length)
})

test('poppler reads the PDF back (skipped when pdftotext is missing)', t => {
  const probe = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' })
  if (probe.error) return t.skip('pdftotext not installed')
  const dir = mkdtempSync(join(tmpdir(), 'rtlgraph-pdf-'))
  const file = join(dir, 'acc_top.pdf')
  writeFileSync(file, renderPdf(graph).bytes)
  const out = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
  assert.equal(out.status, 0, out.stderr)
  for (const label of ['acc_cp', 'CNT_FF', 'OUT_FF', 'ACC_SEL']) assert.ok(out.stdout.includes(label), label)
})
