PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
MAIN_COMPONENT = <the main component's name; leave empty if you have not chosen one>
REQUEST = <what to add or change; "structure only" if nothing new>

PROJECT_FOLDER/.agent/rtlgraph/SPEC.md and PROJECT_FOLDER/.agent/rtlgraph/ENVIRONMENT.md
are already prepared for you — read both in full. Follow "Workflow C — Existing
RTL → Refactored RTL" specifically. This rebuilds on the code that is already
there.

First explain briefly how the code is structured today, which of the contracts
C1–C7 it breaks, and what has to change to fit REQUEST in. Then do the work.

- Dump a baseline (tb/baseline.txt) with a testbench before touching the code.
- Keep restructuring and new behaviour apart. First move the design into the
  three-layer layout (comb/data_path, comb/control_path, seq, tb inside the main
  component folder) with behaviour unchanged, and check that the baseline diff is
  empty. Then add what REQUEST asks for, with tests for it, and explain which
  outputs change and why.
- If MAIN_COMPONENT is filled in, use that name. If it is empty, choose one and
  tell me why.
- Keep contracts C1–C7 and confirm compile, elaboration and simulation with a
  simulator listed in RTLGRAPH_ENVIRONMENT.md.

Finally rebuild the RTLGraph files with Workflow A: the root
<top>.rtlgraph.json, one <name>.rtlgraph-schematic.json per component, and —
where a component holds a state machine — its <name>.rtlgraph-fsm.json (Step
7b), with the state register marked fsm. Restructuring moves files, so check
every source.root afterwards: it is the path from each JSON file to the code it
now describes, and a wrong one is reported as source-root, an error, naming the
value it should have (source.lib likewise). Carry any spec quotes across to
wherever their element ended up. Validate the root with
node PROJECT_FOLDER/.agent/rtlgraph/validate.mjs until it reports 0 errors.
Follow the spec exactly and run end to end without asking me anything. When done,
tell me which files changed, the baseline diff from the restructuring step, the
simulation results after the new behaviour, the RTLGraph validator summary, and
which file to open in VS Code to see the schematic.

Write the code and its comments in English, and report in English.
