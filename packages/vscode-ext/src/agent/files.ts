// What `RTLGraph: Copy Agent Spec to Workspace` writes into the chosen folder.
// Paths: `from` is relative to the extension root, `to` to the target folder.

// spec → an idea becomes a specification · rtl → that spec becomes new RTL ·
// refactor → existing RTL is restructured and extended · rtlgraph → RTL becomes a schematic
export const PROMPT_KINDS = ['spec', 'rtl', 'refactor', 'rtlgraph'] as const
export const PROMPT_LANGUAGES = ['korean', 'english'] as const

export const VALIDATOR_BUNDLE = 'dist/agent/rtlgraph-validate.mjs'
export const ENVIRONMENT_FILE = '.agent/ENVIRONMENT.md'

export interface BundledFile {
  from: string
  to: string
}

export const AGENT_FILES: readonly BundledFile[] = [
  { from: 'assets/agent/RTLGRAPH_SPEC.md', to: '.agent/RTLGRAPH_SPEC.md' },
  { from: VALIDATOR_BUNDLE, to: '.agent/rtlgraph-validate.mjs' },
  ...PROMPT_KINDS.flatMap(kind =>
    PROMPT_LANGUAGES.map(language => ({ from: `assets/prompt/${kind}/${language}.md`, to: `.prompt/${kind}/${language}.md` })),
  ),
]
