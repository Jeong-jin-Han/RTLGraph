# RTLGraph — Agent Specification

> **If you are an AI agent creating or editing RTLGraph files (`*.rtlgraph.json`,
> `*.rtlgraph-schematic.json`), or writing RTL for an RTLGraph project, read this whole document
> first.** Also read `.agent/ENVIRONMENT.md` (which simulators and tools exist on this machine).
> Validate what you write with `node .agent/rtlgraph-validate.mjs <top>.rtlgraph.json`.

RTLGraph is a VS Code extension that draws a high-level schematic — registers, `+1`/`ADD`/`SUB`
boxes, MUXes, a control block with its truth table, component boxes that open into their own
schematics — from JSON files written by you from the RTL code. The extension only renders them;
it never changes the RTL.

---

## Quick start — pick the workflow

| The user gives you | Workflow | Result |
|---|---|---|
| A folder of **existing** RTL, asks for a schematic ("apply RTLGraph", "RTLGraph 만들어줘") | **Workflow A — RTL → RTLGraph** | `<top>.rtlgraph.json` + one `<name>.rtlgraph-schematic.json` per component, RTL untouched |
| A spec or a request to **write or restructure** RTL | **Workflow B — Spec → RTL** | RTL in the three-layer layout, then Workflow A |

Run the chosen workflow end to end without asking for clarification.

**The one principle — keep semantics, drop syntax.** For every piece of information ask: *if it
were erased, could someone rebuild the circuit from the picture alone?* If yes it is syntax
(`always` block shape, `wire`/`reg`, `=` vs `<=`, `case` vs if-else, file split) — leave it out.
If no it is semantics (where the clock boundaries are, where each value comes from and goes, what
each operation is, bit widths, what selects or enables what, what each control value means, reset
and enable priority) — it must be in the JSON.

**No invention.** Every node, net, width and line number comes from the code. When something
cannot be recovered with confidence, record a diagnostic instead of guessing.

---

## Workflow A — RTL → RTLGraph

### Step 0 — Setup
1. Read `.agent/ENVIRONMENT.md`.
2. `PROJECT_FOLDER` is the folder the user named. **Do not modify any `.v`/`.sv` file.**
3. If RTLGraph files already exist for this project, read them first (see Step 9).

### Step 1 — Read the code
- Read every `.v`/`.sv` file under `PROJECT_FOLDER`, plus any shared primitive library it
  instantiates from outside the folder (commonly `../base/` or `../../base/`).
- Skip testbenches: files under `tb/`, modules named `TB_*`/`tb_*`, modules without ports.
- For each module record: parameters, ports (direction, width), nets (width), instances with their
  port connections, `assign`s, `always` blocks, `case`/`casex` statements, and `// @sch:` comments.

### Step 2 — Find the top, the components and the files to write
- **Top** = a non-testbench module that no other module instantiates. If several remain, use the
  one whose name matches the project (or that instantiates the most), and mention the others in
  your final report.
- **Component** = a directory that has its own `seq/` folder; its **component top** is the module in
  that `seq/`. Component names are whatever the project uses; nothing is special about any name.
  A component's **name** is its folder's name. In a project without component folders (layers at the
  project root, or a flat project) the whole project is one component named after the top module
  without a trailing `_top` (`acc_top` → `acc`). A name must be a Verilog identifier.
- **Main component** = the component whose top is the top.
- **Files** — always this hierarchy, even for a single component:

  | File | Where | Holds |
  |---|---|---|
  | `<top>.rtlgraph.json` | `PROJECT_FOLDER` | the **root** (`kind: "system"`): the top's ports and component boxes only — no logic |
  | `<name>.rtlgraph-schematic.json` | the component's folder | that component's **schematic** (`kind: "component"`), Steps 4–7 |

  - **The root.** When the top only instantiates components and wires them together, the root
    describes the top itself: one `component` box per component instance, one net per wire. Otherwise
    (the usual case: the top has its own registers or logic) the top *is* the main component, and the
    root holds the top's ports, one `component` box for the main component (`module` = the top,
    `origin` = its `module` line) and one net per port.
  - **A component inside a component** is a `component` box in the parent's schematic (Step 4a); its
    schematic sits in its own folder, nested inside the parent's folder, and may contain boxes again.
  - **No component folder in the code** (layers at the project root, or a flat project): create
    `PROJECT_FOLDER/<name>/` holding only `<name>.rtlgraph-schematic.json`, with `source.root` `".."`.
    Never move code.
  - `*.rtlgraph-fsm.json` (state machines) is reserved; do not write it yet.

