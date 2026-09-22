# Changelog

## 0.1.3

The version number skips 0.1.2: a build with that number was installed
locally while this work was still moving, so the release that goes out
carries a number nothing else has worn.

Everything in this release came from driving a real assignment through the
extension, so each line is something that broke once.

### The day the marking testbench arrives

- **`.agent/rtlgraph/run-tb.sh`**, copied with the agent files. Benches are kept
  apart by who wrote them — `tb/given/` for the handout's, `tb/mine/` for
  yours — and the script swaps one at a time into the project folder, where a
  handout expects a bench to sit, runs it against the rest of the design, takes
  it back out and prints a verdict line each. `--keep` leaves the last one in
  place for Vivado's GUI; `--in-place` skips the swap.
  - A `.v` bench is compiled as Verilog-2005 first and only then as
    SystemVerilog: a course bench with a task called `expect` is fine in the
    older dialect and a syntax error in the newer one.
  - A bench that prints neither PASS nor FAIL reads as "said nothing" rather
    than as a pass — handed-out benches often only `$display`.
  - Copies of the design elsewhere in the tree (a submission folder, a Vivado
    project) are pruned, and any file whose module is already defined by a
    shallower file is skipped with a note.
- **`.agent/rtlgraph/make-submission.sh`** for the other end of the day: stages
  every `.v` that is not a bench **plus whatever those files need to
  elaborate** — a skeleton that instantiates `DFF` without shipping one would
  otherwise be handed in uncompilable, so the script asks the compiler what is
  missing, finds who defines it in the project, and adds exactly that under
  `base/`, naming what it added. `--no-deps` hands in the project's own files
  alone. Benches, all of `.base/`, the RTLGraph JSON and the handout stay
  opt-in; `--list` shows what would go in.
- Two palette commands run them where their output can be read, in a terminal:
  **RTLGraph: Run the Testbenches** and **RTLGraph: Package the Submission**.

### Reading a waveform instead of staring at one

- **`.agent/rtlgraph/run-tb.sh --wave`** dumps a waveform while the benches run.
  No testbench is edited to make it happen — a module beside it calls
  `$dumpvars` — which is what makes it usable on the bench you are marked with.
- **`.agent/rtlgraph/wave.mjs`** reads the dump and writes
  `waveform/<bench>.waveform.md` (for a person) and `<bench>.waveform.json` (for
  an agent, and for the viewer) — with the project, not among the tools: clock period and whether it
  wobbles, when the reset let go and **what was still undefined afterwards**,
  every valid/ready transfer with what it waited and how long it was held, the
  signals that never moved, and the run cut into one stretch per check the bench
  printed with a time.
- **`.prompt/rtlgraph/waveform/{korean,english}.md`**, a sixth branch, is the
  other half: it asks an agent to explain *why* each check passed, against the
  code. Every number must come from the dump and every claim must cite
  `file.v:line`, so the analysis can be checked rather than believed.
- **`*.waveform.json` opens as a waveform**, the way `*.rtlgraph.json` opens as
  a schematic: places to go down the left (how it came up, then a check at a time,
  each with its measurements), traces on the right, ← and → to walk them, hover
  for values at an instant. One row per net, no clock, `x` in red.
- **Two ways back into the code**, because matching every instant of a waveform
  to a line is hopeless but matching these two is not: each check carries the
  testbench line that printed it (found by the wording it printed, not by
  parsing Verilog), and each signal's name opens the line of RTL that drives it
  — a clocked assignment before a continuous one before a declaration, and the
  design before the bench that merely declares the same name.
- Zooming holds an edge when one is in view: at the end of the run the end stays
  put and the left side moves, and with the whole run on screen the start stays.
  Zooming about the middle is right in the middle and wrong at an edge, where
  what you are looking at slides off while the view grows around a point you
  did not pick.
- The plot marks instants with **numbers**, not sentences: four of them inside
  60 ns cannot all carry their wording, but they can all carry a badge, and the
  same number sits beside the words in the rail. Pointing at either — the badge
  or the line in the list — lights the other, without moving the view and
  without text appearing over the traces: words that pop up under the hand
  cover the very thing being pointed at. Pointing at a signal picks its row out
  of the plot.
- The view opens on something that moves: a report whose reset releases at 40 ns
  used to frame those 40 ns of a 4 µs run and read as broken. Two signals of the
  same name (a `bit_counter` per module) now wear the scope that tells them
  apart, and a webview test drives both demo reports through the real bundle,
  because a view that comes up blank looks identical to one that has nothing to
  say.
- **`rtlgraph.language`**: `auto` (VS Code's own), `english` or `korean`. It
  changes RTLGraph's wording in the waveform view and in what `--wave` writes
  (`RTLGRAPH_LANG=ko` for the script on its own). Signal names, times, file
  names and whatever the testbench printed are never translated — a report that
  translates the simulator cannot be checked against it.
- Our own benches now print `[%0t]` before each line, which is what lets a check
  and a stretch of waveform be put beside each other.

### One folder each

- Everything the extension writes now lives under its own name:
  `.agent/rtlgraph/{SPEC,ENVIRONMENT}.md`, `validate.mjs`, the two scripts, and
  `.prompt/rtlgraph/…`. `.agent/` and `.prompt/` are shared conventions — other
  tools write there too, and a flat `.agent/ENVIRONMENT.md` meant whichever ran
  last owned the file, so a prompt asking "which simulator does this machine
  have" could be reading someone else's report.
- Copying the spec clears what the older layout left behind, and only ours: a
  report written by another tool is left exactly where it is.
- `.base/` stays where it is — it is a library the design compiles against and
  `source.lib` points at it by path.
- The prompt picker reads `.prompt/rtlgraph/` alone, so another tool's prompts
  no longer appear in it.

### Fixes

- **Copy Agent Spec no longer undoes an adapted primitive.** The prompts tell
  the agent to adapt a primitive to the code that instantiates it — a `DFF`
  taking `BITWIDTH` where the stock one takes `BW` — and the next copy wrote the
  stock file straight over it, leaving a project that no longer elaborated. A
  `.base/*.v` that differs from the shipped one is now the project's: it is kept
  and named in the notification.

### Prompts

- The `assignment` prompts gained `GIVEN_TB`: the testbench the work is marked
  with is the authority — run first, unchanged, output quoted verbatim, and it
  wins over the agent's own benches. If it has not arrived, `tb/given/` stays
  empty and no stand-in is invented.
- Both reader guides (`.prompt/rtlgraph/README.md`, `README.korean.md`) describe
  the two-command ritual for the day the bench arrives.

## 0.1.1

First published release: the schematic editor, the hierarchy, FSM diagrams, the
PDF requirement view, exports, the validator and the five prompts.
