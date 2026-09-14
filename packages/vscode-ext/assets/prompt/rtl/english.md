PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
REQUEST = <what to build or change — a spec document path or the requirements>

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md and PROJECT_FOLDER/.agent/ENVIRONMENT.md
are already prepared for you — read both in full. Carry out REQUEST following
"Workflow B — Spec → RTL".

- If this restructures existing code into the three-layer layout, dump a baseline
  (tb/baseline.txt) with a testbench before touching the code; the work is done only
  when the output diff is empty. Never mix a behaviour change into a refactor.
- If this is new code, create the main component folders (comb/data_path,
  comb/control_path, seq, tb) first, settle the datapath boxes and the control
  signal table, then fill in the code.
- Keep contracts C1–C7 and confirm compile, elaboration and simulation with a
  simulator listed in ENVIRONMENT.md.

Finally, build the RTLGraph file with Workflow A and validate it with
node PROJECT_FOLDER/.agent/rtlgraph-validate.mjs until it reports 0 errors. Follow
the spec exactly and run end to end without asking me anything. When done, tell me
which files changed, the simulation and baseline comparison, and the RTLGraph
validator summary.