### Step 3 — Decide how conforming the code is
The project **conforms** when it follows the RTLGraph authoring contract (Workflow B):

| # | Contract |
|---|---|
| C1 | Clock edges only inside `DFF` instances in the component top (the only `posedge` is in the `DFF` primitive) |
| C2 | All port connections by name `.port(sig)` |
| C3 | Files in `comb/data_path/`, `comb/control_path/`, `seq/` inside a component folder — the main component has one too |
| C4 | Register nets come in `_D` / `_Q` pairs |
| C5 | `assign` in the top is plain wiring (right-hand side is one identifier) |
| C6 | Every net has exactly one driver |
| C7 | `` `default_nettype none `` in every file |

Both kinds of code are supported. Conforming code maps mechanically (Step 4a). Other code needs
inference (Step 4b), and every node inferred from an expression or an `always` block gets an `info`
diagnostic with `code` `"inferred"`. Record each contract violation you see as a `warn` diagnostic
with `code` `"C1"`…`"C7"`, `file` and `line` (line 1 for a file-level violation such as C3 or C7),
and set `source.contractCheck` to `"pass"` (none), `"partial"` (only C3/C4/C5/C7) or `"fail"`
(C1, C2 or C6).

- **Primitive definitions** (a `DFF`, `ADD`, … module defined inside the project) go in
  `source.files` and are exempt from C1 and C3 — their `posedge` is expected.
- **Code that does not compile** (missing `;`, trailing commas, undeclared names): still extract what
  the code clearly means, and add one `error` diagnostic with `code` `"syntax"`, `file` and `line` per
  problem. If ENVIRONMENT.md lists a compiler, run it to find them. Put this first in your final
  report — the user's RTL is broken, not the graph.
- A module that clearly plays the data-path or control-path role maps as in Step 4a even outside the
  contract folders (the folder problem is already a C3 diagnostic); no `inferred` diagnostic for it.

### Step 4a — Map conforming code
Walk the hierarchy from the component top. **Node ids are instance paths from the component top**,
joined with `.` (`CNT_FF`, `data_path.u_inc`, `data_path.u_ch0.u_add`). Each component has its own
schematic, so ids never reach into another component.

| Code | Becomes |
|---|---|
| A port of the component top | port node `"@NAME"` |
| Instance of a registry primitive (table below) | a node with that `module`, `kind` from the table, `params` from `#(...)` |
| Instance of another component's top | **one** `component` node (id = instance path): `name` = that component's name, `module`, `ref` = its schematic's path relative to this file (`u_dev/dev.rtlgraph-schematic.json`), `ports` = the module's ports with directions, `params`/`consts` as for primitives. Not flattened |
| Instance of a `comb/data_path` module, or any other project module | **not a node** — flatten: its contents become nodes with the instance name prefixed |
| Instance of a `comb/control_path` module | **one** `control` node (id = instance path) with `truthTable` from its `casex` |
| Vendor macro / IP you cannot read (`// @sch: blackbox`) | `blackbox` node, `rdelay` if given |
| `assign X = Y;` in the top | no node: `X` becomes an alias of net `Y` |
| Input tied to a literal (`.EN(1'b1)`) | `consts: { "EN": "1'b1" }` on that node |

### Step 4b — Infer from non-conforming code
Recover the same picture a designer would draw. Name inferred nodes after the net they drive so the
ids stay stable when the code is edited:

