import * as esbuild from 'esbuild'
import { cpSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

// Two bundles: the extension host (Node, `vscode` provided at runtime) and the
// webview (browser). The @rtlgraph/* packages are TypeScript sources and get
// bundled into both as needed.

const watch = process.argv.includes('--watch')
const production = process.argv.includes('--production')

const common = {
  absWorkingDir: import.meta.dirname,
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'warning',
}

const configs = [
  {
    ...common,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.cjs',
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['vscode'],
  },
  {
    // Copied alone into a user's .agent/ folder, so no source map beside it.
    ...common,
    sourcemap: false,
    entryPoints: ['src/agent/validate-cli.ts'],
    outfile: 'dist/agent/rtlgraph-validate.mjs',
    platform: 'node',
    format: 'esm',
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    ...common,
    entryPoints: ['src/webview/main.ts'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  },
  {
    // The bridge that drives pdf.js's viewer. A module, and a small one: the
    // viewer itself is Mozilla's, mounted from assets/pdfjs-viewer.
    ...common,
    entryPoints: ['src/webview/pdf.ts'],
    outfile: 'dist/pdfjs-viewer/web/bridge.mjs',
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
  },
]

// The requirement reader is Mozilla's own viewer. What the repository carries is
// only the part that is not on npm — viewer.html, viewer.mjs, viewer.css, its
// images and two locales, from the pdf.js 6.3.289 legacy release. Everything
// else (the library, the worker, the fonts, the character maps, the wasm
// decoders) comes out of the installed pdfjs-dist, so the two cannot drift.
//
// Legacy, not modern: pdf.js 6 calls Map.getOrInsertComputed, which the Electron
// behind VS Code does not have; the legacy bundles carry the polyfill.
const require = createRequire(import.meta.url)
const pdfjs = require.resolve('pdfjs-dist/package.json').replace(/package\.json$/, '')
const viewer = `${import.meta.dirname}/dist/pdfjs-viewer`
mkdirSync(`${viewer}/build`, { recursive: true })
cpSync(`${import.meta.dirname}/assets/pdfjs-viewer`, viewer, { recursive: true })
cpSync(`${pdfjs}legacy/build/pdf.min.mjs`, `${viewer}/build/pdf.mjs`)
cpSync(`${pdfjs}legacy/build/pdf.worker.min.mjs`, `${viewer}/build/pdf.worker.mjs`)
for (const part of ['standard_fonts', 'cmaps', 'wasm', 'iccs']) {
  cpSync(`${pdfjs}${part}`, `${viewer}/web/${part}`, { recursive: true })
}

if (watch) {
  for (const config of configs) await (await esbuild.context(config)).watch()
} else {
  await Promise.all(configs.map(config => esbuild.build(config)))
}
