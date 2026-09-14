// Builds .agent/ENVIRONMENT.md from probed tool versions. Pure — the extension
// host runs the probes — so the report can be tested with made-up facts.

export const PROBES = {
  node: 'node --version',
  python: 'python3 --version',
  pyverilog: 'python3 -c "import pyverilog; print(pyverilog.__version__)"',
  iverilog: 'iverilog -V',
  verilator: 'verilator --version',
  yosys: 'yosys -V',
  xvlog: 'xvlog --version',
  gtkwave: 'gtkwave --version',
} as const

export type ProbedTool = keyof typeof PROBES

export type EnvironmentFacts = { [K in ProbedTool]?: string } & {
  generated: string // ISO time
  platform: string // process.platform
  vivadoSettings: string[] // settings64.sh files found on disk
}

const install = (platform: string, apt: string, brew: string) =>
  platform === 'linux' ? `Install: \`sudo apt install ${apt}\`` : platform === 'darwin' ? `Install: \`brew install ${brew}\`` : 'Not found'

export function buildEnvironmentReport(f: EnvironmentFacts): string {
  const has = (value: string | undefined) => (value ? `✅ \`${value}\`` : '❌')
  const vivado = f.xvlog ?? (f.vivadoSettings.length > 0 ? `settings: ${f.vivadoSettings[f.vivadoSettings.length - 1]}` : undefined)
  const simulator = f.iverilog
    ? 'Icarus Verilog: `iverilog -g2005 -o /tmp/top.vvp <files> && vvp /tmp/top.vvp`'
    : f.xvlog
      ? 'Vivado: `xvlog <files> && xelab <top> -s top_sim && xsim top_sim -R`'
      : f.vivadoSettings.length > 0
        ? `Vivado (not on PATH): \`source ${f.vivadoSettings[f.vivadoSettings.length - 1]}\` first, then \`xvlog <files> && xelab <top> -s top_sim && xsim top_sim -R\``
        : undefined

  const lines = [
    '# RTLGraph — Agent Environment Report',
    '',
    '> Written by `RTLGraph: Copy Agent Spec to Workspace`. Lists the tools installed on this machine;',
    '> run the command again to refresh it.',
    '',
    `Generated: \`${f.generated}\` · Platform: \`${f.platform}\``,
    '',
    '## Required',
    '',
    '| Tool | Available | Use |',
    '|---|---|---|',
    `| Node.js | ${has(f.node)} | \`node .agent/rtlgraph-validate.mjs <file>\` — validate every \`*.rtlgraph.json\` you write |`,
    '',
    '## Verilog tools',
    '',
    'Workflow B (writing or refactoring RTL) needs a simulator. Workflow A only reads code, but a',
    'compile or lint pass helps confirm widths and drivers.',
    '',
    '| Tool | Available | Use |',
    '|---|---|---|',
    `| Icarus Verilog | ${has(f.iverilog)} | ${f.iverilog ? 'compile, elaborate, simulate' : install(f.platform, 'iverilog', 'icarus-verilog')} |`,
    `| Verilator | ${has(f.verilator)} | ${f.verilator ? 'lint drivers and widths: `verilator --lint-only -Wall <files>`' : install(f.platform, 'verilator', 'verilator')} |`,
    `| Vivado (xvlog/xelab/xsim) | ${has(vivado)} | ${vivado ? 'vendor compile, elaborate, simulate' : 'Not found'} |`,
    `| Yosys | ${has(f.yosys)} | ${f.yosys ? 'synthesis-level checks' : install(f.platform, 'yosys', 'yosys')} |`,
    `| GTKWave | ${has(f.gtkwave)} | ${f.gtkwave ? 'waveform viewer' : install(f.platform, 'gtkwave', 'gtkwave')} |`,
    `| Python 3 | ${has(f.python)} | scripting |`,
    `| pyverilog | ${has(f.pyverilog)} | ${f.pyverilog ? 'Verilog parser library' : 'optional — `pip install pyverilog`'} |`,
    '',
    '## Recommendations',
    '',
    f.node
      ? '- **Validate** each file with `node .agent/rtlgraph-validate.mjs <file>` until it reports `0 errors`.'
      : '- ⚠️ **Node.js not found** — the validator cannot run. Go through the spec checklist by hand and tell the user to install Node.js ≥ 18.',
    simulator
      ? `- **Simulate** with ${simulator}.`
      : '- ⚠️ **No Verilog simulator found** — Workflow B cannot verify behaviour or baselines; tell the user before changing code.',
    ...(f.verilator ? ['- **Lint** with `verilator --lint-only -Wall <files>`: MULTIDRIVEN / UNDRIVEN point at contract C6 problems.'] : []),
    '',
  ]
  return lines.join('\n')
}
