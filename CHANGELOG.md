# Changelog

## 0.1.2

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
  every `.v` that is not a bench, checks with `iverilog` that what it staged
  still elaborates, writes `submission/<name>.zip`. Benches, `.base/`, the
  RTLGraph JSON and the handout are opt-in; `--list` shows what would go in.
- Two palette commands run them where their output can be read, in a terminal:
  **RTLGraph: Run the Testbenches** and **RTLGraph: Package the Submission**.

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
