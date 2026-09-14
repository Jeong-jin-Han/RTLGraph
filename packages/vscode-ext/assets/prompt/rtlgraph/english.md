PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md and PROJECT_FOLDER/.agent/ENVIRONMENT.md
are already prepared for you — read both in full. Follow "Workflow A — RTL →
RTLGraph" specifically. This builds a schematic of existing RTL, so never modify
any .v/.sv file.

First, briefly explain this project's top module, its components, and how far it
follows contracts C1–C7. Then build the RTLGraph file right away.

Write meaning, label, note and diagnostic messages in English. Keep net, module,
instance and pin names exactly as they appear in the code.

Validate what you write with node PROJECT_FOLDER/.agent/rtlgraph-validate.mjs <file>
until it reports 0 errors. Follow the spec exactly and run end to end without
asking me anything. When done, tell me the file path(s), the validator summary and
the contract check result.
