# Changelog

## 0.2.0

A minor number rather than a patch: what began as a fix on top of 0.1.1
turned into a second thing the extension does. A simulation now opens as
a drawing you can read — places to go, the measurements at each, and the
argument an agent wrote about them beside the traces — and the prompts
grew a shelf of chains that run several of them in order. 0.1.2 and
0.1.3 went out while that was still moving and are superseded; the notes
below cover everything since 0.1.1.

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
  `waveform/<bench>.waveform.json` (for the viewer and for an agent; `--report`
  adds `<bench>.waveform.md`, the same numbers as prose for a person, which
  nothing else reads) — with the project, not among the tools: clock period and whether it
  wobbles, when the reset let go and **what was still undefined afterwards**,
  every valid/ready transfer with what it waited and how long it was held, the
  signals that never moved, and the run cut into one stretch per check the bench
  printed with a time.
- **Every section is written in the same three fields** — 목적 / 방식 / 결과,
  purpose, how it was driven, what came of it — and anything that does not bear
  on the verdict folds away under `### 더 보기`. Asked to explain nine checks,
  an agent wrote 368 lines of differently-shaped prose; the same prompt now
  produces 172, three lines to a check, with the tables and the side
  observations one click down. The bar is in the prompt: a reader who cannot
  say a check's purpose, method and outcome in thirty seconds cannot use it.
- **The writing opens beside the traces, not under the card.** Unfolding it in
  the rail pushed the signals off the screen — the very thing being explained.
  It opens in a panel on the right instead, one at a time, and the tables in it
  are drawn as tables rather than poured into a paragraph as pipes.
- **The rows are grouped by the module they belong to**, read off the line of
  RTL that drives each signal, with the parameters and the bench's own variables
  last. Which meant fixing what the report knew: signals were matched by bare
  name, so a transmitter and a receiver that both have a `bit_counter` both
  pointed at the receiver's file, and the bench's `errors` pointed at another
  bench. Each scope now picks the file that declares the most of what it holds —
  its module — and reads its signals from there.
- **A citation in the writing opens the file it names.** It never had: the
  report sits in `waveform/`, so `uart_receiver.v:79` resolved to
  `waveform/uart_receiver.v`, which does not exist, and the click did nothing at
  all — no editor, no error. The obvious places are tried in turn now, and a
  file that is genuinely not there is said out loud.
- **The rail is a contact sheet, and the reading opens beside it.** A place had
  eleven lines on it and there are a dozen places, so none of it could be
  scanned: a card is now its title, its times, how many instants it holds and
  whether anyone has written about it. Everything else — the statements that
  drove the stretch, what the wires did, the instants, the argument — opens in a
  panel **between the list and the traces**, where a reader goes place → what it
  says → the waveform, with a grip to set its width. A fold inside it stays open
  until the reader closes it, rather than closing itself on the next redraw.
- **The writing renders as what it is written in**: `- ` lists, markdown tables,
  `**bold**`, `` `code` `` and KaTeX (`$…$`, `$$…$$`), the same five NodeGraph
  takes, because the same person writes for both. Forty boxed chips in a
  paragraph is no emphasis at all, so a name from the code is monospace and
  nothing more, and a citation is an underlined link rather than a button with
  walls — the spec says this as principle 6b. A `---` between sections is a
  separator, not a dash to draw.
- **The brief is a link too.** `PDF_P01_UART_Controller.pdf p.6` in an analysis
  opens the handout at that page, in the reader a schematic box opens, with the
  quoted sentence highlighted.
- **`?` in the toolbar** opens the guide beside the view, and **right-clicking a
  signal** opens the line of RTL that drives it — the jump a schematic box
  already had.
- **A check with nothing written about it offers to ask.** The `?` on such a
  place copies a request about that one stretch — its measured instants, what
  each signal did, the line that printed it, and the rule that no number may be
  invented — for pasting into whichever agent is open. The answer is appended to
  the analysis file, which the view is watching, so it appears where it was
  asked for. Useful when one check surprised you; the whole-document prompt is
  cheaper when you want them all, and the prompts now say so.
- **`clk`, `var` and `⋯` in the toolbar.** The view opens on what a reader wants
  first and keeps the rest one click away, rather than deciding for them: the
  clock (a grey blur at any zoom that shows a frame) and the bench's own
  counters and parameters are off until asked for, `⋯` brings in the signals
  past the first screenful, and the header says how many rows of the total are
  showing. A register whose name merely contains "clock" —
  `clock_counter` — is a signal and was being dropped by a name match; the clock
  is now the one the measurements identified.
- **A card reads in the order a reader asks in**: what the check was for (the
  line the bench printed), **how it was driven** (the statements that ran before
  it, taken from the bench's own source — plumbing like a plain clock wait left
  out), and what happened (the measurements). The spec and the prompts that
  write benches now say so, since all three only survive if the bench prints the
  claim rather than a case number and drives through named tasks.