| Code | Becomes | Node id |
|---|---|---|
| `assign y = a + b;` | `ADD` (`a`, `b` → `y`) | `<scope>.op_y` |
| `assign y = a - b;` | `SUB` | `<scope>.op_y` |
| `assign y = a + 1;` (any width literal 1) | `INC` | `<scope>.op_y` |
| `assign y = c ? x : z;` | `MUX2`: `sel` = `c`, **`d0` = `z` (false)**, **`d1` = `x` (true)** | `<scope>.op_y` |
| `assign y = (a == b);` | `CMP_EQ` (a literal operand goes to `consts`) | `<scope>.op_y` |
| `always @(posedge CLK)` assigning `q` | `reg` node, `module: "DFF"`; reset branch → `RST` pin (`rstKind` `"async"` if the reset edge is in the sensitivity list, else `"sync"`; `rstValue`); enabling condition → `EN` pin; next-state value → `D` pin; `q` → `Q` pin. Tie missing pins with `consts` (`"RST": "1'b0"`, `"EN": "1'b1"`) | `<scope>.q_reg` |
| Next-state or other logic that is not one of the above (shift, bitwise data ops, a 4-way `case`) | `kind: "module"`, `module: "expr"`, `label`: a short summary such as `"A << 1"` or `"MUX 4:1"` | `<scope>.op_y` |
| A `case`/`casex` (or if-else chain) producing control outputs | `control` node with `truthTable` (≤ 6 inputs) or `equations` | the instance path, or `<scope>.op_<first output>` inside one module |
| Nested expression `y = (a + b) - c` | split into nodes; name the intermediate net `<scope>.y__t1` | |

`<scope>` is the instance path of the module containing the code; omit it (no leading dot) in the
top. For each inferred node add `{ "severity": "info", "code": "inferred", "msg": "...", "node": id,
"file": ..., "line": ... }`. An inferred registry node gets `params: { "BW": <width - 1> }` from the
declared width of the net it drives (`[5:0]` → `{ "BW": 5 }`).

### Step 5 — Nets (`signals`)
- One entry per electrical net. Key = the name in the component top; a net that exists only inside a
  flattened instance gets the instance path prefix (`data_path.ADD_OUT`).
- `width` from the declaration (`[5:0]` → 6), evaluating parameters.
- `driver`: exactly one endpoint. `sinks`: every other endpoint (`[]` when nothing reads the net).
  Endpoint syntax: `"<nodeId>:<port>"`, or `"@NAME"` for a component port (no `:port`). A top input
  port drives; a top output port sinks.
- **A net nothing drives is not written.** Leave the pins it would reach unconnected (the validator
  reports them as `undriven` warnings, which stay) and add a `C6` diagnostic naming the net, with the
  line where it is declared. A net with several drivers: keep the first driver, add a `C6` diagnostic.
- `aliases`: other names of the same net (from `assign X = Y` wiring).
- `flow`:
  - `"clock"` — the clock input net; `"reset"` — the primary reset input net;
  - `"control"` — nets produced by control logic (including register reset/enable controls), and
    input nets that only reach control logic or `sel`/`EN`/`RST` pins;
  - `"data"` — everything else.
- `hidden: true` on clock nets.
- `meaning`: copy `// @sch: meaning="..."` verbatim (on the declaration line or the line just before).
  Without an annotation, write a meaning only when the code makes it certain — for example the select
  of a `MUX2` whose `d0`/`d1` come from `ADD`/`SUB` gets `"0=ADD, 1=SUB"` — and add an `info`
  diagnostic with `code` `"meaning-derived"`. Otherwise leave `meaning` out; never guess intent.
- `origin`: the declaration line of the net (for a top port, its port line).

### Step 6 — Tags on nodes
Every non-port node needs `flow` and `time`:

| Node | `time` | `flow` |
|---|---|---|
| `reg` | `seq` | `data`, unless it holds FSM state (its `Q` feeds only control logic) → `control` |
| `op`, `mux`, `module` | `comb` | `data`; `control` when it lives in control-path code |
| `control` | `comb` | `control` |
| `blackbox` | `seq` if it has a read delay, else `comb` | `data` |

Port nodes carry `dir` (`in`/`out`) and `flow` (same rule as nets), no `time`. `component` nodes carry
neither `flow` nor `time` — what is inside them is tagged in their own schematic.

