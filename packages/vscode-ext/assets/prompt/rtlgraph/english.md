PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
SPEC_DOCUMENT = <leave empty, or the path of the brief this design was asked for, e.g. spec/pwm_brief.pdf>

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md and PROJECT_FOLDER/.agent/RTLGRAPH_ENVIRONMENT.md
are already prepared for you — read both in full. Follow "Workflow A — RTL →
RTLGraph" specifically. This builds a schematic of existing RTL, so never modify
any .v/.sv file.

First, briefly explain this project's top module, its component tree (the main
component and which modules become nested component boxes), and how far it follows
contracts C1–C7. Then build the RTLGraph files right away: the root
<top>.rtlgraph.json in PROJECT_FOLDER and one <name>.rtlgraph-schematic.json per
component in that component's folder. Where a component holds a state machine,
write its <name>.rtlgraph-fsm.json as well (Step 7b) and mark the state register
with fsm.

Every file's source.root is the path from that file to the code it describes —
"." when they sit together, ".." or "../src" when the JSON is one folder away.
Getting it wrong is the usual way this goes wrong: the validator reports
source-root, an error, naming the folder the code is really in and the value
source.root should have. source.lib is checked the same way.

If SPEC_DOCUMENT is given, follow Step 7c as well: name the document in
source.spec in the root — every file below inherits it, so a box that quotes
nothing can still open it — and on the elements the document really talks about
add spec: { quote, page }, the sentence verbatim and the page it is on. Those
quotes are what the reader jumps to: right-clicking a box opens the document
beside the drawing with the sentence highlighted, and the workbook export lists
every requirement against whatever carries it.

If the code instantiates a primitive it does not ship — a handed-out skeleton
often instantiates DFF without carrying one — use `.base/`, which
`RTLGraph: Copy Agent Spec to Workspace` wrote beside `.agent/`: point
source.lib at it, list what the design uses in source.libFiles, and record in
diagnostics that the library came from there. Where the code's primitive differs
from the stock one (a DFF parameterised by BITWIDTH, the width, rather than BW,
the top bit index), believe the code: write that parameter, adapt the copy in
.base/ to match, and leave a library-adapted diagnostic.

Write meaning, label, note and diagnostic messages in English. Keep net, module,
instance and pin names exactly as they appear in the code.

Validate the root with node PROJECT_FOLDER/.agent/rtlgraph-validate.mjs
<top>.rtlgraph.json (it also checks every schematic the root reaches) until it
reports 0 errors. Follow the spec exactly and run end to end without asking me
anything. When done, tell me the file paths, the validator summary, the contract
check result, and which file to open in VS Code to see the schematic. Say which
boxes open a requirement, if any, so the reader knows the link is there.
