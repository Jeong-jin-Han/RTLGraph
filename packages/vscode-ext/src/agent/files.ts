// What `RTLGraph: Copy Agent Spec to Workspace` writes into the chosen folder.
// Paths: `from` is relative to the extension root, `to` to the target folder.

// spec → an idea becomes a specification · rtl → that spec becomes new RTL ·
// refactor → existing RTL is restructured and extended · rtlgraph → RTL becomes a
// schematic · assignment → the same, for code that may not be touched at all, so
// the files follow the folders the code already has · waveform → a simulation
// that already ran becomes an explanation of why it behaved that way.
export const PROMPT_KINDS = ['spec', 'rtl', 'refactor', 'rtlgraph', 'assignment', 'waveform'] as const
export const PROMPT_LANGUAGES = ['korean', 'english'] as const

// Everything this extension writes lives under its own name inside the shared
// dot-folders. `.agent/` and `.prompt/` are conventions other tools write to as
// well — NodeGraph is one — and a flat `.agent/ENVIRONMENT.md` means whichever
// ran last owns the file. One folder each, and nothing can collide.
export const AGENT_DIR = '.agent/rtlgraph'
export const PROMPT_DIR = '.prompt/rtlgraph'

export const VALIDATOR_BUNDLE = 'dist/agent/rtlgraph-validate.mjs'
export const SPEC_FILE = `${AGENT_DIR}/SPEC.md`
export const VALIDATOR_FILE = `${AGENT_DIR}/validate.mjs`
export const ENVIRONMENT_FILE = `${AGENT_DIR}/ENVIRONMENT.md`
export const RUN_TB = `${AGENT_DIR}/run-tb.sh`
export const MAKE_SUBMISSION = `${AGENT_DIR}/make-submission.sh`
export const WAVE_BUNDLE = 'dist/agent/rtlgraph-wave.mjs'
export const WAVE_READER = `${AGENT_DIR}/wave.mjs`

// What earlier versions wrote at the top of `.agent/` and `.prompt/`. Copying
// the spec again clears these, so a project does not end up holding both.
export const SUPERSEDED: readonly string[] = [
  '.agent/RTLGRAPH_SPEC.md',
  '.agent/RTLGRAPH_ENVIRONMENT.md',
  '.agent/rtlgraph-validate.mjs',
  '.agent/run-tb.sh',
  '.agent/make-submission.sh',
  '.prompt/README.md',
  '.prompt/README.korean.md',
]

// The primitives the registry has symbols for. They go into the project rather
// than being referenced from somewhere else: a handed-out skeleton that
// instantiates DFF usually does not carry DFF, and a project that cannot
// elaborate on its own is not much of a project. `source.lib` then points here.
export const BASE_MODULES = ['DFF', 'INC', 'ADD', 'SUB', 'MUX2', 'CMP_EQ'] as const

export interface BundledFile {
  from: string
  to: string
}

export const AGENT_FILES: readonly BundledFile[] = [
  { from: 'assets/agent/RTLGRAPH_SPEC.md', to: SPEC_FILE },
  { from: VALIDATOR_BUNDLE, to: VALIDATOR_FILE },
  // One command for "did it pass?", so the bench that decides the mark can be
  // run the minute it arrives: tb/given/ is the handout's, tb/mine/ is ours.
  { from: 'assets/agent/run-tb.sh', to: RUN_TB },
  // And one for the other end of the day: collect the .v files the handout asks
  // for, check they still elaborate, and zip them.
  { from: 'assets/agent/make-submission.sh', to: MAKE_SUBMISSION },
  // Reads a dump and says what it measured — never why. `run-tb.sh --wave`
  // calls it; the `waveform` prompt is what turns measurements into reasons.
  { from: WAVE_BUNDLE, to: WAVE_READER },
  // For the reader, not the agent: which of the five to reach for, and why.
  ...PROMPT_LANGUAGES.map(language => ({
    from: `assets/prompt/README${language === 'english' ? '' : `.${language}`}.md`,
    to: `${PROMPT_DIR}/README${language === 'english' ? '' : `.${language}`}.md`,
  })),
  ...PROMPT_KINDS.flatMap(kind =>
    PROMPT_LANGUAGES.map(language => ({ from: `assets/prompt/${kind}/${language}.md`, to: `${PROMPT_DIR}/${kind}/${language}.md` })),
  ),
  ...BASE_MODULES.map(module => ({ from: `assets/base/${module}.v`, to: `.base/${module}.v` })),
  { from: 'assets/base/README.md', to: '.base/README.md' },
]