### Step 7 — Origins
Every node gets `origin: { "file": <path relative to source.root>, "line": <1-based> }`:
the instance statement, the `assign`, or the `always` line. A `control` node's
`truthTable.origin` is the `case`/`casex` line. **Line numbers must be exact** — the validator
checks that the line mentions the node's name (or, for `op_y`/`y_reg`, the net `y`).

### Step 8 — Validate
```bash
node .agent/rtlgraph-validate.mjs <top>.rtlgraph.json
```
Run it on the root: it checks every schematic the root reaches, and that each `component` box has
exactly the ports (and directions) of the schematic it points at (`hierarchy-ports`). Fix every
**error** and every `origin-mismatch` / `registry-*` / `width` / `hierarchy-*` warning, then run it
again, until it reports `0 errors`. `undriven` warnings that reflect real unconnected pins in the code stay,
with a matching diagnostic in the file.

### Step 9 — Re-extraction
For every file that already exists: keep its `layout`, `view` and `created` untouched, regenerate
everything else, and update `modified`. Because node ids are names from the code, the user's
placement survives.

### Step 10 — Finish
Tell the user the file paths, the validator summary, the contract check result, and that opening the
root in VS Code shows the schematic with its components as boxes that fold and unfold (it refreshes
automatically when any of the files changes).

---

## Workflow B — Spec → RTL

Use when writing new RTL or restructuring existing RTL so it conforms (C1–C7 above).

1. **Read `.agent/ENVIRONMENT.md`** and pick a simulator (`iverilog`, or Vivado `xvlog`/`xelab`/`xsim`).
2. **Refactoring existing code: dump a baseline first.** Add a testbench in `tb/` that drives inputs on
   the *negative* clock edge and samples/prints on the positive edge (driving and sampling on the same
   edge is a race whose result differs between simulators). Save its output as `tb/baseline.txt`
   before changing anything. The refactor is done only when the new output is identical (`diff` empty).
   A behaviour change is not a refactor — never mix the two.
3. **Create the main component folder before writing code** — always, even when it will be the only
   component:
   ```
   <project>/
   ├── <top>.rtlgraph.json         root (Workflow A writes it)
   └── <main>/                     the main component, named after what the design is
       ├── comb/data_path/         combinational data logic — no clock
       ├── comb/control_path/      combinational control logic — no clock
       ├── seq/                    the component top: DFF instances + wiring only — the only clock boundary
       ├── tb/                     testbenches, baseline.txt
       └── <main>.rtlgraph-schematic.json   (Workflow A writes it)
   ```
   Add a sub-component folder (with its own `comb/`, `seq/`, `tb/`) only when the design really has a
   separately clocked part; nest it inside the component that owns it. Name it after what it is.
4. **Describe the datapath first**: the registers, and the boxes between them using the primitives
   below. Then write the control signal table (inputs → outputs, one row per case); that table becomes
   the `casex` in the control path.
5. **Write the code** following C1–C7:
   - registers only as `DFF` instances in `seq/`, nets named `X_D` (next) / `X_Q` (current);
   - arithmetic and selection as primitive instances (`ADD`, `SUB`, `INC`, `MUX2`, `CMP_EQ`), not
     `+`/`-`/`?:` expressions; 1-bit boolean gating in the control path may stay an `assign`;
   - control logic as one `casex` over a concatenated input vector producing a concatenated output
     vector;
   - named port connections everywhere; `` `default_nettype none `` at the top of every file;
   - `// @sch: meaning="0=add, 1=sub"` on the line before each control output declaration;
     `// @sch: group="<name>"` before a cluster of three or more related instances;
     `// @sch: blackbox label="SRAM 1KB" rdelay=1` before vendor macro instances.
6. **Check it**: compile and elaborate (`iverilog -g2005 -o /tmp/top.vvp <files>`, or `xvlog` then
   `xelab <top>`), lint drivers (`verilator --lint-only -Wall <files>`), simulate, and for a refactor
   `diff` against the baseline.
