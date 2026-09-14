import { runTests } from '@vscode/test-electron'
import * as esbuild from 'esbuild'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

// Runs test-e2e/suite.ts inside a real VS Code with a throwaway profile.
//   VSCODE_EXECUTABLE=/usr/share/code/code  use an installed build instead of downloading one
//   run under `xvfb-run -a` to keep the window off screen

const root = join(import.meta.dirname, '..')
const repo = join(root, '../..')
const scratch = join(repo, '.vscode-test')

await import('../esbuild.mjs')
await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['test-e2e/suite.ts'],
  outfile: join(scratch, 'e2e/suite.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  logLevel: 'warning',
})

for (const dir of ['user-data', 'extensions']) rmSync(join(scratch, dir), { recursive: true, force: true })

try {
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_EXECUTABLE,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(scratch, 'e2e/suite.cjs'),
    extensionTestsEnv: { RTLGRAPH_E2E_FILE: join(repo, 'demo/acc/acc_top.rtlgraph.json') },
    launchArgs: [
      join(repo, 'demo'),
      '--disable-extensions',
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      `--user-data-dir=${join(scratch, 'user-data')}`,
      `--extensions-dir=${join(scratch, 'extensions')}`,
    ],
  })
} catch (err) {
  console.error('end-to-end test failed:', err)
  process.exit(1)
}
