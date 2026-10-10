PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
SPEC_FOLDER = <empty for `me`, or a folder name>
SPEC_DOCUMENT = <empty, or the brief this code was asked for (the handout PDF)>
READER = <empty for "reads Verilog, has never seen this code">

The code is the only description there is — a handed-out skeleton, a repository nobody documented.
Your job is to **write down what it does**, so the next reader does not have to work it out from
the source again. Do not change one character of any `.v`/`.sv`. What comes out is Markdown, plus
the throwaway benches you used to measure the numbers in it.

Read PROJECT_FOLDER/.agent/rtlgraph/SPEC.md and PROJECT_FOLDER/.agent/rtlgraph/ENVIRONMENT.md, and
follow **"Workflow R — Code → a specification someone can read fast"**. Below is how to apply it
here.

## What to write

```
PROJECT_FOLDER/<SPEC_FOLDER>/
├── README.md     what this folder is, and the one caveat about line numbers
├── spec/
│   ├── 00-format.md          the format settled for this project (the rules below, named)
│   ├── 01-overview.md        the whole thing on one page; read this first
│   ├── 10-<module>.md        one per module, numbered 10, 20, 30… in instantiation order
│   └── 90-<name>.md          only what no single module closes over
└── sim/          benches that confirmed the numbers (they print cycles; they judge nothing)
```

## Why group by module rather than by scenario

The same material could be grouped **by scenario** — one file for "send a byte", another for
"reset lands mid-frame". Module files are the default for one reason: **the file you open to
change something is the module's**, and if that module's behaviour closes inside one file you do
not have to open any other.

In a communication design, where transmitter and receiver mirror each other, the worry is
repetition. Repetition comes from *saying a thing twice*, not from how the files are grouped, and
rule 7 is what stops it: machinery the two share goes in `01-overview.md` once, and a module file
carries only **how that module uses it**. (In a real UART spec written this way, the transmitter
and receiver files shared 3 lines out of 98 and 159.)

**When not to group by module**: when almost no scenario closes inside one module — a pipeline
where every event crosses every stage. Then keep the module files to sections 1–3 (what it does,
what that needs, ports) and put the scenarios and paths in the `90-` file. Either way, **say in
`00-format.md` why it was grouped that way**, so the next person can judge whether to flip it.

## The one thing that matters most — do not mix depths

A specification of real RTL can always be one level more detailed, and a document where learning
one thing costs six levels does not get read. So **every section is a complete picture at its own
depth**: a reader who stops after section 1 is left with *less*, never with something **wrong**.

A module file is these six sections, in this order:

| § | Section | What goes in it | Keep to |
|---|---------|-----------------|---------|
| 1 | What it does | numbered steps, in human words, **no signal names** | 10 lines |
| 2 | What that needs | a row per step: *to do this → you need → so this signal exists* | one table, plus the names that mislead |
| 3 | Ports | direction, width, one line each | one table |
| 4 | Scenarios, one line each | event → outcome → how well confirmed | one table |
| 5 | The path, by cycle | one table per scenario: cycle · condition that became true · assignment that ran · **what happens** | 10 rows |
| 6 | Detail | every signal, every use, side effects, the why | **six lines a signal**, and a module file's section 6 may not be longer than its section 5 |

Keep `01-overview.md` under 60 lines and `00-format.md` under 80 (for the `90-` file see
"Scenarios that cross modules" below — ten rows a scenario rather than a line count). **A module
with no logic** — a shell of wiring and flops — gets a file of 80 lines in all: the ports' meaning
and the signals underneath are already in the files of the modules below it. And a **parameter
derived from another** (`SAMPLE_TIME = SYMBOL_EDGE_TIME / 2`) is written in **section 6 only**: if
one expression changes and there are five places to fix, three of them stay wrong.

Put **one ASCII block diagram that matches the RTL one for one** above section 1. In a file that
crosses modules (`90-`), show which port joins which before anything else.

## The seven rules

1. **Section 2 is not a list of signals.** If a signal is not asked for by any step in section 1,
   what is missing is **a step in section 1**, not a paragraph about the signal.
