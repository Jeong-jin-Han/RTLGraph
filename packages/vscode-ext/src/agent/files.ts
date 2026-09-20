// What `RTLGraph: Copy Agent Spec to Workspace` writes into the chosen folder.
// Paths: `from` is relative to the extension root, `to` to the target folder.

// spec → an idea becomes a specification · rtl → that spec becomes new RTL ·
// refactor → existing RTL is restructured and extended · rtlgraph → RTL becomes a
// schematic · assignment → the same, for code that may not be touched at all, so
// the files follow the folders the code already has.
export const PROMPT_KINDS = ['spec', 'rtl', 'refactor', 'rtlgraph', 'assignment'] as const
export const PROMPT_LANGUAGES = ['korean', 'english'] as const

export const VALIDATOR_BUNDLE = 'dist/agent/rtlgraph-validate.mjs'
export const ENVIRONMENT_FILE = '.agent/ENVIRONMENT.md'

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
  { from: 'assets/agent/RTLGRAPH_SPEC.md', to: '.agent/RTLGRAPH_SPEC.md' },
  { from: VALIDATOR_BUNDLE, to: '.agent/rtlgraph-validate.mjs' },
  // For the reader, not the agent: which of the five to reach for, and why.
  ...PROMPT_LANGUAGES.map(language => ({
    from: `assets/prompt/README${language === 'english' ? '' : `.${language}`}.md`,
    to: `.prompt/README${language === 'english' ? '' : `.${language}`}.md`,
  })),
  ...PROMPT_KINDS.flatMap(kind =>
    PROMPT_LANGUAGES.map(language => ({ from: `assets/prompt/${kind}/${language}.md`, to: `.prompt/${kind}/${language}.md` })),
  ),
  ...BASE_MODULES.map(module => ({ from: `assets/base/${module}.v`, to: `.base/${module}.v` })),
  { from: 'assets/base/README.md', to: '.base/README.md' },
]
