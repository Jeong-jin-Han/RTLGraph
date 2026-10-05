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
├── sim/          benches that confirmed the numbers (they print cycles; they judge nothing)
└── log/<date>.md what was asked, what was decided, what is still open
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
| 5 | The path, by cycle | one table per scenario: cycle · condition that became true · assignment that ran | 10 rows |
| 6 | Detail | every signal, every use, side effects, the why | no limit |

## The seven rules

1. **Section 2 is not a list of signals.** If a signal is not asked for by any step in section 1,
   what is missing is **a step in section 1**, not a paragraph about the signal.
2. **Paths go in cycle order, not line order.** The `if`s in one `always` block are evaluated in
   the same cycle. For every cycle, ask separately: **what else became true here?** That question
   is the only thing that finds, say, a shift that still happens in a frame that was cancelled.
3. **"Why" lives in section 6 only.** If a path table makes you want to write a sentence, that
   sentence belongs in 6.
4. **Every number says where it came from.** `measured` — a bench in `sim/` printed it; `derived`
   — worked out from the code; `read` — read off the source. Never let a derived number pass as a
   measured one.
5. **Every statement says whose it is.** `[PDF]` the brief asked for it · `[code]` the code does
   it · `[undecided]` the brief is silent and the code chose. **The third is the valuable one**:
   it is the list of decisions nobody signed off. **When there is no brief at all**, say so in
   `00-format.md` and do not use `[PDF]`. And **a comment is not evidence**: a header saying
   "(Moore)" over a machine that is Mealy is a finding — check what the comments claim against the
   code, and write down where they disagree.
6. **Line numbers are dated.** Put a hash of each referenced file in `00-format.md` (first 8 of
   `sha1sum`) and print the code fragment beside every citation. One comment moves them all.
7. **Say it once.** Machinery two modules share goes in `01-overview.md`. A scenario lives in the
   file of the module whose port the event arrives at. Anything crossing modules goes in the `90-`
   file and refers to the others by scenario number (`TX-N1`, `RX-E7`) rather than repeating their
   paths.

Scenario numbers: module abbreviation − kind (`N` normal / `E` exceptional) + an index, e.g.
`RX-E3`.

**Numbering**: components take the tens — 10, 20, 30 — and the modules inside one take the units
(`20-pulse_top`, `21-pulse_fsm`, `22-pulse_dp`). Leave `90-` free however many modules there are.

**Settle what a cycle number means before anything else.** Every number in the document stands on
it. The definition to use is **cycle k = just after the k-th rising edge**; build the tracing macro
that prints one row per cycle, check it prints that, and only then write section 5. The other order
leaves every table off by one.

**Purely combinational modules** (`*_fsm`, `*_dp`, `*_cp`) have no cycle path. Give each truth-table
row a scenario number in section 4, and in section 5 point at the scenario of the module that uses
that row — never write the same path twice (rule 7).

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

## `log/` — where the rules come from

Write `log/<today>.md` as you go, not at the end: what you were asked for, what was decided and
why, **what you interpreted rather than were told (marked as interpretation)**, what you found
while writing, and what is still open. This is the raw material for generalising the rules later.

## How to write it

Follow the eight principles in **"Writing a reader can follow"** in `.agent/rtlgraph/SPEC.md`. In
particular: name READER in the first line and write to them; only sentences that **could be false**
("it behaves correctly" is banned); one name per thing, the code's own; a shortening pass at the
end. Mark little — backticks on a name's first mention and where the sentence turns on it.

Keep signal, module and port names exactly as the code spells them. Do not ask me anything along
the way; when you are done, tell me the files you wrote, **the most dangerous thing you tagged
`[undecided]`**, and any number you could not confirm.
