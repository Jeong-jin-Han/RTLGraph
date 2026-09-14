import * as esbuild from 'esbuild'

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
]

if (watch) {
  for (const config of configs) await (await esbuild.context(config)).watch()
} else {
  await Promise.all(configs.map(config => esbuild.build(config)))
}
