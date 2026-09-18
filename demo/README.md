# demo

Seven projects. Five are golden cases the tests check on every run; two are
inputs for trying the agent prompts in a fresh session. Everything here compiles
and simulates with `iverilog`, and every root validates with 0 errors.

| Project | RTLGraph files | Why it is here |
|---|---|---|
| `base/` | — | The six shared primitives (`DFF INC ADD SUB MUX2 CMP_EQ`) from EE578 `practice/base/`. Every other project instantiates them |
| `acc/` | root + 1 schematic | EE578 `practice/week 2/D01-2/`: the accumulator of slide p.31. The hand-written golden — its `origin` lines are checked against the `.v` files, and its SVGs are the render goldens |
| `sys/` | root + 4 schematics | Written for RTLGraph: the deep case. Root → `sys` → `host`, `dev` → `inbuf`, three levels of component boxes, with a golden SVG of all of them open |
| `pwm/` | root + 4 schematics + **3 FSM files** + **a brief** | The D02-2 PWM controller, written for RTLGraph: three levels of components (`pwm` → `pulse` → `cnt`, with `rdy` beside `pulse`) and a state machine at each of the top two levels plus the handshake. The case for `*.rtlgraph-fsm.json`, and for `spec`: `spec/pwm_brief.pdf` is the one-page brief the design was asked for, written by RTLGraph's own PDF writer (`node demo/pwm/spec/brief.mjs`), and four elements quote the sentence they are there for |
| `hw/` | root + 2 schematics, **all in one flat folder** | An assignment as handed out: `hw_top.v` and `counter.v` side by side, names fixed, an active-low asynchronous reset, logic in `assign` and `always` rather than instances. The case for the "follow the code" placement — no folder is created and every JSON sits beside the module it describes |
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
- **`pwm`** — the state machines: `packages/rtl-ir/test/demo-hierarchy.test.ts`
  validates all three, and `packages/rtl-layout/test/fsm.test.ts` checks each
  diagram fits its page with no label over a state box.
- **`pwm`'s brief** — `packages/rtl-ir/test/demo-hierarchy.test.ts` checks that every
  sentence a demo quotes is really in the document it names, so a `spec` link cannot
  rot into a paraphrase.
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

```bash
iverilog -g2005 -o /tmp/acc.vvp demo/acc/acc/tb/TB_GOLDEN.v \
  $(find demo/acc/acc -name '*.v' ! -path '*/tb/*') demo/base/*.v && vvp -n /tmp/acc.vvp

iverilog -g2005 -o /tmp/pwm.vvp demo/pwm/pwm/tb/TB_pwm.v \
  $(find demo/pwm/pwm -name '*.v' ! -path '*/tb/*') demo/base/*.v && vvp -n /tmp/pwm.vvp
```

`sys` prints a running sum 0, 1, 3, 6, 10, 15, 21. `stopwatch` starts, counts to
13, pauses and clears. `updown` is self-checking: `PASS: 229 cycles, 0 mismatches`.
`pwm` is self-checking too: at PERIOD=8 / DUTY=3 it reports
`PASS: 12 high of 32 cycles, 0 mismatches`, and `hw` reports
`PASS: reached the limit 4 times, 0 mismatches`. `lab` reports
`PASS: shifted in a5, match=1 parity=0, 0 mismatches`:

```bash
iverilog -g2005 -o /tmp/hw.vvp demo/hw/tb_hw.v demo/hw/hw_top.v demo/hw/counter.v && vvp -n /tmp/hw.vvp
iverilog -g2005 -o /tmp/lab.vvp demo/lab/tb/tb_lab.v demo/lab/src/*.v && vvp -n /tmp/lab.vvp
```

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
