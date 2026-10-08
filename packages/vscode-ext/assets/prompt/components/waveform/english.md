PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
WAVEFORM = <leave empty to read every waveform/**/*.waveform.json in the project, or name one>
SPEC_DOCUMENT = <leave empty, or the path of the brief this design was asked for>

A simulation has run and something measured it. Your job is the half a machine
cannot do: say **why** it behaved that way, from the code.

PROJECT_FOLDER/.agent/rtlgraph/SPEC.md and
PROJECT_FOLDER/.agent/rtlgraph/ENVIRONMENT.md are already prepared for you —
read both, and follow "Workflow W — Waveform → why it passed".

If no report exists yet, make one: `.agent/rtlgraph/run-tb.sh --wave` runs the
benches, dumps a waveform without editing any testbench, and writes
`waveform/<given|mine>/<bench>.vcd` and `waveform/<given|mine>/<bench>.waveform.json` — the measurements you
read below. Do not edit a testbench to make it dump — the runner adds a module that
does it.

## What you are given, and what you must not do with it

A `.waveform.json` holds **measurements**: the clock's period, when the reset was
released, which signals were still `x` afterwards, when each handshake was
taken and how long it waited, and the run cut into stretches — one per line the
testbench printed with a time.

- **Every number you write comes from that file.** Do not re-derive a time from
  the design's parameters, do not round, do not say "about". If something you
  expected to see is not in the measurements, say that it is not there.
- **Every statement about behaviour cites the code**, as `file.v:12` or
  `file.v:12-20` — **with the file name every time**. Once you have named a file,
  a later bare `(`89`)` reads fine to you and is not a citation the view can turn
  into a button, so the reader cannot follow it. "The byte waits for the host"
  explains nothing; "`has_byte`
  stays set because the branch that clears it needs `data_out_ready`
  (`uart_receiver.v:86-87`)" is an explanation someone can check.
- **A disagreement is a finding.** If the dump does not match what the code
  appears to say, write that down. The dump is what happened; your reading of
  the code is what you thought would happen.

**One pass or one check at a time.** This prompt writes the whole document in
one go, which is what you want before a demo or a hand-in: the RTL is read once
for all of them, and a section can point at another. The waveform view also has
a `?` on any check nobody has written about yet, which copies a request about
that one check alone — cheaper when you only care about the one that surprised
you, dearer if you end up asking for every check that way. Both append to the
same file and are matched by the same headings, so they mix freely.

## Write `waveform/<given|mine>/<bench>.waveform-analysis.md`, beside the report you read

**Use the check's own printed line as the section heading** (`## ok: cleared once
taken`), and `## Coming up` — or the same words in your language — for the
opening one. The waveform view reads this file back and puts each section beside
the instants it explains, matching them by that heading; a section whose heading
names no check is shown on its own rather than pinned to the wrong one. Where the line
carries `#` or table marks a heading cannot hold, tidy just those and keep the line itself
verbatim as the section's first line (`##   TEST PASS   ##` becomes `## TEST PASS`).

**First, decide who you are writing to, and say so in the first line.** One person
you could name, with the **minimum** expertise you expect — "knows Verilog and
what a UART is, has never read this file". The reason a document like this comes
out unreadable is not the writing, it is that **you already know the answer**: to
someone who knows why `serial_in_d` resets to 1, "reset to idle" reads as a
complete explanation, and to that reader it says nothing. The bar is not "is this
accurate" — accurate and unusable is the default outcome.

Follow the eight principles in **"Writing a reader can follow"** in
`.agent/rtlgraph/SPEC.md`. The three that bite hardest here:

- **Only a sentence that could be false is a result.** "It behaves correctly"
  cannot be false, so it carries nothing. "`has_byte` rises on the stop bit's
  symbol edge and holds for 40 clocks because the clearing branch needs
  `data_out_ready`" can be, so it does.
- **One name per thing, the code's own.** `bit_counter` is `bit_counter`
  everywhere — never "the counter" in the next sentence.
- **Mark little.** Spelling a name as the code does is not the same as wrapping
  it in backticks. Backticks on the first mention in a section and where the
  sentence turns on it; bold on the one phrase carrying the point. Two or three
  citations to a field — a list of five belongs under `### More`. A paragraph
  with forty marked words has no emphasis left.
