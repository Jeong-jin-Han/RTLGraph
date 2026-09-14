import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { webviewHtml } from '../src/webview/html.ts'

const ROOT = join(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const source = ['src/extension.ts', 'src/editorProvider.ts', 'src/agent/copyAgentSpec.ts'].map(f => readFileSync(join(ROOT, f), 'utf8')).join('\n')

// NodeGraph once declared commands it never registered ("command not found").
test('contributed commands and registered commands are the same set', () => {
  const declared = manifest.contributes.commands.map((c: { command: string }) => c.command).sort()
  const registered = [...source.matchAll(/registerCommand\('([^']+)'/g)]
    .map(m => m[1])
    .filter(id => !id.startsWith('rtlgraph._')) // internal commands stay out of the palette
    .sort()
  assert.deepEqual(declared, registered)
})

test('menus only reference contributed commands', () => {
  const declared = new Set(manifest.contributes.commands.map((c: { command: string }) => c.command))
  const menus = Object.values(manifest.contributes.menus).flat() as { command: string }[]
  assert.ok(menus.length > 0)
  for (const item of menus) assert.ok(declared.has(item.command), item.command)
  assert.deepEqual(manifest.contributes.menus['explorer/context'].map((m: { command: string }) => m.command), ['rtlgraph.copyAgentSpec'])
})

test('custom editor view type is consistent across manifest and provider', () => {
  const viewType = /static readonly viewType = '([^']+)'/.exec(source)?.[1]
  assert.equal(viewType, 'rtlgraph.editor')
  assert.deepEqual(manifest.contributes.customEditors.map((e: { viewType: string }) => e.viewType), [viewType])
  assert.ok(manifest.activationEvents.includes(`onCustomEditor:${viewType}`))
  assert.deepEqual(manifest.contributes.customEditors[0].selector, [
    { filenamePattern: '*.rtlgraph.json' },
    { filenamePattern: '*.rtlgraph-schematic.json' },
  ])
})

test('webview html locks scripts and styles to a nonce', () => {
  const html = webviewHtml({ scriptUri: 'vscode-resource:/dist/webview.js', cspSource: 'vscode-resource:', nonce: 'abc123' })
  assert.match(html, /default-src 'none'/)
  assert.match(html, /script-src 'nonce-abc123'/)
  assert.match(html, /<script nonce="abc123" src="vscode-resource:\/dist\/webview.js"><\/script>/)
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/)
})

test('both bundles build; only the host bundle loads vscode', () => {
  const build = spawnSync(process.execPath, ['esbuild.mjs'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(build.status, 0, build.stderr)
  const host = readFileSync(join(ROOT, 'dist/extension.cjs'), 'utf8')
  const webview = readFileSync(join(ROOT, 'dist/webview.js'), 'utf8')
  assert.match(host, /require\("vscode"\)/)
  assert.doesNotMatch(webview, /require\(|["']vscode["']|["']node:/)
  assert.match(webview, /acquireVsCodeApi/)
})