2. **Paths go in cycle order, not line order.** The `if`s in one `always` block are evaluated in
   the same cycle. For every cycle, ask separately: **what else became true here?** That question
   is the only thing that finds, say, a shift that still happens in a frame that was cancelled.
   Then two more. **What was the rest of the design doing when this scenario opened** — above
   all, was a previous byte still standing with its `valid` up? A combinational output moves
   whatever the flags say, so a flag that did not rise does not mean nothing happened outside.
   And once you find the line that raises a flag, **measure what happens when the line that
   clears it lands one cycle before or after**: the same cycle is settled by priority, but one
   cycle apart is how the same value goes out twice or vanishes altogether.
3. **"Why" lives in section 6 only.** If a path table makes you want to explain *the reason*,
   that belongs in 6. The one exception is section 5's last column, **what happens**: one line
   per cycle saying **in words** what became true there. Without it, walking a scenario shows the
   same code lines twice and tells the reader nothing.
4. **Every number says where it came from.** `measured` — a bench in `sim/` printed it; `derived`
   — worked out from the code; `read` — read off the source. Never let a derived number pass as a
   measured one. **`measured` means the bench showed the row's last cell too** — the *what
   happens*, not only the cycle number. A row whose number was printed and whose consequence you
   reasoned out is `read`, not `measured`. And for every exceptional scenario, name **the line of
   the `sim/` file that created that exception**, one line above the table: with no stimulus,
   nothing there was measured.
5. **Every statement says whose it is.** `[PDF]` the brief asked for it · `[code]` the code does
   it · `[undecided]` the brief is silent and the code chose. **The third is the valuable one**:
   it is the list of decisions nobody signed off. **When there is no brief at all**, say so in
   `00-format.md` and do not use `[PDF]`. And **a comment is not evidence**: a header saying
   "(Moore)" over a machine that is Mealy is a finding — check what the comments claim against the
   code, and write down where they disagree. **Before writing `[undecided]`, read the
   requirements on the module at the other end**: in a communication design a requirement on the
   receiver often fixes a value in the transmitter, and a page that does not mention it does not
   make it undecided. Cite **the PDF's own page**, and count the pages yourself where the
   handout's printed footer disagrees with them.
6. **Line numbers are dated.** Put a hash of each referenced file in `00-format.md` (first 8 of
   `sha1sum`) and print the code fragment beside every citation. One comment moves them all.
7. **Say it once — but do not break the flow.** Machinery two modules share goes in
   `01-overview.md`. A scenario lives in the file of the module whose port the event arrives at.
   Anything crossing modules goes in the `90-` file and refers to the others by scenario number
   (`TX-N1`, `RX-E7`) rather than repeating **the detail** of their paths — but it must still
   **cite the one line where the flow passes through each module**. See below.

Scenario numbers: module abbreviation − kind (`N` normal / `E` exceptional) + an index, e.g.
`RX-E3`. **The order is not free either**: number the `N`s from the simplest normal path, and the
`E`s **in the order of the six items** in "Hunt the exceptions first" below, so the same design
written twice gets the same numbers and a reader's `RX-E3` survives. **When amending a
specification that already has numbers, the existing numbers win**: append the new scenario and
renumber nothing. The ordering rule is for numbering the first time.

**The heading is not free-form.** It is how the extension finds a scenario:

```
### RX-N1. Receives one byte      ← 2–4 hashes, the number, then `.` or a space, then the title
```

The number is **1–4 uppercase letters**, `-`, **`N`** or **`E`**, then digits. Not `Rx-N1`, not
`RX_N1`, not `RX-n1`, and nothing may come before it (`### Scenario RX-N1` does not parse). A
heading with the number and no title parses but is shown nowhere, so always write the title. A
table under a heading of any other shape is **not a scenario** and gets no walk.

**Numbering**: components take the tens — 10, 20, 30 — and the modules inside one take the units
(`20-pulse_top`, `21-pulse_fsm`, `22-pulse_dp`). Leave `90-` free however many modules there are.

**There is one definition.** Two people measuring the same design get 10850 and 10851 — one
counted from the cycle in which the condition was true, the other from the cycle whose edge
consumed it. Both are right, and side by side neither is believable. So do not choose; write
this:

> **Cycle n is the n-th clock period**, and every signal is written as the value seen from
> outside during that period. The period in which the scenario's opening condition is true is
> **0**, and the register value the edge made out of it belongs to **cycle 1** — not the same row.