- **Make a shortening pass when you think you are done.** Cut run-ups, cut what an
  earlier section already said, keep one example rather than three. But **move
  evidence under `### More` rather than deleting it.**

And join the sections **old to new**: each one opens from wording the previous
section used and ends on what is new. That is what makes nine true paragraphs
read as one argument.

**Every section has the same shape.** This is read during a viva, and a document
whose sections are each arranged differently is a document nobody can find
anything in. **Write every check as these three fields and nothing else:**

```
## <the line the bench printed>

Purpose — what this test is out to prove. One sentence.
How — what the bench did: the stimulus and the expected value, one bench citation.
Outcome — the measured times and values → it passed → **the line of the design
that made it so**.

### More
Side observations, follow-up questions, tables. This part folds away, so it can
run long.
```

**What you may write with** is what NodeGraph takes: `- ` lists, markdown
tables, `**bold**`, `` `code` ``, and KaTeX (`$...$`, and `$$...$$` on its own
line). Write formulas as KaTeX rather than Unicode symbols (`×`, `≥`, `α`). The
view draws those five and nothing else — any other markdown shows as the
characters you typed. Arithmetic a reader has to trust reads better as a
formula: `$$\frac{125\,\text{MHz}}{115200} = 1085$$`.

One or two sentences per field. Anything longer belongs under `### More`, which
the view shows folded — what is folded cannot get in the way of the verdict. An
observation that does not bear on the verdict (the list of `x` signals after
reset, say) is **one line in the body and the rest folded.**

**The most important thing in Outcome is the path through the design**: how the
stimulus travels signal → signal → register until it is the result the bench
asserted, one line citation per step. This is the part a reader cannot get from
the waveform — the picture shows that `has_byte` rose, not that `bit_counter`
reaching 1 at a symbol edge is what raised it. **What would have to be wrong for
this check to fail** goes there too, in a line, or under the fold.

**1. The first section — how it comes up.** Same three fields, kept short. A
testbench that only checks outputs will pass while a register spends the opening
microsecond undefined, so it is worth confirming: what was `x` at time 0, when
the reset let go, what was still `x` after it. But if the answer is "the design
was fully defined at release and what remains is the bench's own variables",
**write that one line as the Outcome** and fold the per-register table.

**2. One section per check** — one for each stretch in `windows`, same three
fields.

**When `windows` is empty** — the bench printed no `[%0t]`, which a handed-out
bench often does not — there are no stretches. Head the sections with **the
printed lines that carry a verdict** instead, and **say in the opening paragraph
that those headings name printed lines, not moments.** Do not invent times for
them, and do not edit the bench to add `[%0t]`: it is not yours. Lean on what the
dump does know by itself — the handshakes and when each transfer was taken.

**3. What the waveform shows that no check asserts.** Held times, wait times,
the gap between two frames, a signal that never moved. These are the facts a
passing test does not mention, and they are often the interesting ones.

**4. What is still unproven.** Finish with what neither the benches nor the
waveform establish, so the next reader knows where the edge is.

If SPEC_DOCUMENT is given, quote the sentence a check comes from when there is
one — the same verbatim rule as everywhere else. If it is empty but the project
plainly holds a brief (a PDF, say), use that and say in your report that you did.

**The bar: can a reader say one check's purpose, method and outcome in thirty
seconds?** More than ten unfolded lines per check and the answer is no — fold the
difference.

## If NodeGraph is installed

`.agent/rtlgraph/ENVIRONMENT.md` has a "Companion extensions" row for it. **If
it says NodeGraph is not installed, skip this and say so.** If it is, read the
spec that row points at (if that path is not there, the project's own
`.agent/nodegraph/SPEC.md`) and add one node per check: the measured numbers in
the content, a `code` link to the lines that produce them, and a second link to
the bench line that asserted it.

Which file: the `*.nodegraph.json` **about verification** — the one that says
what the testbenches catch — and only that one; if there is none, start
`verification.nodegraph.json`. Never write into a map of the design's structure.
Keep whatever is already in that file: if something there is wrong, say so in
the node you add rather than correcting it. **Write new nodes in the language
that file already uses** — one file, one language.

Write in English. Keep signal, module, instance and pin names exactly as the
code spells them. Run end to end without asking me anything; when you are done,
tell me the file you wrote, the one thing in the waveform you would look at
again, and anything the measurements contradict.
