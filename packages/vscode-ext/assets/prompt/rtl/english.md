PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
SPEC_DOC = <path to the specification; leave empty and use REQUEST if there is none>
MAIN_COMPONENT = <the main component's name; leave empty if you have not chosen one>
REQUEST = <only when SPEC_DOC is empty: what to build>

PROJECT_FOLDER/.agent/rtlgraph/SPEC.md and PROJECT_FOLDER/.agent/rtlgraph/ENVIRONMENT.md
are already prepared for you — read both in full. Follow "Workflow B — Spec →
RTL" specifically and write **the RTL of a new project from scratch**. (To change
code that already exists, use .prompt/rtlgraph/refactor/english.md instead.)

If SPEC_DOC is given, read it in full first and follow the ports, components and
control signal table it settles. If you have to depart from it, say why in your
report.

Create the main component folder first — always, even for a single component —
with comb/data_path, comb/control_path, seq and tb inside it, settle the datapath
boxes and the control signal table, then fill in the code. If MAIN_COMPONENT is
filled in, use that name; if it is empty, choose one and tell me why.

Keep contracts C1–C7 and confirm compile, elaboration and simulation with a
simulator listed in RTLGRAPH_ENVIRONMENT.md. Put testbenches in tb/, driving inputs on the
falling edge and checking on the rising edge.

Finally build the RTLGraph files with Workflow A: the root <top>.rtlgraph.json,
one <name>.rtlgraph-schematic.json per component, and — where a component holds
a state machine — its <name>.rtlgraph-fsm.json (Step 7b), with the state
register marked fsm. Each file's source.root is the path from it to the code it
describes; a wrong one is reported as source-root, an error, naming the value it
should have. SPEC_DOC is the document this design was asked for, so record it:
source.spec in the root (inherited by every file below) and, on the elements the
document really talks about, spec: { quote, page } — the sentence verbatim.
Validate the root with node PROJECT_FOLDER/.agent/rtlgraph/validate.mjs until it
reports 0 errors. Follow
the spec exactly and run end to end without asking me anything. When done, tell me
which files you created, the simulation results, the RTLGraph validator summary,
which file to open in VS Code to see the schematic, and which boxes open a
requirement.

Write the code and its comments in English, and report in English.