- **The analysis comes back into the view.** When `<bench>.waveform-analysis.md`
  exists beside a report, each section is folded in under the check it explains
  — matched by the heading, which the prompt asks to be the check's own printed
  line — with every `file.v:line` in it a button. The measurements are the
  claim, the writing is the argument, and they now sit on one screen.
- **`.prompt/rtlgraph/waveform/{korean,english}.md`**, a sixth branch, is the
  other half: it asks an agent to explain *why* each check passed — as **the path
  through the design**, signal by signal with a line citation on each step,
  which is the part a waveform cannot show — against the code. Every number must come from the dump and every claim must cite
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

### Prompts that know what comes next

- **Two shelves.** `.prompt/rtlgraph/components/` holds the seven prompts that each
  do one job; `.prompt/rtlgraph/recipe/` holds three that run several of them in
  order — `assignment`, `marking-day`, `read-code`. Which prompt to reach for
  when was a thing you had to know, and the day the marking bench arrives is a
  sequence: put it in `tb/given/`, run it, read the verdict, dump the waveform,
  explain it. A sequence kept in someone's head is how a step gets skipped at
  the worst moment.
- A chain needs no code of its own — the picker lists whatever is in the folder
  — and obeys three rules: a failed step stops it (a document explaining why a
  run passed is worthless when it FAILed), **⏸ marks where a person has to look**
  before it goes on, and the variables are filled once at the top. Driven for
  real: a fresh agent ran `recipe/assignment` against a bare two-file skeleton
  and came back with five benches, a schematic, `0 errors`, five waveforms, five
  analyses and a submission list, with the handout untouched.

### Code nobody wrote down, written down

- **`components/codespec`**: a prompt that reads code and produces a
  specification — one file per module, in six sections whose **depths do not
  mix**, so a reader who stops after section 1 is left with less and never with
  something wrong. Numbers carry where they came from (`measured`/`derived`/
  `read`) and statements carry whose they are (`[PDF]`/`[code]`/`[undecided]`);
  `[undecided]` is the list of decisions nobody signed off. All three chains
  end by writing one, because the day the marking bench arrives is not the day
  to re-read your own code.
- **`▶ workflow` on a scenario.** Section 5 is a table of one row per cycle,
  each citing the lines that ran — which is a path through the code already.
  Clicking the lens walks it: the current step opens top right, the step before
  it underneath, and the stretch to read is bracketed down the gutter.
  `alt+→`/`alt+←` step, and those keys mean nothing when no walk is on. A step
  never leaves one file — a row citing two files becomes two steps of the same
  cycle, because an editor that jumps elsewhere halfway through loses the
  reader's place — and each step replaces what is in its pane, so a walk of ten
  steps leaves two tabs behind rather than ten.

### Comments are part of the deliverable

- The spec has a section on them, and the prompts that write RTL point at it:
  a header per module in the reader's language — what it is for, the shape of
  what flows through it, **the one idea that makes it work**, and the state it
  keeps — then a line per block saying *why*, never restating the expression.
  Names from the code are never translated, and a handout's own comments are
  never touched.
- demo/uart-p01's receiver is rewritten that way, in Korean. Nothing about the
  logic changed; every line number that pointed into it did, so the schematic's
  origins, both NodeGraph files (links and the snippets they quote), the
  waveform analysis's citations and the report's signal map were moved with it.

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
- **Only what the project needs is written.** Copying the spec used to leave 26
  files where a Korean project that instantiates a `DFF` needs 14: both
  languages of all six prompts when
  `rtlgraph.language` already says which one is read, and all six `.base/`
  primitives when the design instantiates one. The copy now follows the setting
  (`auto` still writes both) and scans the RTL for instantiations, carrying the
  lot only when there is no RTL yet to go on.
- **`waveform/` mirrors `tb/`.** A run's dump and measurements land under the
  folder its bench came from — `waveform/given/`, `waveform/mine/` — so which
  side a result belongs to is structural rather than a guess at the file name.
  It had to be: the handout and you are both allowed to call a bench
  `tb_uart.v`, the reports are named after the bench, and the marking one runs
  first — so the report that survived the overwrite was yours. A project with
  files in the old flat place keeps them; the next `--wave` writes to the new
  one.
- **A run leaves the waveform, not a pile.** `--wave` writes the dump and the
  measurements; `<bench>.waveform.md` — the same numbers as prose, which nothing
  but a person reads — is now `--report`. The compiler's scratch moved into
  `.rtlgraph-build/` and is removed when the bench passes, so a failure still
  leaves the command that produced it (`--keep-build` keeps it either way).

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
