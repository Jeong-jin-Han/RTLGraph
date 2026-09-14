import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILTER_PRESETS } from '@rtlgraph/ir'
import { DEFAULT_EXPORT_FOLDER, exportFileName, exportFolderName, graphBaseName, viewName } from '../src/exportFiles.ts'

test('the graph name drops the .rtlgraph.json suffix', () => {
  assert.equal(graphBaseName('/work/acc/acc_top.rtlgraph.json'), 'acc_top')
  assert.equal(graphBaseName('C:\\work\\sys.RTLGRAPH.JSON'), 'sys')
  assert.equal(graphBaseName('plain.json'), 'plain')
  assert.equal(graphBaseName('.rtlgraph.json'), 'rtlgraph')
})

test('export folder: default, custom patterns, and nothing outside the graph directory', () => {
  assert.equal(exportFolderName(undefined, 'acc_top'), '.out-acc_top')
  assert.equal(exportFolderName('out-${name}', 'acc_top'), 'out-acc_top')
  assert.equal(exportFolderName('exports/${name}', 'acc_top'), 'exports/acc_top')
  for (const unsafe of ['../${name}', '/tmp/${name}', 'C:/x', 'a/../../b', '', '  ', './${name}']) {
    assert.equal(exportFolderName(unsafe, 'acc_top'), '.out-acc_top', unsafe)
  }
})

test('file names carry the view: a preset name or the raw filter', () => {
  assert.equal(viewName(FILTER_PRESETS.datapath), 'datapath')
  assert.equal(viewName({ flow: ['control'], time: ['seq'] }), 'control.seq')
  assert.equal(exportFileName('acc_top', FILTER_PRESETS.all, 'pdf'), 'acc_top.all.pdf')
  assert.equal(exportFileName('acc_top', { flow: ['data', 'control'], time: ['comb'] }, 'png'), 'acc_top.comb.png')
})

test('the manifest setting defaults to the same folder pattern', () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8'))
  assert.equal(manifest.contributes.configuration.properties['rtlgraph.export.folder'].default, DEFAULT_EXPORT_FOLDER)
})
