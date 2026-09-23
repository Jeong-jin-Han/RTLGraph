PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
WAVEFORM = <leave empty to read every waveform/*.waveform.json in the project, or name one>
SPEC_DOCUMENT = <leave empty, or the path of the brief this design was asked for>

A simulation has run and something measured it. Your job is the half a machine
cannot do: say **why** it behaved that way, from the code.

PROJECT_FOLDER/.agent/rtlgraph/SPEC.md and
PROJECT_FOLDER/.agent/rtlgraph/ENVIRONMENT.md are already prepared for you —
read both, and follow "Workflow W — Waveform → why it passed".

If no report exists yet, make one: `.agent/rtlgraph/run-tb.sh --wave` runs the
benches, dumps a waveform without editing any testbench, and writes
`waveform/<bench>.vcd` and `waveform/<bench>.waveform.json` — the measurements you
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
  `file.v:12-20`. "The byte waits for the host" explains nothing; "`has_byte`
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

## Write `waveform/<bench>.waveform-analysis.md`, beside the report you read

**Use the check's own printed line as the section heading** (`## ok: cleared once
taken`), and `## Coming up` — or the same words in your language — for the
opening one. The waveform view reads this file back and puts each section beside
the instants it explains, matching them by that heading; a section whose heading
names no check is shown on its own rather than pinned to the wrong one.

**1. How it comes up.** Start here, because a testbench that only checks outputs
will pass while a register spends the opening microsecond undefined. From the
measurements: what was `x` at time 0, what the reset released at, what was still
`x` after that and until when. From the code: which lines define each of those,
and — for anything the measurements list as never defined — whether the design
can be right anyway (a signal nothing reads) or whether this is a hole.

**2. One section per check.** For each stretch in `windows`, a short section:

- the line the bench printed, and the times the stretch spans;
- what the wires did in it — the handshakes taken, the signals that moved most;
- **the path through the design**, as a flow: how the stimulus travels signal →
  signal → register until it is the result the bench asserted, one line citation
  per step. This is the part a reader cannot get from the waveform — the picture
  shows that `has_byte` rose, not that `bit_counter` reaching 1 at a symbol edge
  is what raised it;
- what would have to be wrong for this check to fail. A check that cannot fail
  is a check worth saying so about.

**3. What the waveform shows that no check asserts.** Held times, wait times,
the gap between two frames, a signal that never moved. These are the facts a
passing test does not mention, and they are often the interesting ones.

**4. What is still unproven.** Finish with what neither the benches nor the
waveform establish, so the next reader knows where the edge is.

If SPEC_DOCUMENT is given, quote the sentence a check comes from when there is
one — the same verbatim rule as everywhere else.

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
