PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
SPEC_DOCUMENT = <leave empty, or the path of the brief this design was asked for, e.g. spec/pwm_brief.pdf>
RTLGRAPH_FOLDER = <leave empty to put each file beside its code, or name one folder to keep them all in, e.g. rtlgraph>
GIVEN_TB = <leave empty, or the path of the testbench that came with the assignment — the one it will be marked with>

This is an assignment: the skeleton was handed out and must stay exactly as it
is. Do not modify, move, rename or reformat any .v/.sv file, do not change a
single signal, module or port name, and do not create folders for the code.
Everything you write is RTLGraph JSON, and nothing else changes.

PROJECT_FOLDER/.agent/rtlgraph/SPEC.md and PROJECT_FOLDER/.agent/rtlgraph/ENVIRONMENT.md
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

Create these two folders first, before any bench exists, and say in your report
that they are there. Which folder a file is in says who owns it:

```
tb/given/   what was handed out, byte for byte. Never edited, often still empty.
tb/mine/    what you write. Additional evidence.
```

Put every bench you write in `tb/mine/`. `tb/given/` is the user's to fill: the
marking bench usually arrives after you are done, and they drop it in then. If
GIVEN_TB already names a file, copy it there unchanged (leaving the original
where the handout put it); if it is empty, leave the folder empty and **do not
invent a stand-in** — an empty `tb/given/` is an honest statement that nothing
has been marked yet.

Run benches with the script copied beside this prompt, never with hand-written
`iverilog` lines:

```
.agent/rtlgraph/run-tb.sh given     # only the handed-out bench
.agent/rtlgraph/run-tb.sh mine      # only yours
.agent/rtlgraph/run-tb.sh           # both
```

It swaps the bench it is running into the project folder — where a handout
expects a testbench to sit, and where the bench's own relative paths resolve —
runs it against every other `.v` in the project (`.base/` included), takes it
back out, and prints one verdict line per bench. `--keep` leaves the last one in
place; `--in-place` skips the swap. The point of the arrangement is the day the
marking bench arrives: drop the file in `tb/given/`, one command, done.

**If GIVEN_TB is set, that testbench is the authority.** It is the one the work
will be marked with, so:

- run it **first**, exactly as it came, before writing any bench of your own;
- never edit it, and never change the design's ports or names to suit it — if it
  does not compile, say what is missing and stop, rather than making it compile;
- quote its output verbatim in your report, PASS or FAIL, and say which
  simulator produced it. A handed-out bench often prints neither word, only
  `$display` lines — then say what it printed and what that means, and do not
  translate silence into a PASS;
- when it disagrees with a bench of yours, **it is right and yours is wrong**:
  fix the design or your bench, never the given one.

Your own benches come after, and are additional — the handout usually says as
much ("It is possible to use additional testbenches for verification").

If GIVEN_TB is empty, leave `tb/given/` empty too, and say in your report that
nothing was handed out to be marked against — so that when it does arrive, the
only thing left to do is drop it in and run one command.

Where the skeleton leaves a body for you to write, comment it the way the spec's
"Comments — top down, in the reader's language" section asks — a header saying
what the module is for and the one idea that makes it work, then a reason per
block. The handout's own comments stay exactly as they are; yours go around them.

The skeleton is not yours to change, but what you write around it is. Add
testbenches in `tb/mine/`, named `tb_<what>.v`, that drive the given ports only,
by their given names, and prove the design against the handout rather than
against itself:

- one that exercises the normal path end to end, self-checking, printing `PASS`
  or `FAIL` with what it expected (skip this one when GIVEN_TB already covers the
  normal path — do not re-prove what the given bench proves);
- one per **edge case** the handout implies: a handshake whose other side is slow
  or absent, back-to-back transactions with no gap, a pulse too short to be real,
  a reset in the middle of an operation, the first and last value a counter can
  hold, whatever the design's own wording makes possible. Name them for what they
  catch.
- Every testbench opens with a comment saying **what it is there to analyse** —
  which sentence of the brief, which part of the design, and what a failure would
  mean. A test whose purpose is not written down is a test nobody will trust
  later.

**A bench is read back as three things: what the check is for, how it was driven,
and what happened.** `run-tb.sh --wave` and the waveform view take the first from
the line you print, the second from the statements you ran before printing it,
and the third from the dump. Write so that all three survive:

- **print what is being proven, not which case it is.** `ok: held while
  data_out_ready is low` is a claim a reader can check; `ok: case 3` is not.
- **drive through named tasks** — `frame(8'hA5)`, `put(1'b0, 2)`, `take` — so the
  stimulus reads as sentences rather than as a wall of `@(negedge clk)`.
- **one check per stretch**, printed the moment it is decided: the run is cut at
  every printed line, so two checks in one breath cannot be told apart.
- **prefix every line with `[%0t]`**, which is what lets a check be placed on the
  dump at all.

Why it behaved that way is *not* your job here — that is a separate pass, the
`waveform` prompt, run later against the code.

Drive inputs on the falling edge and check on the rising one, so the bench never
changes a signal at the instant the design reads it. Run them all with
`.agent/rtlgraph/run-tb.sh` (it uses the simulator `.agent/rtlgraph/ENVIRONMENT.md` lists) and say
which ones passed.

## The verification map (only if NodeGraph is installed)

`.agent/rtlgraph/ENVIRONMENT.md` has a "Companion extensions" row for NodeGraph. **If it
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
  `tb/mine/tb_uart_corner.v:73-80` for the check, and a second one at the RTL it
  exercises (`uart_receiver.v:78-88`), so the graph walks from a requirement to
  its test to the logic under test.

Edges run from the requirement to the test to the code. Anything the handout asks
for that no bench covers yet is a node too, of the `gap` template, so the hole is
visible rather than forgotten. GIVEN_TB gets a node of its own — it is the one
result that decides the mark — and if it was not handed out, say so in that node
rather than leaving the reader to assume your own benches are the verdict.

Write meaning, label, note and diagnostic messages in English. Keep net, module,
instance and pin names exactly as they appear in the code.

When the work is done, leave the handing-in to the user, but say the command:
`.agent/rtlgraph/make-submission.sh` stages the `.v` files the handout asks for
**plus whatever they need to elaborate** — the primitive from `.base/` that the
skeleton instantiates without shipping goes in too, named in the report — checks
the result compiles, and writes `submission/<name>.zip`. Do not run it yourself
unless asked: what goes in a submission is the user's decision, not yours.

Validate with node PROJECT_FOLDER/.agent/rtlgraph/validate.mjs on the root file
you wrote — PROJECT_FOLDER/<top>.rtlgraph.json, or the one inside
RTLGRAPH_FOLDER — until it reports 0 errors. Run end to end without asking me
anything. When done, tell me the file paths, the validator summary, **what the
given testbench printed** (or that there was none), what your own benches
printed, which file to open in VS Code, and — separately — anything in the code
you would have restructured if you were allowed to, so I can decide whether to
ask for that as its own task.
