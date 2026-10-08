PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
RTLGRAPH_FOLDER = <empty to put each file beside its code, or one folder name>
SPEC_DOCUMENT = <leave empty, or the path of the brief this design was asked for>

How to **read** RTL somebody else wrote. Nothing here changes a line of it: draw
it, run it, and write down why it behaves as it does. Work from the top.

**Rules for all of them**

- If a step fails, **do not go on.**
- Where you see ⏸, stop, report, and ask whether to continue. Otherwise keep
  going without asking.
- The design's `.v`/`.sv` files are read-only here. Anything you would change goes in
  the final report, not in the code. `.base/` is the one exception — it is this tool's
  copy, and where the design calls that primitive by other parameter names
  (`DFF #(.BITWIDTH(4))`) `SPEC.md` says to adapt the copy to the code. Leave a
  `library-adapted` diagnostic, and say in the file's header why it changed.

---

**1. Draw it.** Read `PROJECT_FOLDER/.prompt/rtlgraph/components/rtlgraph/english.md` and do
what it says, passing RTLGRAPH_FOLDER and SPEC_DOCUMENT through.

⏸ **Stop here.** Report the validator result (`0 errors` is the bar), which file
to open to see the schematic, and **the one idea that makes this design work**,
in a sentence.

**2. Write it down.** Read `PROJECT_FOLDER/.prompt/rtlgraph/components/codespec/english.md` and
do what it says, with SPEC_FOLDER = `me` and SPEC_DOCUMENT as set above. The schematic
showed the shape; this is where the behaviour gets written — six depths, every number with its provenance, and `[undecided]` on
everything the brief never settled.

When it is written, **open the specification in the reader** (`📖` at the top of the document).
A scenario heading with no steps under it means that heading, or the marker table in
`00-format.md`, does not match the format — fix it before reporting.

⏸ **Stop here.** Report the most dangerous `[undecided]` and any number you could not measure.

**3. Run the testbenches, if there are any.**

```
PROJECT_FOLDER/.agent/rtlgraph/run-tb.sh --wave
```

If both `tb/given/` and `tb/mine/` are empty, stop and say so — writing a bench
from scratch is not part of this chain.

If it does not compile, the runner says why first. Modules that are instantiated and defined
nowhere are **this machine's setup, not a fault in the design** — a synthesized netlist is made
of vendor cells (LUT6, FDRE …) that live in Vivado's library. Report that
`RTLGRAPH_VENDOR_SRC`, or sourcing `settings64.sh`, would fix it, and change no code.

On a large design (a synthesized netlist, thousands of cells) use `--wave-depth 3` rather than
`--wave`: there is nothing to read inside a LUT, and dumping all of it makes a VCD nothing will
open.

**4. Write why it behaves that way.** Read
`PROJECT_FOLDER/.prompt/rtlgraph/components/waveform/english.md` and do what it says, with
WAVEFORM empty.

**5. Report.** Where the schematic is, where the specification is, the verdicts, and **one thing that looked
wrong while you read** — not fixed, just which line and why.