7. **Shared primitives** stay in the shared library (`base/`). Move a project module there only when a
   *different* project needs the same thing with the same meaning; repetition inside one project is
   not a reason.
8. **Run Workflow A** to produce or refresh the root and the schematics, and validate the root.

---

## Registry — primitives the extension draws as symbols

`BW` is the **most significant bit index**: a port of width `BW` is `BW+1` bits (`DFF #(5)` holds 6
bits). Default `BW` is 5. Put the instance value in `params`: `{ "BW": 5 }`.

| `module` | `kind` | Inputs | Outputs | Widths | Behaviour |
|---|---|---|---|---|---|
| `DFF` | `reg` | `CLK`, `RST`, `EN`, `D` | `Q` | `D`,`Q`: BW+1 · `CLK`,`RST`,`EN`: 1 | sync reset to 0, `RST` beats `EN` |
| `INC` | `op` | `a` | `y` | BW+1 | `y = a + 1` |
| `ADD` | `op` | `a`, `b` | `y` | BW+1 | `y = a + b` |
| `SUB` | `op` | `a`, `b` | `y` | BW+1 | `y = a - b` |
| `MUX2` | `mux` | `sel`, `d0`, `d1` | `y` | `sel`: 1 · rest BW+1 | `sel=0 → d0`, `sel=1 → d1` |
| `CMP_EQ` | `op` | `a`, `b` | `y` | `a`,`b`: BW+1 · `y`: 1 | `y = (a == b)` |

A primitive defined inside the project with the same module name and ports counts too. Any other module
is drawn as a generic box — that is normal, not an error.

---

## File formats

### Root — `<top>.rtlgraph.json`

```jsonc
{
  "version": "0.1.0",
  "kind": "system",
  "title": "acc_top",                          // the top module
  "created": "2026-09-14T00:00:00.000Z",
  "modified": "2026-09-14T00:00:00.000Z",
  "source": { "root": ".", "files": ["acc/seq/acc_top.v"], "top": "acc_top", "contractCheck": "partial" },
  "signals": {
    "CLK": { "width": 1, "flow": "clock", "driver": "@CLK", "sinks": ["acc:CLK"], "hidden": true, "origin": { "file": "acc/seq/acc_top.v", "line": 5 } },
    "ACC": { "width": 6, "flow": "data", "driver": "acc:ACC", "sinks": ["@ACC"], "origin": { "file": "acc/seq/acc_top.v", "line": 13 } }
    // ... one net per port
  },
  "nodes": {
    "@CLK": { "kind": "port", "dir": "in", "flow": "clock", "origin": { "file": "acc/seq/acc_top.v", "line": 5 } },
    "@ACC": { "kind": "port", "dir": "out", "flow": "data", "origin": { "file": "acc/seq/acc_top.v", "line": 13 } },
    "acc": {
      "kind": "component", "name": "acc", "module": "acc_top",
      "ref": "acc/acc.rtlgraph-schematic.json",  // relative to this file
      "ports": { "CLK": "in", "RST": "in", "SHOW": "in", "MODE": "in", "ACC": "out" },
      "origin": { "file": "acc/seq/acc_top.v", "line": 3 }
    }
  }
}
```

### Schematic — `<name>.rtlgraph-schematic.json`

