// Builds .agent/rtlgraph/ENVIRONMENT.md from probed tool versions. Pure — the extension
// host runs the probes — so the report can be tested with made-up facts.
import { MAKE_SUBMISSION, RUN_TB } from './files.ts'

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

// What the agent can do depends on what is installed, and that includes the
// other half of this pair: NodeGraph draws the reasoning around code the way
// RTLGraph draws the circuit. A prompt asks for a verification map only when
// this says the extension is there to read it.
export interface Companion {
  version: string
  spec?: string // its own agent spec, if it ships one on disk
}

export type EnvironmentFacts = { [K in ProbedTool]?: string } & {
  generated: string // ISO time
  platform: string // process.platform
  vivadoSettings: string[] // settings64.sh files found on disk
  nodegraph?: Companion
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
    '> run the command again to refresh it. The name carries the extension because a plain',
    '> `.agent/ENVIRONMENT.md` is a name other tools write too — NodeGraph is one — and the last',
    '> writer would win.',
    '',
    `Generated: \`${f.generated}\` · Platform: \`${f.platform}\``,
    '',
    '## Required',
    '',
    '| Tool | Available | Use |',
    '|---|---|---|',
    `| Node.js | ${has(f.node)} | \`node .agent/rtlgraph/validate.mjs <file>\` — validate every \`*.rtlgraph.json\` you write |`,
    `| Testbench runner | ✅ \`${RUN_TB}\` | \`${RUN_TB} given\` runs what the assignment handed out, \`mine\` runs ours, no argument runs both |`,
    `| Submission | ✅ \`${MAKE_SUBMISSION}\` | gathers the \`.v\` files the handout asks for, checks they still elaborate, and zips them |`,
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
    '## Companion extensions',
    '',
    '| Extension | Available | Use |',
    '|---|---|---|',
    `| NodeGraph | ${f.nodegraph ? `✅ \`${f.nodegraph.version}\`` : '❌'} | ${f.nodegraph
      ? 'write the verification map beside the schematic: one node per thing a testbench proves, each linked to the code it exercises'
        + (f.nodegraph.spec ? ` — read its own spec first: \`${f.nodegraph.spec}\`` : '')
      : 'not installed — skip anything a prompt says about `*.nodegraph.json`'} |`,
    '',
    '## Recommendations',
    '',
    f.node
      ? '- **Validate** each file with `node .agent/rtlgraph/validate.mjs <file>` until it reports `0 errors`.'
      : '- ⚠️ **Node.js not found** — the validator cannot run. Go through the spec checklist by hand and tell the user to install Node.js ≥ 18.',
    simulator
      ? `- **Simulate** with ${simulator} — or let \`${RUN_TB}\` do it: it finds the benches in \`tb/given/\` and \`tb/mine/\`, compiles each against the rest of the design and prints one verdict line per bench.`
      : '- ⚠️ **No Verilog simulator found** — Workflow B cannot verify behaviour or baselines; tell the user before changing code.',
    ...(f.verilator ? ['- **Lint** with `verilator --lint-only -Wall <files>`: MULTIDRIVEN / UNDRIVEN point at contract C6 problems.'] : []),
    ...(f.nodegraph
      ? ['- **Explain the verification** in a `*.nodegraph.json` beside the testbenches: what each one is there to catch, linked to the lines it drives.']
      : []),
    '',
  ]
  return lines.join('\n')
}
