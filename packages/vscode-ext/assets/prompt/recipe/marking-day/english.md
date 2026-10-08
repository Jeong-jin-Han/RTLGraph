PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
SPEC_DOCUMENT = <leave empty, or the path of the brief this design was asked for>
SPEC_FOLDER = <the folder the specification is in; empty means `me`>

What to do on the day the marking testbench arrives, in order. Work through the
steps **from the top**. Each one is either a prompt to read and follow, or a
command to run.

**Rules for all of them**

- If a step fails, **do not go on to the next one.** A bench that FAILs stops
  everything: a document explaining why a run passed is worthless when it did not.
- Where you see ⏸, **stop, report, and ask whether to continue.** Everywhere
  else, keep going without asking.
- Fill the variables at the top of a prompt with **the values set here**.
- The handed-out bench and the handout's code are **not yours to change.** If
  something only passes when they change, stop at ⏸ and say so.

---

**1. Check the bench is in place.** There must be a `.v` in
`PROJECT_FOLDER/tb/given/`. If that folder is empty, stop and ask for the
marking bench to be put there.

**2. Run it.**

```
PROJECT_FOLDER/.agent/rtlgraph/run-tb.sh given
```

**If a bench says `DID NOT COMPILE`**, the runner says why first; quote that line. If it
names modules that are instantiated and defined nowhere, that is **this machine's setup,
not a fault in the design** — a synthesized netlist is made of vendor cells (LUT6, FDRE …)
that live in Vivado's library. Report that `RTLGRAPH_VENDOR_SRC` or sourcing `settings64.sh`
would fix it, and **change no code**. A line saying another top does not elaborate is the
runner having already worked around it; leave it alone.

⏸ **Stop here.** Quote the verdict line and whatever the bench printed that the
verdict rests on. If it FAILed, say what the failing check asserts and which
line of the design you think is behind it — and **change nothing.**

**3. Keep the waveform.**

```
PROJECT_FOLDER/.agent/rtlgraph/run-tb.sh given --wave
```

On a large design (a synthesized netlist, thousands of cells) use `--wave-depth 3` rather
than `--wave`: there is nothing to read inside a LUT, and dumping all of it makes a VCD
nothing will open.

That writes `waveform/<given|mine>/<bench>.vcd` and `<bench>.waveform.json`. No testbench is
edited to make it dump; the runner adds a module that does it.

**4. Write why it behaved that way.** Read
`PROJECT_FOLDER/.prompt/rtlgraph/components/waveform/english.md` and do what it says. Set
WAVEFORM to the report you just made — **the marking one only**, which is the one
that matters today; do not write ours as well, even if nobody has yet. Pass
SPEC_DOCUMENT through.

**5. Update the specification, if there is one.** If `PROJECT_FOLDER/<SPEC_FOLDER>/spec/` already
exists, amend **only the scenarios the marking bench touched**, in the format
`components/codespec/english.md` sets: what rose to `measured`, what behaved differently than
written, and any `[undecided]` this run exposed. If there is no such folder, **do not start one
today** — say so and move on. Writing it is not a marking-day job.

Then **open the specification in the reader** (`📖` at the top of the document). A scenario
heading with no steps under it means that heading, or the marker table in `00-format.md`, does
not match the format — fix it before reporting.

**6. Report.** Three things only: the verdict, one thing the waveform shows that
no check asserts, and one thing that is still unproven.