```jsonc
{
  "version": "0.1.0",
  "kind": "component",
  "title": "acc",                              // the component name
  "created": "2026-09-14T00:00:00.000Z",       // set once
  "modified": "2026-09-14T00:00:00.000Z",      // update on every write
  "source": {
    "root": ".",                               // the component's code folder, relative to this JSON file
    "lib": "../../base",                       // shared primitives, relative to root (omit if none)
    "files": ["seq/acc_top.v", "comb/data_path/acc_dp.v", "comb/control_path/acc_cp.v"],
    "libFiles": ["DFF.v", "INC.v", "ADD.v", "SUB.v", "MUX2.v"],
    "top": "acc_top",
    "contractCheck": "partial"                 // pass | partial | fail | unknown
  },
  "signals": {
    "CLK":     { "width": 1, "flow": "clock", "driver": "@CLK", "sinks": ["CNT_FF:CLK", "ACC_FF:CLK", "OUT_FF:CLK"], "hidden": true, "origin": { "file": "seq/acc_top.v", "line": 5 } },
    "ACC_SEL": { "width": 1, "flow": "control", "driver": "control_path:ACC_SEL", "sinks": ["data_path.u_mux:sel"], "meaning": "0=덧셈(ADD), 1=뺄셈(SUB)", "origin": { "file": "seq/acc_top.v", "line": 30 } },
    "CNT_Q":   { "width": 6, "flow": "data", "driver": "CNT_FF:Q", "sinks": ["data_path.u_inc:a", "data_path.u_add:b", "data_path.u_sub:b"], "origin": { "file": "seq/acc_top.v", "line": 18 } },
    "ACC_D":   { "width": 6, "flow": "data", "driver": "data_path.u_mux:y", "sinks": ["ACC_FF:D", "OUT_FF:D"], "aliases": ["OUT_D"], "origin": { "file": "seq/acc_top.v", "line": 21 } },
    "OUT_Q":   { "width": 6, "flow": "data", "driver": "OUT_FF:Q", "sinks": ["@ACC"], "aliases": ["ACC"], "origin": { "file": "seq/acc_top.v", "line": 26 } },
    "data_path.ADD_OUT": { "width": 6, "flow": "data", "driver": "data_path.u_add:y", "sinks": ["data_path.u_mux:d0"], "origin": { "file": "comb/data_path/acc_dp.v", "line": 22 } }
    // ... every net
  },
  "nodes": {
    "@CLK": { "kind": "port", "dir": "in", "flow": "clock", "origin": { "file": "seq/acc_top.v", "line": 5 } },
    "@ACC": { "kind": "port", "dir": "out", "flow": "data", "origin": { "file": "seq/acc_top.v", "line": 13 } },
    "CNT_FF": {
      "kind": "reg", "flow": "data", "time": "seq", "module": "DFF", "params": { "BW": 5 },
      "ports": { "CLK": "in", "RST": "in", "EN": "in", "D": "in", "Q": "out" },
      "consts": { "EN": "1'b1" },
      "rstKind": "sync", "rstPriority": "rst>en", "rstValue": "0",
      "origin": { "file": "seq/acc_top.v", "line": 54 }
    },
    "data_path.u_mux": {
      "kind": "mux", "flow": "data", "time": "comb", "module": "MUX2", "params": { "BW": 5 },
      "ports": { "sel": "in", "d0": "in", "d1": "in", "y": "out" },
      "origin": { "file": "comb/data_path/acc_dp.v", "line": 31 }
    },
    "control_path": {
      "kind": "control", "flow": "control", "time": "comb", "module": "acc_cp",
      "ports": { "RST": "in", "SHOW": "in", "MODE": "in", "CNT_RST": "out", "ACC_RST": "out", "OUT_RST": "out", "OUT_EN": "out", "ACC_SEL": "out" },
      "truthTable": {
        "inputs": ["RST", "SHOW", "MODE"],
        "outputs": ["CNT_RST", "ACC_RST", "OUT_RST", "OUT_EN", "ACC_SEL"],
        "rows": [
          { "in": ["1", "x", "x"], "out": ["1", "1", "1", "x", "x"] },
          { "in": ["0", "0", "0"], "out": ["0", "0", "0", "0", "0"] }
        ],
        "default": { "out": ["1", "1", "1", "x", "x"] },
        "origin": { "file": "comb/control_path/acc_cp.v", "line": 27 }
      },
      "origin": { "file": "seq/acc_top.v", "line": 42 }
    }
    // ... every node
  },
  "diagnostics": [
    { "severity": "warn", "code": "C7", "file": "seq/acc_top.v", "line": 1, "msg": "`default_nettype none is missing" }
  ]
}
```

### Field reference

| Field | Rule |
|---|---|
| top level | required: `version` (`"0.1.0"`), `kind` (`"system"` for the root, `"component"` for a schematic), `title`, `created`, `modified`, `source`, `signals`, `nodes`. Optional: `groups`, `layout`, `view`, `diagnostics` |
| root | only `port` and `component` nodes (a logic node there is the error `system-logic`) |
| `source` | required `root`, `files`, `top`; optional `lib`, `libFiles`, `contractCheck` |
| node `kind` | `port` · `reg` · `op` · `mux` · `control` · `module` · `blackbox` · `component` |
| logic node (not `port`/`component`) | required `flow` (`data`/`control`), `time` (`comb`/`seq`), `module`, `ports` (`{ pin: "in"/"out"/"inout" }`). Optional `params`, `consts`, `label`, `group`, `origin` |
| `component` node | required `name` (identifier), `module`, `ref` (a `*.rtlgraph-schematic.json` path relative to this file), `ports` — exactly the ports of that schematic, same directions. Optional `params`, `consts`, `label`, `origin`. No `flow`/`time` |
| `reg` extras | `rstKind` (`sync`/`async`), `rstPriority` (`rst>en`/`en>rst`), `rstValue` |
| `control` extras | `truthTable` { `inputs`, `outputs`, `rows`: [{ `in`, `out`, `note?` }], `default?`: { `out` }, `origin` } with values `"0"`/`"1"`/`"x"`; or `equations`: [{ `output`, `expr` }] |
| `blackbox` extras | `rdelay` |
| port node | required `dir`, `flow` (`data`/`control`/`clock`/`reset`); no `time` |
| signal | required `width`, `flow`, `driver`, `sinks`; optional `aliases`, `meaning`, `hidden`, `origin` |
| `groups` | `{ "<id>": { "label": "...", "members": [nodeIds] } }` from `// @sch: group=` |
| `layout`, `view` | **owned by the user and the extension — never write them**, keep them as they are |
| `diagnostics` | `{ severity: error/warn/info, code, msg, file?, line?, node?, signal? }` |

