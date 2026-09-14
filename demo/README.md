# demo

Golden cases shared by every package's tests.

| Path | Source |
|---|---|
| `base/` | EE578 `practice/base/` — the six shared primitives |
| `acc/` | EE578 `practice/week 2/D01-2/` — the single-component accumulator, one project |
| `acc/acc_top.rtlgraph.json` | Root file (kind `system`): the top module's ports wired to the one component box |
| `acc/acc/` | The main component: `comb/`, `seq/`, `tb/` and its schematic |
| `acc/acc/acc.rtlgraph-schematic.json` | Hand-written golden schematic. Its `origin` line numbers are checked against the `.v` files by `packages/rtl-ir/test/golden.test.ts` |

`acc/acc/tb/baseline.txt` is the 282-line dump of `acc/acc/tb/TB_GOLDEN.v` used for
refactor equivalence checks. It was produced with Vivado xsim; the testbench
changes inputs at the same posedge it samples them, so other simulators order
that race differently and the stimulus column shifts (the `ACC` column matches).
