# Which prompt? — read this, then pick one

*(한국어: `README.korean.md`)*

These six folders are ready-made instructions for an AI agent. You do not edit
them and you do not paste their contents: you paste **their path**, plus the path
of the project you want worked on. Which one you paste decides what happens —
that is the whole interface.

```
RTLGraph: Copy Prompt Path        ← pick a branch; the path lands on the clipboard
```

then, in your agent (Claude Code, Codex, Cursor…):

```
/home/me/work/uart/.prompt/rtlgraph/assignment/korean.md 를 읽고 그대로 해줘.
PROJECT_FOLDER = /home/me/work/uart
```

Each prompt starts with a few `NAME = <value>` lines. Fill those in — the project
path, the brief's path if there is one — and leave the rest alone.

---

## Start here

| What you have in front of you | Use | What you get back |
|---|---|---|
| RTL you wrote or inherited, and you want to **see** it | **`rtlgraph`** | a schematic per component, nothing in the code touched |
| A **handed-out skeleton** — an assignment, someone else's repo — that must stay as it is | **`assignment`** | the same, plus testbenches and (if the brief is a PDF) every box linked to the sentence it exists for |
| RTL that works but is a mess, and you are allowed to restructure it | **`refactor`** | the code rearranged into the three-layer layout, then drawn |
| A specification, and no code yet | **`rtl`** | new RTL written to that spec, simulated, then drawn |
| An idea, and not even a specification | **`spec`** | a `SPEC.md` you can read, argue with, and then feed to `rtl` |
| A simulation that already ran, and you want to know **why** it behaved that way | **`waveform`** | `waveform-analysis.md`: the dump's numbers explained against the code, check by check |

If two of them look right, the question to ask is **"may the code change?"** —
`rtlgraph` and `assignment` never touch it, `refactor` and `rtl` do.

---

## The six, one at a time

### `rtlgraph` — existing RTL → a schematic

The everyday one. The agent reads the Verilog, writes one `*.rtlgraph.json` per
component in that component's folder, and validates what it wrote. Nothing in the
code moves.

Use it when the project is yours, or at least when new folders are acceptable —
it places files the way RTLGraph's own layout expects.

Afterwards: open the root file. Every box right-clicks to the line of code it came
from; if a box's `origin` is wrong, the validator would have said so.

### `assignment` — a skeleton that may not be touched

The one for coursework, or for reading a repository you have no right to
rearrange. It creates **no folders for code** and changes no name. Two placements,
your choice:

- leave `RTLGRAPH_FOLDER` empty → each JSON sits beside the module it describes;
- set it (`rtlgraph`, say) → every RTLGraph file goes in that one folder instead,
  and the code is left completely alone.

It leaves two folders behind — `tb/given/` for whatever the course hands out and
`tb/mine/` for what the agent wrote — and a runner, `.agent/rtlgraph/run-tb.sh`, that
swaps one bench at a time into the project folder, runs it against the rest of
the design, and prints a verdict line. So the day the marking bench arrives:

```
cp ~/Downloads/tb_uart.v  <project>/tb/given/
<project>/.agent/rtlgraph/run-tb.sh given
```

That is the whole ritual. `run-tb.sh` on its own runs both folders, `mine` only
yours, `--keep` leaves the bench sitting in the project folder for Vivado's GUI.
When it is time to hand in, `.agent/rtlgraph/make-submission.sh` stages the `.v` files the
handout asks for, checks they still elaborate and zips them (`--list` first if
you want to see what goes in).
**If the assignment came with the testbench up front, put its path in
`GIVEN_TB`** and the agent will run it first, unchanged, quote its output
verbatim, and treat any disagreement with its own benches as its own mistake. It
also asks for **testbenches** of its own —
one per edge case the brief implies, each saying at the top what it is there to
catch — and, when the
brief is a PDF, `source.spec` plus the quoted sentence on the elements the
document actually talks about. Right-clicking such a box then opens the document
at that sentence, highlighted.

Where the code instantiates a primitive it does not ship (`DFF` is the usual one),
it points `source.lib` at the `.base/` folder that came with this one.

### `refactor` — restructure, then draw

The only prompt that rewrites code. It is separate on purpose: restructuring and
drawing are different decisions, and you should be able to ask for one without
the other. It records a behavioural baseline first, restructures into
`comb/ control_path/ data_path/ seq/`, re-simulates against that baseline, and
only then rebuilds the RTLGraph files.

Do not point this at an assignment.

### `rtl` — specification → new RTL

Writes the modules, the testbenches and the RTLGraph files from a spec document.
Needs a simulator; `.agent/rtlgraph/ENVIRONMENT.md` says which ones this machine has.

### `waveform` — a run that happened → why it happened

The only prompt that starts from a simulation rather than from code. Run
`.agent/rtlgraph/run-tb.sh --wave` first: it dumps a waveform without editing any
testbench and writes `waveform/<bench>.vcd` and `<bench>.waveform.json` (for the
agent, and for the viewer). Add `--report` if you also want the same numbers as
prose in `<bench>.waveform.md` —
clock period, when the reset let go, what was still undefined afterwards, when
each handshake was taken, and the run cut into one stretch per check the bench
printed.

Those are **measurements**. This prompt asks for the other half: which lines of
the design produce those edges, why each check passed, and what would have to be
wrong for it to fail. The agent is told to take every number from the dump and
cite code for every claim, so the analysis can be checked rather than believed.
It is the answer to "do I really have to open Vivado and stare at this?" — for
reading, usually not; for debugging a failure, still yes.

### `spec` — an idea → `SPEC.md`

For when the idea is still in your head or in a paragraph. Produces a
specification with a **Decisions** section (everything it had to choose, and why)
and an **Open questions** section (everything it could not settle). Read those two
first — they are where the misunderstandings are — then hand the result to `rtl`.

---

## Two things that change what a prompt does

**The language.** Every folder has `korean.md` and `english.md`. They ask for the
same work; they differ in what language the agent writes `meaning`, labels and its
report in. Names from the code are never translated either way.

**What is installed.** `.agent/rtlgraph/ENVIRONMENT.md` is regenerated every time you run
`RTLGraph: Copy Agent Spec to Workspace`, and the prompts defer to it: which
simulator to run, and whether to write a NodeGraph verification map (only if that
extension is installed). If you install a tool later, run the command again so the
report catches up.

---

## After the agent says it is done

1. **Read the given testbench's output first**, if there was one — that is the
   result that counts; everything else is evidence around it.
   (`run-tb.sh --wave` leaves the waveform and its measurements in `waveform/`, and
   `--report` turns them into `waveform/<bench>.waveform.md`: the numbers a PASS does
   not mention — held times, waits, what was undefined after reset.)
2. **Read the validator line it quotes.** `0 errors` is the bar. Warnings are
   either real findings about the code or something it should have fixed — the
   prompt asks it to tell you which.
3. **Open the root** `*.rtlgraph.json`. The drawing is the answer; the JSON is
   just how it is stored.
4. **Check one box against the code.** Right-click → *Open the Code*. If the line
   is right, the rest usually is.
5. **Arrange it if you like.** Anything you move, resize or re-route is written
   under `layout`, and re-running the agent leaves it alone.
