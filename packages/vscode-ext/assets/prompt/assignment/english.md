PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH

This is an assignment: the skeleton was handed out and must stay exactly as it
is. Do not modify, move, rename or reformat any .v/.sv file, do not change a
single signal, module or port name, and do not create folders for the code.
Everything you write is RTLGraph JSON placed beside the code it describes.

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md and PROJECT_FOLDER/.agent/ENVIRONMENT.md
are already prepared for you — read both in full. Follow "Workflow A — RTL →
RTLGraph", and in Step 2 use the "Follow the code" placement: a component's
schematic goes in the same folder as the module it describes, source.root is
usually ".", and the root records a layout-follows-code diagnostic.

First, briefly explain the top module, which modules become component boxes, and
where the code departs from contracts C1–C7 — as a reading of the assignment,
not as something to fix. Then write the files: <top>.rtlgraph.json in
PROJECT_FOLDER and one <name>.rtlgraph-schematic.json per component, beside its
code. Where a component holds a state machine, write its <name>.rtlgraph-fsm.json
in the same folder and mark the state register with fsm.

Write meaning, label, note and diagnostic messages in English. Keep net, module,
instance and pin names exactly as they appear in the code.

Validate with node PROJECT_FOLDER/.agent/rtlgraph-validate.mjs <top>.rtlgraph.json
until it reports 0 errors. Run end to end without asking me anything. When done,
tell me the file paths, the validator summary, which file to open in VS Code, and
— separately — anything in the code you would have restructured if you were
allowed to, so I can decide whether to ask for that as its own task.
