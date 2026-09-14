PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
SPEC_DOC = <path to the specification; leave empty and use REQUEST if there is none>
MAIN_COMPONENT = <the main component's name; leave empty if you have not chosen one>
REQUEST = <only when SPEC_DOC is empty: what to build>

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md and PROJECT_FOLDER/.agent/ENVIRONMENT.md
are already prepared for you — read both in full. Follow "Workflow B — Spec →
RTL" specifically and write **the RTL of a new project from scratch**. (To change
code that already exists, use .prompt/refactor/english.md instead.)

If SPEC_DOC is given, read it in full first and follow the ports, components and
control signal table it settles. If you have to depart from it, say why in your
report.

Create the main component folder first — always, even for a single component —
with comb/data_path, comb/control_path, seq and tb inside it, settle the datapath
boxes and the control signal table, then fill in the code. If MAIN_COMPONENT is
filled in, use that name; if it is empty, choose one and tell me why.

Keep contracts C1–C7 and confirm compile, elaboration and simulation with a
simulator listed in ENVIRONMENT.md. Put testbenches in tb/, driving inputs on the
falling edge and checking on the rising edge.

Finally build the RTLGraph files with Workflow A (root <top>.rtlgraph.json plus one
<name>.rtlgraph-schematic.json per component) and validate the root with
node PROJECT_FOLDER/.agent/rtlgraph-validate.mjs until it reports 0 errors. Follow
the spec exactly and run end to end without asking me anything. When done, tell me
which files you created, the simulation results, the RTLGraph validator summary,
and which file to open in VS Code to see the schematic.
