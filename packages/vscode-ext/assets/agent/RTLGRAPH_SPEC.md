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
| An **assignment** whose skeleton must be kept as handed out | **Workflow A**, placing the files *beside the code* (Step 2, "Follow the code") | the same files, and not one folder or name changed |
| An **idea** (a file, a paragraph) and no code yet | **Workflow S — Idea → Spec** | `SPEC.md`: ports, components, control table, states — no code |
| A spec, and an **empty or new** project | **Workflow B — Spec → RTL** | new RTL in the three-layer layout, then Workflow A |
| **Existing** RTL to restructure, often with a feature to add | **Workflow C — Existing RTL → Refactored RTL** | the same design in the three-layer layout, the feature added separately, then Workflow A |

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
- **Component** = a part of the design drawn as a box that opens into its own schematic.
  - In code **with component folders**: a directory that has its own `seq/` folder. Its **component
    top** is the module in that `seq/`; its **name** is the folder's name.
  - In code **without them** (layers at the project root, or a flat project): the top, plus every
    project module that **holds state** — a register anywhere inside it (`always @(posedge …)` or a
    `DFF` instance, directly or in a module it instantiates) — and is instantiated by another
    component. Its name is the module name without a trailing `_top` (`acc_top` → `acc`,
    `bcd_counter` → `bcd_counter`). A project module without state is not a component: it is
    flattened, or becomes a `control` node (Step 4a).

  A name must be a Verilog identifier. Nothing is special about any name.
