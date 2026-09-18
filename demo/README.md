# demo

Seven projects. Six are checked by the tests on every run; `stopwatch` is kept
without RTLGraph files as the input for trying the prompts in a fresh session.
Every project compiles and simulates with `iverilog`, every testbench says PASS
on its own, and every root validates with 0 errors and 0 warnings.

| Project | RTLGraph files | Why it is here |
|---|---|---|
| `base/` | — | The six shared primitives (`DFF INC ADD SUB MUX2 CMP_EQ`) from EE578 `practice/base/`. Every other project instantiates them |
| `acc/` | root + 1 schematic | EE578 `practice/week 2/D01-2/`: the accumulator of slide p.31. The hand-written golden — its `origin` lines are checked against the `.v` files, and its SVGs are the render goldens |
| `sys/` | root + 4 schematics | Written for RTLGraph: the deep case. Root → `sys` → `host`, `dev` → `inbuf`, three levels of component boxes, with a golden SVG of all of them open |
| `pwm/` | root + 4 schematics + **3 FSM files** + **a brief** | The D02-2 PWM controller, written for RTLGraph: three levels of components (`pwm` → `pulse` → `cnt`, with `rdy` beside `pulse`) and a state machine at each of the top two levels plus the handshake. The case for `*.rtlgraph-fsm.json`, and for `spec`: `spec/pwm_brief.pdf` is the one-page brief the design was asked for, written by RTLGraph's own PDF writer (`node demo/pwm/spec/brief.mjs`), and six elements quote the sentence they are there for. Only the top two files name the document; anything deeper inherits it |
| `hw/` | root + 2 schematics, **all in one flat folder** | An assignment as handed out: `hw_top.v` and `counter.v` side by side, names fixed, an active-low asynchronous reset, logic in `assign` and `always` rather than instances. The case for the "follow the code" placement — no folder is created and every JSON sits beside the module it describes. Its handout, `hw_brief.pdf`, sits in that same flat folder (`node demo/hw/brief.mjs`): right-clicking any box here opens it, and three elements quote the line they are there for |
| `lab/` | root + 2 schematics, **all in `rtlgraph/`** | The other way to draw code you must not touch: `src/` is left exactly as handed out and every RTLGraph file is kept together in one folder of its own, with `source.root` climbing back out (`../src`). Also the case for logic with no symbol — a concatenation and a reduction `^` |
| `stopwatch/` | **none, on purpose** | Typical non-conforming student code: flat folder, an FSM in `always` blocks, one positional connection, one counter module used twice, an active-low reset. The input for testing `.prompt/assignment/*.md` in a fresh session — its structure is exactly the kind that must be left alone |
| `updown/` | root + 1 schematic | Written end to end by a fresh `claude -p` session from `.prompt/rtl/korean.md`: RTL, testbench, root and schematic. Kept in step with the spec since (the form it was produced in is in git) |

## What each project checks

- **`acc`** — `packages/rtl-ir/test/golden.test.ts` (origins against the Verilog),
  `packages/rtl-render/test/render.test.ts` (`acc.svg`, `acc.datapath.svg`,
  `acc_top.svg`), and the end-to-end test opens `acc/acc_top.rtlgraph.json` in a
  real VS Code.
- **`sys`** — three levels in `packages/rtl-layout/test/hierarchy.test.ts` and
  `packages/rtl-render/test/render.test.ts` (`sys_top.svg`), plus the nested
  fold/unfold steps of the end-to-end test.
- **`pwm`'s brief** — `packages/rtl-ir/test/demo-hierarchy.test.ts` resolves each
  `spec` to the file it names and checks the sentence is in it; the end-to-end test
  opens it beside the drawing with `RTLGraph: Open the Requirement…`.
- **`pwm`** — also a render golden (`pwm_top.svg`): frames three deep, a state
  register in two of them, and operations the registry has no symbol for, which
  is the drawing most likely to shift under a layout change. It is what the
  webview test drives, too (`packages/vscode-ext/test/webview.test.ts`).
- **`pwm`** — the state machines: `packages/rtl-ir/test/demo-hierarchy.test.ts`
  validates all three, and `packages/rtl-layout/test/fsm.test.ts` checks each
  diagram fits its page with no label over a state box.
