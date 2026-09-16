# demo

Five projects. Three are golden cases the tests check on every run; two are
inputs for trying the agent prompts in a fresh session. Everything here compiles
and simulates with `iverilog`, and every root validates with 0 errors.

| Project | RTLGraph files | Why it is here |
|---|---|---|
| `base/` | — | The six shared primitives (`DFF INC ADD SUB MUX2 CMP_EQ`) from EE578 `practice/base/`. Every other project instantiates them |
| `acc/` | root + 1 schematic | EE578 `practice/week 2/D01-2/`: the accumulator of slide p.31. The hand-written golden — its `origin` lines are checked against the `.v` files, and its SVGs are the render goldens |
| `sys/` | root + 4 schematics | Written for RTLGraph: the deep case. Root → `sys` → `host`, `dev` → `inbuf`, three levels of component boxes, with a golden SVG of all of them open |
| `pwm/` | root + 4 schematics + **3 FSM files** | The D02-2 PWM controller, written for RTLGraph: three levels of components (`pwm` → `pulse` → `cnt`, with `rdy` beside `pulse`) and a state machine at each of the top two levels plus the handshake. The case for `*.rtlgraph-fsm.json` |
| `stopwatch/` | **none, on purpose** | Typical non-conforming student code: flat folder, an FSM in `always` blocks, one positional connection, one counter module used twice, an active-low reset. The input for testing `.prompt/rtlgraph/*.md` |
| `updown/` | root + 1 schematic | Written end to end by a fresh `claude -p` session from `.prompt/rtl/korean.md`, kept as produced: RTL, testbench, root and schematic |

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
`PASS: 12 high of 32 cycles, 0 mismatches`.

`acc/acc/tb/baseline.txt` is the 282-line dump of `TB_GOLDEN.v` kept for refactor
equivalence checks. It was produced with Vivado xsim; the testbench changes inputs
at the same posedge it samples them, so other simulators order that race
differently and the stimulus column shifts (the `ACC` column matches).

## Not in git

`.out-*` folders are exports written by the extension (the `rtlgraph.export.folder`
setting) and are ignored. Delete them freely; they are regenerated on the next
export, and an old one can show a drawing several changes out of date.