- **Main component** = the component whose top is the top.
- **Files** — always this hierarchy, even for a single component:

  | File | Where | Holds |
  |---|---|---|
  | `<top>.rtlgraph.json` | `PROJECT_FOLDER` | the **root** (`kind: "system"`) |
  | `<name>.rtlgraph-schematic.json` | the component's folder | that component's **schematic** (`kind: "component"`), Steps 4–7 |
  | `<name>.rtlgraph-fsm.json` | the same folder | that component's **state machine** (`kind: "fsm"`), Step 7b — only when it has one |

  - **The root** holds the top's ports, exactly **one** `component` box — the main component
    (`module` = the top, `origin` = its `module` line) — and one net per port. Nothing else, even when
    the top only wires other components together: those are boxes in the main component's schematic.
  - **A component inside a component** is a `component` box in the parent's schematic (Step 4a). Its
    schematic goes in its own folder inside the parent's folder, and may contain boxes again. Several
    instances of one module share one schematic — in the folder under the first parent that
    instantiates it (in file order) — and every box's `ref` points at it.
  - **Where the files go** — two ways, and the user's prompt says which:

    | | **Follow the code** (a handed-out skeleton, an assignment, someone else's repository) | **One folder of your own** (the same, when the user asks for the files kept together) | **Build the contract layout** (the code already follows the contract, or you wrote it in Workflow B/C) |
    |---|---|---|---|
    | Folders | none are created; the tree stays exactly as it is | one is created, `<RTLGRAPH_FOLDER>` (say `rtlgraph/`), and nothing else | `PROJECT_FOLDER/<main>/`, `<main>/<child>/` hold the schematics |
    | The root file | in `PROJECT_FOLDER`, beside the top's code | in that folder | in `PROJECT_FOLDER` |
    | A component's schematic | beside the file its component top is in (`counter.v` → `counter.rtlgraph-schematic.json`) | in that folder too, all of them together | in that component's own folder |
    | `source.root` | usually `"."`: the code is right there | the way back out to the code (`".."`, `"../src"`) | the path back to where the sources are |
    | `ref` | the path from the parent's file to the child's, which in a flat project is just the file name | just the file name: they are siblings | `child/child.rtlgraph-schematic.json` |

    In all three: **never move, rename or copy code**, and never change a name the code uses. In the
    first two, say so in the root's `diagnostics` (`layout-follows-code`) so the next reader knows the
    placement was deliberate.
  - **`source.root`** is the path from the schematic's folder to the folder its `source.files` are
    relative to: `"."` when the code sits in that folder, `".."` for `PROJECT_FOLDER/<main>/` over a
    flat project, `"../.."` one level deeper. **This is the field that goes wrong most often** — the
    JSON is moved into a folder of its own and the root is left as `"."`. The validator then reports
    `source-root`, an **error**, naming the folder the code is really in and the value `source.root`
    should have; `source.lib` is checked the same way and reported as `source-lib`. Check it
    whenever a file moves.

### Step 3 — Decide how conforming the code is
The project **conforms** when it follows the RTLGraph authoring contract (Workflow B):

| # | Contract |
|---|---|
| C1 | Clock edges only inside `DFF` instances in the component top (the only `posedge` is in the `DFF` primitive) |
| C2 | All port connections by name `.port(sig)` |
| C3 | Files in `comb/data_path/`, `comb/control_path/`, `seq/` inside a component folder — the main component has one too. A folder the design does not need (a component with no combinational logic of its own) is not a violation |
| C4 | Register nets come in `_D` / `_Q` pairs |
| C5 | `assign` in the top is plain wiring (right-hand side is one identifier) |
| C6 | Every net has exactly one driver |
| C7 | `` `default_nettype none `` in every project file. Testbenches are outside every contract |

Both kinds of code are supported. Conforming code maps mechanically (Step 4a). Other code needs
inference (Step 4b), and every node inferred from an expression or an `always` block gets an `info`
diagnostic with `code` `"inferred"`. Record each contract violation you see as a `warn` diagnostic
with `code` `"C1"`…`"C7"`, `file` and `line` (line 1 for a file-level violation such as C3 or C7),
and set `source.contractCheck` to `"pass"` (none), `"partial"` (only C3/C4/C5/C7) or `"fail"`
(C1, C2 or C6).

- **Primitive definitions** (a `DFF`, `ADD`, … module) are exempt from C1 and C3 — their `posedge` is
  expected. Inside the project they go in `source.files`; in a shared library they go in
  `source.libFiles`, with `source.lib` naming the folder.
- **A `reg` node's `rstKind`, `rstPriority` and `rstValue`** describe the flip-flop it instantiates, so
  for a registry primitive they come from that primitive's own definition (`base/DFF.v`: synchronous,
  `RST` beats `EN`, clears to 0). Reading them there is not invention.
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
| Instance of a component (Step 2) | **one** `component` node (id = instance path): `name` = that component's name, `module`, `ref` = its schematic's path relative to this file (`dev/dev.rtlgraph-schematic.json`), `ports` = the module's ports with directions, `params`/`consts` as for primitives. Not flattened, in conforming and non-conforming code alike |
| Instance of a `comb/data_path` module, or any other project module that is not a component | **not a node** — flatten: its contents become nodes with the instance name prefixed |
| Instance of a `comb/control_path` module | **one** `control` node (id = instance path), `ports` = that module's own ports, `truthTable` from its `casex` |
| Vendor macro / IP you cannot read (`// @sch: blackbox`) | `blackbox` node, `rdelay` if given |
| `assign X = Y;` in the top | no node: `X` becomes an alias of net `Y` |
| Input tied to a literal (`.EN(1'b1)`) | `consts: { "EN": "1'b1" }` on that node |

The two layers are treated differently on purpose: a data-path module is a wrapper around boxes worth
drawing, so it is flattened, while a control-path module **is** one box — its table.

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
- `meaning`: copy `// @sch: meaning="..."` verbatim. Look on the net's declaration line and the line
  just before it, **and** on the declaration of the port that drives the net — in a conforming design
  the annotation sits on the control path's output port, in another file. Copying it onto the net in
  the component top is right; so is carrying a component's port meaning up to the net that feeds it in
  the parent. Add an `info` diagnostic with `code` `"meaning-copied"` naming the file it came from.
  Without an annotation, write a meaning only when the code makes it certain — for example the select
  of a `MUX2` whose `d0`/`d1` come from `ADD`/`SUB` gets `"0=ADD, 1=SUB"` — and add an `info`
  diagnostic with `code` `"meaning-derived"`. Otherwise leave `meaning` out; never guess intent.
- `origin`: the declaration line of the net (for a top port, its port line).
- **Each file describes its own component.** A wire the parent calls `control` (it leaves the parent's
  control block) is the child's own reset or enable input, and inside the child it is tagged by what it
  does there: the net that clears the child's registers is `"reset"` in the child even though the same
  physical wire is `"control"` in the parent. Nothing has to agree across the boundary except port
  names and directions.

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
`truthTable.origin` is the `case`/`casex` line. **Line numbers must be exact** — the validator checks
that the line carries a name the element is known by:

| Element | Names the line may carry |
|---|---|
| any node | the node id, or its last path segment (`data_path.u_inc` → `u_inc`) |
| `component` node | also its `module`, so a root box sits on the top's `module` line |
| inferred `op_<net>` / `<net>_reg` | also the net (`op_CNT_D` → `CNT_D`) |
| net | also any of its `aliases` |

### Step 7b — State machines (`<name>.rtlgraph-fsm.json`)
Write one **only when the component has a machine**: a register whose value names what the design is
doing, read by logic that decides the next one — a `casex`/`case` on a state register, or an `always`
block assigning a `*_STATE`/`*_state` register. A counter is not a machine; neither is a register that
only holds data.

1. Mark the state register in the schematic: `fsm: "<name>.rtlgraph-fsm.json"` on that `reg` node, and
   `flow: "control"`. That is what puts it under **Seq → FSM** in the view and what the FSM button opens.
2. Write the file next to the schematic (fields below). What matters is what the machine *means*:
   - `machine.style` — `moore` when the outputs depend on the state alone, `mealy` when a transition
     drives them. **Read it off the code, never guess**: outputs assigned per state → Moore.
   - `machine.reset` — the state after reset; `machine.node` — the `reg` node id holding it.
   - every state: `meaning` in words ("waiting to be set up"), `encoding` as the code writes it
     (`2'd0`), and for Moore the `outputs` it drives.
   - every transition: `when` **in words** ("the core is activated"), and `guard` for the condition as
     the code writes it (`SET & ~STOP`). A state that stays put for a cycle is a transition to itself.
3. Cover every state: one transition per `casex` row, so the diagram and the code say the same thing.

### Step 7c — The brief (`spec`)
When the user gives a document the design was asked for — an assignment PDF, a
requirements page — record where each piece comes from:

1. `source.spec`: the document, relative to `source.root` (`"spec/pwm_brief.pdf"`, or
   `"hw_brief.pdf"` when the handout sits beside the code). Name it in the **root**;
   a schematic that does not name one inherits the nearest one above it, so every
   box in the design can open the brief even where it quotes no sentence. Repeating it in a
   child file is allowed and changes nothing (`demo/pwm` names it in the root and in
   the main component's schematic); it is only *needed* when that component was asked
   for by a different document.
2. On the elements the document actually talks about, `spec: { quote, page }`:
   - `quote` is the sentence **verbatim**, copied from the document, not paraphrased —
     it is what finds the line again.
   - `page` is where it is (1-based).
   - Put it where the reader would look for it: an interface line on the **net**
     (`"RDY : Active-low when the PWM core is activated"`), a behaviour on the **box**
     that implements it.
3. Quote what is there. A requirement the design does not implement is not a `spec`
   entry; it is a `diagnostic`, so the gap is visible.

### Step 8 — Validate
```bash
node .agent/rtlgraph-validate.mjs <top>.rtlgraph.json
```
Run it on the root: it checks every schematic the root reaches, and that each `component` box has
exactly the ports (and directions) of the schematic it points at (`hierarchy-ports`). Fix every
**error** and every `origin-mismatch` / `registry-*` / `width` / `hierarchy-*` warning, then run it
again, until it reports `0 errors`. `undriven` warnings that reflect real unconnected pins in the code stay,
with a matching diagnostic in the file.

### Step 8b — What the validator will tell you
The codes you are most likely to see, and what each means:

| Code | What it is saying |
|---|---|
| `schema`, `node-id`, `endpoint` | the shape of the file is wrong — a missing field, an id that is not a `@port`/`node:pin` |
| `undriven`, `multi-driven` | a net with no driver, or a pin driven twice |
| `meaning-missing` | a `control` or `reset` net does not say what it means when asserted |
| `origin-mismatch` | the line named does not mention that element (a name you invented may name anything it is wired to) |
| `source-root`, `source-lib` | **none** of the files are where `source.root` (or `source.lib`) points — usually the JSON sits in a folder of its own and the root was left as `"."`; the message says what it should be |
| `source-missing` | one named file is not there, while the rest are |
| `registry-*`, `width` | a primitive's ports or widths do not match `base/` |
| `hierarchy-missing`, `hierarchy-ports` | a `ref` that resolves nowhere, or a box whose ports differ from its schematic |
| `fsm-missing`, `fsm-state`, `fsm-when`, `fsm-style`… | the machine file is missing, or its states and transitions do not hold together |
| `spec-quote`, `spec-file` | a `spec` with nothing quoted, or naming no document |
| `system-logic`, `system-empty` | logic in the root, or a root with no component |

Fix every error. A warning is either a real finding about the code — leave it, with a
matching `diagnostics` entry — or a mistake in what you wrote.

### Step 9 — Re-extraction
For every file that already exists: keep its `layout`, `view` and `created` untouched, regenerate
everything else, and update `modified`. Because node ids are names from the code, the user's
placement survives.

### Step 10 — Finish
Tell the user the file paths, the validator summary and the contract check result, and say what
opening the root in VS Code gives them. It refreshes by itself whenever any of the files changes;
what a reader does there, and therefore what is worth mentioning:

| In the editor | What it does |
|---|---|
| Fold / Unfold a component | Opens **one level**: the box's own schematic with its components as boxes. Whatever was open inside it goes back to folded, so the same box always opens to the same picture. "and everything inside" opens every level at once |
| **Prev** | Walks back out a level at a time — up to the component this schematic sits inside, or all the way to the root |
| Right-click a box or net | Its code (`origin`), the schematic inside it, and — where `source.spec` is set — **the requirement**: the document opens beside the drawing in the editor's own PDF reader with the quoted sentence highlighted. A box that quotes nothing offers the document itself |
| Export | SVG / PNG / PDF of the current view, and XLSX of the tables behind it — control signals, truth tables, state transitions, and **one tab of requirements against whatever carries each**, which is what the `spec` quotes of Step 7c are for |

So say which boxes carry a requirement, if any, and which file to open first.

---

## Workflow S — Idea → Spec

Use when the user has an idea and no code: produce `SPEC.md` in `PROJECT_FOLDER`, and nothing else.
Workflow B then builds from it.

1. **Read the idea in full** (the file the user names, plus anything it points at).
2. **Write `SPEC.md`** covering, in this order:
   - what the design does, in two or three sentences;
   - the top module's ports: name, direction, width, meaning;
   - the components (Step 2 of Workflow A defines what a component is) and what each is responsible
     for, as a tree;
   - per component: the registers, the operations between them, and the control signal table
     (input combination → output values, one row per case);
   - the states and transitions where a state machine is needed, each with what it means;
   - reset behaviour and the priority between reset, load and enable;
   - how the result will be checked (what a testbench drives and what it expects).
3. **Decide what the idea leaves open** — widths, clock rate, initial values, encodings. Collect every
   such choice in a **Decisions** section with the reason. Never leave a blank for the user to fill.
4. **List what stays unclear** in an **Open questions** section: contradictions in the idea, missing
   numbers you had to invent, anything a reviewer should confirm.
5. Choose signal, module and port names as identifiers the code can use unchanged. Write the prose in
   the language the user asked for; keep the identifiers in English.

Do not create folders, RTL or RTLGraph files in this workflow.

---

## Workflow B — Spec → RTL

Use when writing **new** RTL (an empty or fresh project). To restructure code that already exists,
use Workflow C.

1. **Read `.agent/ENVIRONMENT.md`** and pick a simulator (`iverilog`, or Vivado `xvlog`/`xelab`/`xsim`).
2. **Read the spec document** if the user names one (`SPEC.md` from Workflow S, or their own): its
   ports, component tree and control tables are the contract. Departing from it needs a reason in your
   final report. Without a document, work from the request itself and say what you assumed.
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
   separately clocked part; nest it inside the component that owns it and instantiate its top from the
   owner's `seq/` top. Name it after what it is.
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

**The main component's name** comes from the user when they give one. Otherwise name it after what the
design is (`acc`, `uart`, `stopwatch`), never after the file layout, and say in your report why you
chose it.

---

## Workflow C — Existing RTL → Refactored RTL

Use when code already exists and the user wants it restructured, usually with something added. The
rule is that **restructuring and new behaviour never happen in the same step**.

1. **Read the code and report first**: how it is structured today, which of C1–C7 it breaks, and what
   has to change for the request. Then work without asking.
2. **Dump a baseline before touching anything.** Add a testbench in `tb/` that drives inputs on the
   *negative* clock edge and samples/prints on the positive edge (driving and sampling on the same
   edge is a race whose result differs between simulators). Save its output as `tb/baseline.txt`.
3. **Step one — same behaviour, new structure.** Move the design into the layout of Workflow B step 3
   and follow C1–C7. The step is done only when the testbench output is identical (`diff` empty). If
   the diff is not empty, fix the refactor; never adjust the baseline to match.
4. **Step two — the new behaviour.** Add what the user asked for, extend the testbench for it, and say
   which outputs change and why. Keep the old expectations that still apply.
5. **Keep the code's own names** — modules, nets, ports — unless the request is to rename them. A
   refactor that renames everything cannot be reviewed against the baseline.
6. **Check it** as in Workflow B step 6, and run **Workflow A** at the end.

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

### State machine — `<name>.rtlgraph-fsm.json`

```jsonc
{
  "version": "0.1.0",
  "kind": "fsm",
  "title": "pwm",                              // the component's name
  "created": "2026-09-16T00:00:00.000Z",
  "modified": "2026-09-16T00:00:00.000Z",
  "source": { "root": ".", "files": ["comb/control_path/pwm_fsm.v", "seq/pwm_top.v"], "top": "pwm_top" },
  "machine": {
    "name": "STATE",                           // what the code calls the machine
    "style": "moore",                          // read off the code, never guessed
    "reset": "IDLE",
    "node": "STATE_FF",                        // the reg node in the schematic holding it
    "inputs":  [{ "name": "SET", "meaning": "1 cycle: start the wave" }],
    "outputs": [{ "name": "RUN_EN", "meaning": "1=the pulse generator is running" }]
  },
  "states": {
    "IDLE": {
      "meaning": "waiting to be set up: nothing is driven",   // required, in words
      "encoding": "2'd0",
      "outputs": { "RUN_EN": "0" },            // Moore: what this state drives
      "origin": { "file": "comb/control_path/pwm_fsm.v", "line": 34 }
    }
    // ... one per state
  },
  "transitions": [
    {
      "from": "IDLE", "to": "LOAD",
      "when": "the core is activated",         // required, in words
      "guard": "SET",                          // the condition as the code writes it
      "origin": { "file": "comb/control_path/pwm_fsm.v", "line": 33 }
    }
    // ... one per casex row, self-transitions included
  ]
}
```

| Field | Rule |
|---|---|
| top level | required: `version`, `kind` (`"fsm"`), `title`, `created`, `modified`, `source`, `machine`, `states`, `transitions`. Optional: `layout`, `view`, `diagnostics` |
| `machine` | required `name`, `style` (`moore`/`mealy`), `reset` (a state id); optional `node` (the `reg` node id), `inputs`, `outputs` (`{ name, meaning? }`) |
| state | required `meaning` (what the design is doing while it is there); optional `label`, `encoding`, `outputs` (Moore), `origin` |
| transition | required `from`, `to` (state ids), `when` (in words); optional `guard` (the condition as written), `outputs` (Mealy), `origin` |
| style | a Moore machine drives from its **states**, a Mealy one from its **transitions** — outputs on the wrong side are an error |

### Field reference

| Field | Rule |
|---|---|
| top level | required: `version` (`"0.1.0"`), `kind` (`"system"` for the root, `"component"` for a schematic), `title`, `created`, `modified`, `source`, `signals`, `nodes`. Optional: `groups`, `layout`, `view`, `diagnostics` |
| root | only `port` and `component` nodes (a logic node there is the error `system-logic`) |
| `source` | required `root`, `files`, `top`; optional `lib`, `libFiles`, `contractCheck`, `spec`. `root` is where `files` are rooted, relative to this JSON file; `lib` is where `libFiles` are rooted, relative to `root`; `spec` is the document the design was asked for (a PDF), relative to `root` |
| `spec` (on a node or a net) | `{ quote, page?, file? }` — the sentence of the brief this element exists for, **verbatim**, the page it is on, and the document when it is not `source.spec`. Only where the brief really says something about that element; never invented |
| node `kind` | `port` · `reg` · `op` · `mux` · `control` · `module` · `blackbox` · `component` |
| logic node (not `port`/`component`) | required `flow` (`data`/`control`), `time` (`comb`/`seq`), `module`, `ports` (`{ pin: "in"/"out"/"inout" }`). Optional `params`, `consts`, `label`, `group`, `origin` |
| `component` node | required `name` (identifier), `module`, `ref` (a `*.rtlgraph-schematic.json` path relative to this file), `ports` — exactly the ports of that schematic, same directions. Optional `params`, `consts`, `label`, `origin`. No `flow`/`time` |
| `reg` extras | `rstKind` (`sync`/`async`), `rstPriority` (`rst>en`/`en>rst`), `rstValue`; `rstActive`/`enActive` (`high`/`low`, from the code: `if (!nRST)` is `"low"` — an active-low pin is drawn with a bubble); `fsm` (the `*.rtlgraph-fsm.json` this register's state is described in) |
| `control` extras | `truthTable` { `inputs`, `outputs`, `rows`: [{ `in`, `out`, `note?` }], `default?`: { `out` }, `origin` } with values `"0"`/`"1"`/`"x"`; or `equations`: [{ `output`, `expr` }]. `note` is one short line saying what the row means ("reset: clear the counter"); keep a `default` row even when the listed cases already cover every input |
| `blackbox` extras | `rdelay` |
| port node | required `dir`, `flow` (`data`/`control`/`clock`/`reset`); no `time` |
| signal | required `width`, `flow`, `driver`, `sinks`; optional `aliases`, `hidden`, `origin`, `spec`. `meaning` is **required on every `control` and `reset` net** — what it does when it is asserted — and worth writing on a data net whose name does not say it |
| `groups` | `{ "<id>": { "label": "...", "members": [nodeIds] } }` from `// @sch: group=` |
| `layout`, `view` | **owned by the user and the extension — never write them**, keep them as they are |
| `diagnostics` | `{ severity: error/warn/info, code, msg, file?, line?, node?, signal? }`. Leave the key out when there is nothing to report |

### Ids and names

| Thing | Format | Example |
|---|---|---|
| Instance node | instance path from the component top | `CNT_FF`, `data_path.u_inc` |
| Component node | instance path; in the root, the main component's name | `u_dev`, `acc` |
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
- [ ] Where a brief was given: `source.spec` set, and every element it asks for carries the sentence verbatim in `spec`
- [ ] Every control and reset net has a `meaning`; every register says `rstKind`, `rstValue`, and `rstActive`/`enActive` when a pin acts on a low
- [ ] Every node and net has an exact `origin`; control nodes have `truthTable.origin`
- [ ] Contract violations and inferred elements listed in `diagnostics`; `contractCheck` set
- [ ] A component with a state machine has `<name>.rtlgraph-fsm.json`, and its state register carries `fsm` and `flow: "control"`
- [ ] Existing `layout`, `view`, `created` preserved; `modified` updated
- [ ] Every file's `source.root` points at the code it describes (no `source-root` / `source-lib`)
- [ ] `node .agent/rtlgraph-validate.mjs <top>.rtlgraph.json` reports `0 errors`

---

## About this document

It is copied into a workspace by `RTLGraph: Copy Agent Spec to Workspace` and describes RTLGraph,
a VS Code extension released under the MIT licence. The extension ships Mozilla's pdf.js viewer
(Apache-2.0) for reading a brief; the project's `docs/THIRD-PARTY.md` records that. Nothing here
constrains what you may do with the RTL you are reading — it is the user's.