Put that line above the section-4 table, in the same words in every file. And **no row spans two
cycles**. One cycle taking more than one row is fine: when two modules move in the same cycle a
row each is natural (the walk makes a step per file anyway), and the second row starts "same
cycle,".

**A combinational signal and a register are read at different moments.** A combinational signal
(`start`, `sample`) is **the value the coming rising edge will consume**, so it is read *before*
the edge; a register's result is read *after* it. Sample everything at one moment and a one-cycle
combinational signal like `start` never appears in the trace at all.

**Build the tracer first.** Every number in the document stands on the definition above. Build the
macro that prints one row per cycle, check that it prints what that definition says, and only then
write section 5 — if your tracer reads registers *just after* the edge, its numbers are one early
for that definition, so **add 1** when you write them down. The other order leaves every table off
by one.

**Purely combinational modules** (`*_fsm`, `*_dp`, `*_cp`) have no cycle path. Give each truth-table
row a scenario number in section 4, and in section 5 point at the scenario of the module that uses
that row — never write the same path twice (rule 7).

## A tool reads this document

Sections 5 and 6 are not only for people. RTLGraph has a **reader** for this document (`📖` at
the top of it) that lists, under every scenario heading, the steps of that scenario; clicking one
opens that cycle on the code — the current step on the right, the step before it underneath, the
stretch to read bracketed down the gutter. For that to work:

- **Keep the citations inside the table cells.** A `rx:116` that drifts into prose outside the
  table leaves that step with nowhere to go. Condition line in the condition cell, assignment line
  in the assignment cell.
- **Keep the reference-file table in `00-format.md`.** That is how the tool knows which file `rx`
  is. One row per file, the file name **alone in its cell** and the marker **with its colon**:

  | File | sha1, first 8 | Marker |
  |---|---|---|
  | `uart_receiver.v` | `ea15f96e` | `rx:line` |

  `rx` without the colon registers nothing, and a cell reading `uart_receiver.v (the receiver)`
  is not a file name. Citing `uart_receiver.v:116` outright works too.
- **One row, one cycle.** A row citing two files is split into one step per file, because a step
  that moves the editor elsewhere halfway through loses the reader's place.
- **Fill in the "what happens" column.** It is the title of each step when the scenario is
  walked. Do not restate the code there — it is in the next cell and in the editor beside it —
  say it in words: "sees the line fall and starts a frame", "reads the line once, in the middle
  of the bit", "the tenth bit arrives and the byte comes out". Keep citations out of this cell.
- **A condition line and the assignment under it** (`rx:115`, `rx:116`) are shown as one stretch;
  lines far apart are shown separately. So put only one cycle's lines in a row.
- **The line numbers in a row are individually clickable only in the step being walked.** A line
  in any other step walks there first. So a row holding two cycles leaves the reader no way to
  look at one cycle's lines while standing on the other — one row, one cycle.

Which means: do not leave section 5 empty or replace it with prose. That table *is* the path
through the code.

**Open the reader once you are done.** A scenario heading with no steps listed under it means
that heading, or the marker table in `00-format.md`, does not match the shapes above — fix it
before moving to the next file. Where no window can be opened, check the same three things by
hand: that every scenario heading matches `^#{2,4} [A-Z]{1,4}-[NE][0-9]+[. ]`, that each one has
a section 5 table under it, and that the marker cells in `00-format.md` carry their colon.

Section 6 is read too. **Hovering a name in the `.v`** shows that name's section 6 entry, the way
a library function shows its doc comment. Two things make that work.

**Keep the number in the section heading** — `## 6. Detail` or `## 6 — Detail`. Two hashes and the
digit are what find the section; `## Detail` loses every hover in that file.

**An entry starts with the name it is about.** All three shapes are read:

```
**`clock_counter`** (`rx:58`) `reg`, 11 bits.    ← then `- made at : …` lines under it
### `clock_counter`                               ← a subheading per signal
| `clock_counter` | 58 | `reg`, 11 bits |         ← first cell of a row, backticks required
```

A name mentioned only mid-sentence gets no hover. Every citation inside an entry becomes a link to
that line, so **saying where a signal is made and where it is read, by line number**, pays for
itself.

