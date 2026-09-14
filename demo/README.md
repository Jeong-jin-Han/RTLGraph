# demo

Golden cases shared by every package's tests.

| Path | Source |
|---|---|
| `base/` | EE578 `practice/base/` — the six shared primitives |
| `acc/` | EE578 `practice/week 2/D01-2/` — the single-component accumulator, restructured into `comb/` + `seq/` |
| `acc/acc_top.rtlgraph.json` | Hand-written M0 golden IR for `acc/`. Its `origin` line numbers are checked against the `.v` files by `packages/rtl-ir/test/golden.test.ts` |

`acc/tb/baseline.txt` is the 282-line dump of `acc/tb/TB_GOLDEN.v` used for
refactor equivalence checks. It was produced with Vivado xsim; the testbench
changes inputs at the same posedge it samples them, so other simulators order
that race differently and the stimulus column shifts (the `ACC` column matches).
