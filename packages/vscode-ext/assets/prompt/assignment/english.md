PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
SPEC_DOCUMENT = <leave empty, or the path of the brief this design was asked for, e.g. spec/pwm_brief.pdf>
RTLGRAPH_FOLDER = <leave empty to put each file beside its code, or name one folder to keep them all in, e.g. rtlgraph>

This is an assignment: the skeleton was handed out and must stay exactly as it
is. Do not modify, move, rename or reformat any .v/.sv file, do not change a
single signal, module or port name, and do not create folders for the code.
Everything you write is RTLGraph JSON, and nothing else changes.

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md and PROJECT_FOLDER/.agent/ENVIRONMENT.md
are already prepared for you — read both in full. Follow "Workflow A — RTL →
RTLGraph", and in Step 2 use the "Follow the code" placement: a component's
schematic goes in the same folder as the module it describes, source.root is
usually ".", and the root records a layout-follows-code diagnostic. If
RTLGRAPH_FOLDER names a folder, create that one folder and keep every RTLGraph
file in it instead — the root file included — with source.root climbing back out
to the code ("..", "../src"), still without touching the code itself.

source.root is the path from each JSON file to the code it describes, and
getting it wrong is the usual way this goes wrong: the validator reports
source-root — an error, so 0 errors is out of reach until it is right — naming
the folder the code is really in and the value source.root should have.
source.lib is checked the same way.

First, briefly explain the top module, which modules become component boxes, and
where the code departs from contracts C1–C7 — as a reading of the assignment,
not as something to fix. Then write the files: <top>.rtlgraph.json and one
<name>.rtlgraph-schematic.json per component, each beside the module it
describes, or all of them in RTLGRAPH_FOLDER when that is set. Where a component
holds a state machine, write its <name>.rtlgraph-fsm.json in the same folder and
mark the state register with fsm.

If SPEC_DOCUMENT is given — an assignment usually comes with one — follow Step
7c: name it in source.spec in the root, which every file below inherits, so a
box that quotes nothing can still open the document. On the elements the
document really talks about add spec: { quote, page }, the sentence verbatim.
Those quotes are what the reader jumps to: right-clicking a box opens the
document beside the drawing with that sentence highlighted, and the workbook
export lists every requirement against whatever carries it.

If the code instantiates a primitive it does not ship — a handed-out skeleton
often instantiates DFF without carrying one — use `.base/`, which
`RTLGraph: Copy Agent Spec to Workspace` wrote beside `.agent/`: point
source.lib at it, list what the design uses in source.libFiles, and record in
diagnostics that the library came from there. Where the code's primitive differs
from the stock one (a DFF parameterised by BITWIDTH, the width, rather than BW,
the top bit index), believe the code: write that parameter, adapt the copy in
.base/ to match, and leave a library-adapted diagnostic.

## Verifying it

The skeleton is not yours to change, but what you write around it is. Add
testbenches — `tb_<what>.v` beside the code, or in `tb/` if the handout already
has one — that drive the given ports only, by their given names, and prove the
design against the handout rather than against itself:

- one that exercises the normal path end to end, self-checking, printing `PASS`
  or `FAIL` with what it expected;
- one per **edge case** the handout implies: a handshake whose other side is slow
  or absent, back-to-back transactions with no gap, a pulse too short to be real,
  a reset in the middle of an operation, the first and last value a counter can
  hold, whatever the design's own wording makes possible. Name them for what they
  catch.
- Every testbench opens with a comment saying **what it is there to analyse** —
  which sentence of the brief, which part of the design, and what a failure would
  mean. A test whose purpose is not written down is a test nobody will trust
  later.

Drive inputs on the falling edge and check on the rising one, so the bench never
changes a signal at the instant the design reads it. Run every bench on the
simulator `.agent/ENVIRONMENT.md` lists, and say which ones passed.

## The verification map (only if NodeGraph is installed)

`.agent/ENVIRONMENT.md` has a "Companion extensions" row for NodeGraph. **If it
says NodeGraph is not installed, skip this section entirely** and say so in your
report; nothing below is worth writing without it.

If it is installed, read the spec that row points at
(`.agent/NODEGRAPH_SPEC.md` inside that extension) and write one
`verification.nodegraph.json` beside the testbenches: RTLGraph draws what the
circuit *is*, and this says what has been *shown about it* and why. One node per
thing a bench proves, each carrying

- a title naming the behaviour ("a byte stands until the host takes it"),
- content saying what is driven, what is expected, and what a failure would mean,
- `original` quoting the sentence of the handout it comes from, and
- a `links` entry of `"type": "code"` pointing at the lines that do it —
  `tb_uart_corner.v:73-80` for the check, and a second one at the RTL it
  exercises (`uart_receiver.v:78-88`), so the graph walks from a requirement to
  its test to the logic under test.

Edges run from the requirement to the test to the code. Anything the handout asks
for that no bench covers yet is a node too, of the `gap` template, so the hole is
visible rather than forgotten.

Write meaning, label, note and diagnostic messages in English. Keep net, module,
instance and pin names exactly as they appear in the code.

Validate with node PROJECT_FOLDER/.agent/rtlgraph-validate.mjs on the root file
you wrote — PROJECT_FOLDER/<top>.rtlgraph.json, or the one inside
RTLGRAPH_FOLDER — until it reports 0 errors. Run end to end without asking me
anything. When done, tell me the file paths, the validator summary, which file to
open in VS Code, and — separately — anything in the code you would have
restructured if you were allowed to, so I can decide whether to ask for that as
its own task.
