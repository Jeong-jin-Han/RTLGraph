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
    // The requirement viewer. ESM, not IIFE: pdf.js is shipped as a module and
    // reads import.meta.url, which an IIFE has nowhere to put.
    ...common,
    entryPoints: ['src/webview/pdf.ts'],
    outfile: 'dist/pdfview.js',
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
  },
]

// pdf.js reads these at run time, per document: the base-14 fonts a PDF is
// allowed to leave out, and the character maps a CJK document needs. They are
// copied rather than bundled because pdf.js fetches them by URL.
const require = createRequire(import.meta.url)
const pdfjs = require.resolve('pdfjs-dist/package.json').replace(/package\.json$/, '')
mkdirSync(`${import.meta.dirname}/dist/pdfjs`, { recursive: true })
for (const part of ['standard_fonts', 'cmaps']) {
  cpSync(`${pdfjs}${part}`, `${import.meta.dirname}/dist/pdfjs/${part}`, { recursive: true })
}
// The viewer engine's stylesheet (page frames, text layer, find highlights) and
// the worker, which the reader fetches and starts from a blob.
cpSync(`${pdfjs}legacy/web/pdf_viewer.css`, `${import.meta.dirname}/dist/pdfjs/pdf_viewer.css`)
cpSync(`${pdfjs}legacy/build/pdf.worker.min.mjs`, `${import.meta.dirname}/dist/pdfjs/pdf.worker.mjs`)

if (watch) {
  for (const config of configs) await (await esbuild.context(config)).watch()
} else {
  await Promise.all(configs.map(config => esbuild.build(config)))
}