### Ids and names

| Thing | Format | Example |
|---|---|---|
| Instance node | instance path from the component top | `CNT_FF`, `data_path.u_inc` |
| Component node | instance path; in a root wrapping the main component, its name | `u_dev`, `acc` |
| Inferred logic | `<scope>.op_<net it drives>` | `data_path.op_CNT_D` |
| Inferred register | `<scope>.<Q net>_reg` | `ACC_Q_reg` |
| Port node | `@` + port name | `@ACC` |
| Net | name in the component top, else instance path + name | `CNT_Q`, `data_path.ADD_OUT` |
| Endpoint | `<nodeId>:<pin>`, or `@NAME` | `data_path.u_mux:sel`, `@ACC` |

Never use line numbers or counters in ids — the user's layout is matched by id.

---

## Language rules
- Ids, net names, module names, pin names, literals: exactly as in the code, never translated.
- `meaning`, `label`, `note`, diagnostic `msg`: in the language the user asked for. In Korean, add the
  English term in parentheses the first time a technical term appears **within each string** (each is
  shown on its own), e.g. "누산기(accumulator)".
- `meaning` copied from an `@sch` comment stays verbatim.

---

## Checklist
- [ ] RTL files untouched (Workflow A)
- [ ] Root `<top>.rtlgraph.json` in the project folder; one `<name>.rtlgraph-schematic.json` per component in its folder (a folder of its own when the code has none)
- [ ] Every component box's `ports` match its schematic's port nodes; `ref` resolves
- [ ] Every register in the code is a `reg` node; every clock boundary is visible
- [ ] Every primitive instance / inferred operation is a node; nothing drawn twice
- [ ] Every net has exactly one `driver`; every input pin is a sink of one net or in `consts`
- [ ] Widths match declarations (`BW+1` rule for primitives)
- [ ] `flow`/`time` on every non-port node; clock nets `hidden`
- [ ] Every node and net has an exact `origin`; control nodes have `truthTable.origin`
- [ ] Contract violations and inferred elements listed in `diagnostics`; `contractCheck` set
- [ ] Existing `layout`, `view`, `created` preserved; `modified` updated
- [ ] `node .agent/rtlgraph-validate.mjs <top>.rtlgraph.json` reports `0 errors`