- **`lab`** — the folder-of-its-own placement, and the code jump across it:
  `originOf` has to climb out of `rtlgraph/` to reach `../src/shift_reg.v`.
- **`hw`** — the flat placement: `packages/rtl-ir/test/demo-hierarchy.test.ts`
  walks it, and its inferred names (`op_Q_D__t1`, `Q_reg`) are what the origin
  check has to follow back to the names the code uses.
- **`updown`** — the regression case for a data input sharing the control block's
  row (it used to make two frame pins overlap).
- **`acc`, `sys`, `updown`** — all three are laid out on their own in
  `packages/rtl-layout/test/demo.test.ts` and walked by
  `packages/rtl-ir/test/demo-hierarchy.test.ts`.

## Simulating

Each one, copy-paste:

```bash
iverilog -g2005 -o /tmp/acc.vvp demo/acc/acc/tb/TB_GOLDEN.v \
  $(find demo/acc/acc -name '*.v' ! -path '*/tb/*') demo/base/*.v && vvp -n /tmp/acc.vvp

iverilog -g2005 -o /tmp/sys.vvp demo/sys/sys/tb/TB_sys.v \
  $(find demo/sys/sys -name '*.v' ! -path '*/tb/*') demo/base/*.v && vvp -n /tmp/sys.vvp

iverilog -g2005 -o /tmp/pwm.vvp demo/pwm/pwm/tb/TB_pwm.v \
  $(find demo/pwm/pwm -name '*.v' ! -path '*/tb/*') demo/base/*.v && vvp -n /tmp/pwm.vvp

iverilog -g2005 -o /tmp/updown.vvp demo/updown/updown/tb/tb_updown.v \
  $(find demo/updown/updown -name '*.v' ! -path '*/tb/*') demo/base/*.v && vvp -n /tmp/updown.vvp

iverilog -g2005 -o /tmp/hw.vvp demo/hw/tb_hw.v demo/hw/hw_top.v demo/hw/counter.v && vvp -n /tmp/hw.vvp

iverilog -g2005 -o /tmp/lab.vvp demo/lab/tb/tb_lab.v demo/lab/src/*.v && vvp -n /tmp/lab.vvp

iverilog -g2005 -o /tmp/sw.vvp demo/stopwatch/tb/tb_stopwatch.v \
  $(find demo/stopwatch -name '*.v' ! -path '*/tb/*') && vvp -n /tmp/sw.vvp
```

`hw`'s testbench sits beside its code rather than under `tb/`, the way a
handed-out skeleton usually does — so a `find … ! -path '*/tb/*'` would compile it
twice. That is why its line names the files.

What each says:

| Project | The last line |
|---|---|
| `acc` | the 282-line dump `TB_GOLDEN.v` has always printed (its golden is `baseline.txt`) |
| `sys` | `PASS: the sum reached 21, 0 mismatches` |
| `pwm` | `PASS: 12 high of 32 cycles, 0 mismatches` |
| `updown` | `PASS: 229 cycles, 0 mismatches` |
| `hw` | `PASS: reached the limit 4 times, 0 mismatches` |
| `lab` | `PASS: shifted in a5, match=1 parity=0, 0 mismatches` |
| `stopwatch` | a trace: it starts, counts to 13, pauses and clears |

`acc/acc/tb/baseline.txt` is the 282-line dump of `TB_GOLDEN.v` kept for refactor
equivalence checks. It was produced with Vivado xsim; the testbench changes inputs
at the same posedge it samples them, so other simulators order that race
differently and the stimulus column shifts (the `ACC` column matches).

## What the validator expects of all of them

`node packages/vscode-ext/dist/agent/rtlgraph-validate.mjs demo/<project>/<top>.rtlgraph.json`
reports **0 errors and 0 warnings** for every project here, and
`packages/rtl-ir/test/demo-hierarchy.test.ts` keeps it that way. The counts of
"diagnostics recorded in the files" are deliberate: they are what each project
says about itself (an inferred node, a pin left open, a contract it does not follow).

## Not in git

`.out-*` folders are exports written by the extension (the `rtlgraph.export.folder`
setting) and are ignored. Delete them freely; they are regenerated on the next
export, and an old one can show a drawing several changes out of date.