## Scenarios that cross modules — a flow does not end at a file

With a transmitter and a receiver, or any pipeline of stages, **what a reader wants to know is
usually not inside one module but between them**: how what was sent arrives at the other end,
what the far side sees when this side stops. Those scenarios belong in the `90-` file, **and they
cite lines there too.**

```
| Cycle | Condition that became true | Assignment that ran | What happens |
|---|---|---|---|
| 0 | A's `start` (`tx:46`) → TX-N1 | `tx:60` loads the byte | starts sending |
| 1 | `tx:40` | — | the start bit goes out on the line |
| 2 | `top:23` → TOP-N1 | — | through A's output flop |
| 3 | `top:24` · B's `start` (`rx:74`) → RX-N1 | `rx:97` | sees the fall and starts a frame |
```

**The same four columns as a module file.** The only difference is the `→ TX-N1` pointing at
that module's own scenario. Add a `Where` column (A's transmitter / the line / B's receiver) if
it helps — the tool asks for two things only: **citations inside the cells**, and **an
explanation column named one of `what happens` / `in words` / `무슨 일` / `일어나는 일`.**

- **No `Code` column, no walk.** A table of scenario numbers reads fine and has nowhere to go: a
  `90-` file written that way gave **two** steps for a six-row flow.
- **One line per module is enough.** Whatever else happens inside that module is already in the
  scenario the `Detail` column points at. Do not repeat it — rule 7 stands.
- A row citing two files becomes **one step per file**, so the walk moves `tx → top → rx` and the
  reader follows one event across the design in the editor itself.
- This is not only for communication. A control path and its data path, the stages of a pipeline,
  an arbiter and the memory behind it — **if one event touches two modules, that event is a `90-`
  scenario.**
- The scenario a row points at may be that module's **normal** path (`RX-N1`), and often that is
  the finding: if the sender vanished and the receiver still walks its ordinary path to the end,
  the honest pointer is the normal scenario, not an exception.
- No line limit on this file. One table per scenario, ten rows, as in a module file: length that
  comes from carrying a flow is fine, length that comes from repeating a module's own story is
  not.

## Hunt the exceptions first

The normal path falls out of reading the code. The value is in the **exceptions**, and most of
them are `[undecided]`. Ask at least these: reset arriving mid-operation; the far side taking its
data late; the next thing arriving before the last was taken; an input outside spec (length,
timing); only one side being reset; a field nothing checks arriving corrupt. For each, name **the
line that produces the outcome**.

## `sim/` — benches that measure

Writing "valid at cycle 10851" is only honest if that number was **measured**. The benches in
`sim/` **judge nothing** — they `$display` the cycle a thing happened. They are not the project's
testbenches, so they do not go in `tb/`. In `sim/README.md`, say which scenarios each file
confirmed, **the one command that runs it**, and **what you could not measure**. If the design
instantiates a primitive it does not ship (`DFF` and friends) so a bench will not compile, look for
a definition in the project first (`.base/` is the usual place) and only then put a minimal one in
`sim/`, marked in the file itself as **not part of the design**. Whatever that stand-in hides —
power-on `x`, for one — goes in the could-not-measure list. Anything you did not run is `derived` or `read` —
writing a computed number as a measured one is the fastest way to make this document untrustworthy.

## Hand the sticking points back

Do not make a folder of working notes. Put **what this prompt did not settle and you had to
decide** in your final report instead — that is what the next version of the prompt is made from:

- where the instructions were **ambiguous or contradicted each other**, quoted
- what **you decided yourself**, and on what grounds
- anything you **got wrong once and fixed** (a trace off by one cycle, say) — the next person
  walks into the same hole
- the numbers you could not measure, and why

## How to write it

Follow the eight principles in **"Writing a reader can follow"** in `.agent/rtlgraph/SPEC.md`. In
particular: name READER in the first line and write to them; only sentences that **could be false**
("it behaves correctly" is banned); one name per thing, the code's own; a shortening pass at the
end. Mark little — backticks on a name's first mention and where the sentence turns on it.

Keep signal, module and port names exactly as the code spells them. Do not ask me anything along
the way; when you are done, tell me the files you wrote, **the most dangerous thing you tagged
`[undecided]`**, and any number you could not confirm.
