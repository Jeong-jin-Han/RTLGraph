PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
RTLGRAPH_FOLDER = <empty to put each file beside its code, or one folder name, e.g. rtlgraph>
SPEC_DOCUMENT = <the handout PDF, or empty>
GIVEN_TB = <the testbench that came with the handout, if one did; else empty>

The whole way through a handed-out assignment, in order. Work through the steps
**from the top**. Each one is either a prompt to read and follow, or a command.

**Rules for all of them**

- If a step fails, **do not go on.** Never take a FAILing bench into the analysis
  or the submission.
- Where you see ⏸, **stop, report, and ask whether to continue.** Otherwise keep
  going without asking.
- Fill the variables at the top of a prompt with **the values set here**.
- The handout's `.v` files keep their ports and their names, and its own comments
  are untouched — yours go around them.

---

**1. Draw it, and write our benches.** Read
`PROJECT_FOLDER/.prompt/rtlgraph/assignment/english.md` and do what it says,
passing RTLGRAPH_FOLDER, SPEC_DOCUMENT and GIVEN_TB through. This is what
creates `tb/given/` (empty, waiting) and `tb/mine/`.

**2. Run our benches.**

```
PROJECT_FOLDER/.agent/rtlgraph/run-tb.sh mine
```

⏸ **Stop here.** Report a verdict line per bench and what the validator said
(`0 errors` is the bar). If something FAILed, say what is wrong **before fixing
it** — whether the bench or the design is wrong is my call.

**3. Keep the waveform.**

```
PROJECT_FOLDER/.agent/rtlgraph/run-tb.sh --wave
```

**4. Write why it passed.** Read
`PROJECT_FOLDER/.prompt/rtlgraph/waveform/english.md` and do what it says, with
WAVEFORM empty so it covers every report you just made.

**5. Look at the submission, do not build it.**

```
PROJECT_FOLDER/.agent/rtlgraph/make-submission.sh --list
```

⏸ **Stop here.** Report what would go in, and anything pulled in because the
design does not elaborate without it. **The zip is made when I say so.**

**6. Report.** The files you wrote, the verdicts, the validator line, and whether
the day the marking bench arrives is one command — if not, what else it needs.
