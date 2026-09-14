# demo

Golden cases shared by every package's tests, and projects for trying the agent prompts.

| Path | Source |
|---|---|
| `base/` | EE578 `practice/base/` — the six shared primitives |
| `acc/` | EE578 `practice/week 2/D01-2/` — the single-component accumulator, one project |
| `acc/acc_top.rtlgraph.json` | Root file (kind `system`): the top module's ports wired to the one component box |
| `acc/acc/` | The main component: `comb/`, `seq/`, `tb/` and its schematic |
| `acc/acc/acc.rtlgraph-schematic.json` | Hand-written golden schematic. Its `origin` line numbers are checked against the `.v` files by `packages/rtl-ir/test/golden.test.ts` |
| `sys/` | A conforming nested design and the deep golden case: root → `sys` → `host`, `dev` → `inbuf`, three levels of component boxes. `sys/sys/tb/TB_sys.v` prints a running sum 0, 1, 3, 6, 10, 15, 21 |
| `stopwatch/` | RTL only: typical non-conforming student code — a flat folder, an FSM in `always` blocks, a positional port connection, and one counter module instantiated twice. `tb/tb_stopwatch.v` starts, pauses and clears |
| `updown/` | Written end to end by a fresh `claude -p` session from `.prompt/rtl/korean.md` (Workflow B) with the request "6-bit up/down counter with synchronous load, RST > LOAD > EN": RTL, testbench, root and schematic, kept as produced |

`acc/acc/tb/baseline.txt` is the 282-line dump of `acc/acc/tb/TB_GOLDEN.v` used for
refactor equivalence checks. It was produced with Vivado xsim; the testbench
changes inputs at the same posedge it samples them, so other simulators order
that race differently and the stimulus column shifts (the `ACC` column matches).

`sys/` and `stopwatch/` have no RTLGraph files on purpose: they are inputs for
testing `.prompt/rtlgraph/*.md` in a fresh session.
