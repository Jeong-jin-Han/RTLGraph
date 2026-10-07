# RTLGraph — Agent Specification

> **If you are an AI agent creating or editing RTLGraph files (`*.rtlgraph.json`,
> `*.rtlgraph-schematic.json`), or writing RTL for an RTLGraph project, read this whole document
> first.** Also read `.agent/rtlgraph/ENVIRONMENT.md` (which simulators and tools exist on this machine).
> Validate what you write with `node .agent/rtlgraph/validate.mjs <top>.rtlgraph.json`.
>
> Beside this file, the same command wrote `.prompt/` — ready-made prompts, one per kind of job
> under `components/` and one per chain of them under `recipe/`, in whichever language
> `rtlgraph.language` names, with a `README` for the person choosing between them (not for you) — and
> `.base/` (the six primitives RTLGraph draws with symbols — `DFF INC ADD SUB MUX2 CMP_EQ` — with a
> note of their own). `.base/` is there so a project that instantiates them can be simulated and
> elaborated on its own; see "Primitive definitions" below.
>
> **What else is installed matters.** `.agent/rtlgraph/ENVIRONMENT.md` has a "Companion extensions" table.
> When it says **NodeGraph** is there, a second kind of file is worth writing beside this one:
> RTLGraph draws what the circuit *is*, NodeGraph records what is *known* about it — why each part
> exists, what a testbench proves, which lines it exercises — with `"type": "code"` links that jump
> to those lines. Read the spec that table points at before writing one, and write none at all when
> the table says the extension is missing.

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
1. Read `.agent/rtlgraph/ENVIRONMENT.md`.
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
  - **`.base/`** is that folder when the project has no library of its own: `RTLGraph: Copy Agent
    Spec to Workspace` writes the six the registry knows (`DFF INC ADD SUB MUX2 CMP_EQ`) there, so
    a project can be simulated and elaborated on its own. A handed-out skeleton often instantiates
    `DFF` without shipping one — when that happens, point `source.lib` at `.base` and list what the
    design uses in `source.libFiles`, and say in `diagnostics` that the library came from there.
  - **When the code's primitive is not the stock one**, believe the code. The UART assignment
    instantiates `DFF #(.BITWIDTH(4))` where the stock `DFF` takes `BW`, the *top bit index*: write
    `params: { "BITWIDTH": 4 }`, adapt the copy in `.base/` to match the code, and leave a
    `library-adapted` diagnostic. RTLGraph keeps drawing it as a register and keeps checking its
    ports; the width then comes from the nets, and it says so (`registry-params`).
- **A `reg` node's `rstKind`, `rstPriority` and `rstValue`** describe the flip-flop it instantiates, so
  for a registry primitive they come from that primitive's own definition (`.base/DFF.v`: synchronous,
  `RST` beats `EN`, clears to 0). Reading them there is not invention.
- **Code that does not compile** (missing `;`, trailing commas, undeclared names): still extract what
  the code clearly means, and add one `error` diagnostic with `code` `"syntax"`, `file` and `line` per
  problem. If `.agent/rtlgraph/ENVIRONMENT.md` lists a compiler, run it to find them. Put this first in your final
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
declared width of the net it drives (`[5:0]` → `{ "BW": 5 }`) — **except where the result is
narrower than what it works on**: a `CMP_EQ` drives one bit however wide its operands are, so take
its `BW` from the operands (`cnt_q == LIMIT`, both `[3:0]` → `{ "BW": 3 }`). Taken from the output
it would be `{ "BW": 0 }`, and the validator would then report a width error against the operands
it was inferred from.

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
node .agent/rtlgraph/validate.mjs <top>.rtlgraph.json
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
| `registry-params` | a registry primitive is given a parameter the registry does not know (a project's own `DFF #(.BITWIDTH(4))`), so its width is read from the nets instead |
| `source-root`, `source-lib` | **none** of the files are where `source.root` (or `source.lib`) points — usually the JSON sits in a folder of its own and the root was left as `"."`; the message says what it should be |
| `source-missing` | one named file is not there, while the rest are |
| `registry-*`, `width` | a primitive's ports or widths do not match `.base/` |
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

1. **Read `.agent/rtlgraph/ENVIRONMENT.md`** and pick a simulator (`iverilog`, or Vivado `xvlog`/`xelab`/`xsim`).
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
7. **Shared primitives** stay in the shared library (`.base/`). Move a project module there only when a
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

## Workflow W — Waveform → why it passed

Use when a simulation has run and someone wants to know *why* it behaved as it did — most often
after `.agent/rtlgraph/run-tb.sh --wave`, which writes `<project>/waveform/<given|mine>/<bench>.vcd` and
`<bench>.waveform.json` — the measurements, for you and for the viewer. Add `--report` if a person
also wants the same numbers as prose in `<bench>.waveform.md`; nothing reads that file, so it is not
written by default. They sit with the project, like every other RTLGraph file — never inside
`.agent/`, which holds only what the copy command put there.

The division of labour is the whole point of this workflow:

| | Who | What it may say |
|---|---|---|
| **Measurement** | `wave.mjs`, from the dump | clock period, when the reset let go, what was still undefined, when each handshake was taken, which signals moved in the stretch before each check |
| **Explanation** | you, from the code | which lines produce those edges, why the numbers are the numbers they are, what would have to change for them to differ |

Rules that keep the two apart:

1. **Every number you state comes from the `.waveform.json`.** Never round, never re-derive from the
   design's parameters, never write a time the dump does not contain. If a number you expected is
   missing from the measurements, say it is missing.
2. **Every claim about behaviour cites code**, as `file.v:line` or `file.v:line-line`. "The byte is
   held until the host takes it" is not an explanation; "`has_byte` stays set because the clearing
   branch needs `data_out_ready` (`uart_receiver.v:86-87`)" is.
3. **Initialization comes first.** A testbench that only checks outputs will pass while a register
   spends the opening microsecond undefined. Say what the reset actually defines, which signals the
   measurements list as still `x` afterwards, and — from the code — whether that matters.
4. **One section per check.** The `.waveform.json` cuts the run into stretches, one per timestamped line
   the bench printed. For each: what the bench claimed, what the wires did in that stretch, and the
   path through the code that connects them. Name the lines that would have to be wrong for the
   check to fail — that is what makes the analysis worth reading twice.
5. **Disagreements are findings.** If the dump does not match what the code appears to say, write
   that down rather than smoothing it over. The dump is what happened.

6. **Every section has the same three fields**, because this is read under time pressure and a
   document arranged differently in every section is one nobody can find anything in:

   ```
   ## <the line the bench printed>

   목적 / Purpose — what this check is out to prove. One sentence.
   방식 / How — what the bench did: the stimulus and the expected value, one bench citation.
   결과 / Outcome — measured times and values → it passed → the line of the design that made it so.

   ### 더 보기 / More
   The path step by step, tables, side observations. This folds away in the view, so it can run long.
   ```

   One or two sentences per field; anything longer moves under the fold. **Ten unfolded lines per
   check is the ceiling** — a reader who cannot state a check's purpose, method and outcome in
   thirty seconds cannot use the document, however complete it is.

7. **Write it the way "Writing a reader can follow" says**, above. The three that bite hardest here:
   a 결과 that could not be false is not a result (principle 2); a signal is called what the code
   calls it (principle 6); and the shortening pass moves evidence under the fold rather than
   deleting it (principle 8).

Write `<bench>.waveform-analysis.md` beside the report you read, in `waveform/`. Where NodeGraph is installed (see
`.agent/rtlgraph/ENVIRONMENT.md`), the same content can carry `code` links per check.

---

## Workflow R — Code → a specification someone can read fast

Use when the code is the only description there is — a handed-out skeleton, a repository nobody
documented — and the job is to **write down what it does**, in prose, so the next reader does not
have to re-derive it from the source. The output is a folder of Markdown beside the project; not
one line of `.v` changes.

> **What makes this hard is not the writing, it is the stopping.** A specification of real RTL can
> always be one level more detailed, and a reader who has to take all six levels to learn one thing
> stops reading. So the document is **layered**: each section is a complete, true picture of the
> design at its own depth, and a reader who stops after section 1 is left with less, never with
> something wrong.

```
<folder>/
├── README.md     what this folder is, and the one caveat about line numbers
├── spec/
│   ├── 00-format.md              the rules below, as they were settled for this project
│   ├── 01-overview.md            the whole thing on one page; read this first
│   ├── 10-<module>.md            one file per module, in instantiation order
│   └── 90-<across>.md            what no single module closes over
└── sim/          throwaway benches that print cycle numbers, so the document's numbers are measured
```

**One file per module, not one per scenario** — the file someone opens to change the design is the
module's, so that is where its behaviour belongs. Grouping does not cause repetition; saying a
thing twice does, which rule 7 below prevents. The exception is a design where almost nothing
closes inside one module (a pipeline): there, module files stop at section 3 and the paths live in
the across-file. Whichever it is, the format file says why.

**A module file runs from what it does to how it does it, in six sections.** Depths 1–3 are for
everyone, 4–5 for the reader chasing a case, 6 for whoever is changing the code.

| § | Section | What goes in it | Keep it to |
|---|---------|-----------------|-----------|
| 1 | **What it does** | numbered steps, in the reader's words, **no signal names** | 10 lines |
| 2 | **What that needs** | one row per step: *to do this → you need → so this signal exists* | a table, plus the names that mislead |
| 3 | **Ports** | direction, width, one line each | a table |
| 4 | **Scenarios, one line each** | event → outcome → how well it is confirmed | a table |
| 5 | **The path, by cycle** | one table per scenario: cycle · the condition that became true · the assignment that ran · **what happens**, in words | 10 rows each |
| 6 | **Detail** | every signal, every use, the side effects, and the *why* | no limit |

**The shape of a scenario heading is not free.** The extension finds scenarios by it:

```
### RX-N1. 바이트 하나를 받는다      ← 2–4 hashes, then the id, then `.` or a space, then the title
```

The id is **1–4 uppercase letters**, `-`, **`N`** (normal) or **`E`** (exceptional), then digits:
`RX-N1`, `TX-E3`, `L-N1`. Not `Rx-N1`, not `RX_N1`, not `RX-n1`, and nothing before it on the line
(`### Scenario RX-N1` does not parse). A heading with the id and nothing after it parses as a
scenario but is shown nowhere, so always write the title. A path table under a heading that does
not match this is **not a scenario** — it is read as ordinary prose and no walk is offered for it.

Rules that keep the layers honest:

1. **Section 2 is not a list of signals.** It says why each one had to exist, in the order of
   section 1's steps. A signal that no step asks for means section 1 is missing a step.
2. **Paths are in cycle order, not line order.** Everything in an `always` block is evaluated in
   the same cycle, so a path that walks the file top to bottom invents an order the hardware does
   not have. For each cycle, ask what *else* became true in it: that question is what finds the
   shift that still happens in a cancelled frame.
3. **Only section 6 says "why".** If a path table needs to give a *reason*, the reason belongs in
   6. Section 5's last column is the exception and is not a reason: **what happens**, one line per
   cycle in human words ("sees the line fall and starts a frame"). The extension titles each step
   of a walk with it, and without it a walk shows the reader the code they are already looking at.
4. **Every number says where it came from.** `시뮬 / measured` — a bench in `sim/` printed it;
   `계산 / derived` — worked out from the code; `읽기만 / read` — read off the source. Never let a
   derived number be read as a measured one.
5. **Every statement says whose it is.** `[PDF]` the brief asked for it · `[코드]` the code does it
   · `[미정]` the brief is silent and the code chose. The third tag is the valuable one: it is the
   list of decisions nobody signed off.
6. **Line numbers are dated.** Record a hash of each file the numbers refer to, and print the code
   fragment beside every citation — one comment moves them all.
6b. **Section 6's heading carries its number** (`## 6. 세부`, `## 6 — Detail`): two hashes and
   the digit. Each entry in it **starts with the name** it is about — `**\`clock_counter\`**`, a
   `### \`clock_counter\`` subheading, or a table row whose first cell is `` `clock_counter` ``
   (backticked) — because hovering that name in the `.v` shows that entry. A name mentioned only
   mid-sentence gets no hover.
7. **Say a thing once.** Shared machinery goes in the overview; a scenario lives in the file of the
   module whose port the event arrives at; anything crossing modules goes in the across-file and
   refers to the others by scenario number (`TX-N1`, `RX-E7`), never by repeating their paths.

`sim/` holds benches that **print and judge nothing** — `$display` of the cycle a thing happened —
because their job is to make the document's numbers measurements rather than arithmetic. They are
not the project's testbenches and do not belong in `tb/`.

**The sticking points go back in the report, not into a folder of notes**: where the instructions
were ambiguous or contradicted each other, what the writer decided on its own and on what grounds,
anything it got wrong once and fixed, and the numbers it could not measure. That list is what the
next version of these rules is made from.

And write all of it the way "Writing a reader can follow" says — one named reader, claims that
could be false, one name per thing, the shortening pass at the end.

---

### What reads this back

The documents are not only for people, and a writer who knows what reads them gets the format
right the first time.

- **`00-format.md` carries the marker table**, and its rows are what turn `rx:116` into a file.
  One row per file, with the file name **alone in its cell** and the marker **with its colon**:

  | 파일 | sha1 앞 8자 | 표기 |
  |---|---|---|
  | `uart_receiver.v` | `ea15f96e` | `rx:줄` |

  `rx` without the colon registers nothing; a cell reading `uart_receiver.v (수신기)` is not a
  file name. A citation that writes its own file (`uart_receiver.v:116`) needs no table.
- **`▶ workflow`** on each scenario walks its section-5 table through the code: current step top
  right, the one before it underneath, the stretch bracketed down the gutter. One row is one
  cycle — a row citing two files becomes one step per file, so keep one cycle's lines in one row.
  Keep citations **inside the table cells**: one that drifts into prose leaves that step nowhere
  to go.
- **📖** at the top of the document opens the reader, which lists every scenario's steps under its
  heading. **If the 📖 is there but a scenario shows no steps, that scenario's heading or the
  marker table did not parse** — check them against the shapes above before writing anything else.
- **Hovering a name** in the `.v` shows that name's section 6 entry, which is why an entry starts
  with its name and why the section heading keeps its number.


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

## Testbenches — written to be read back

A bench is not only run, it is read back: `.agent/rtlgraph/run-tb.sh --wave` cuts the dump at every
line the bench prints, and the waveform view shows each stretch as **what the check is for** (the
line you printed), **how it was driven** (the statements that ran before it) and **what happened**
(the measurements). Write so that all three survive: print the claim rather than the case number,
drive through named tasks, print one check the moment it is decided, and prefix every line with
`[%0t]`.

**A testbench is commented like the design, and its constants more so.** Everything above applies
here — the header, the reason per block, a line on every declaration — but a bench has two things a
design does not, and both are read with suspicion:

- **The numbers that make the test cheap.** A bench almost always shrinks something: `CLOCK_FREQ =
  1_000_000` so that a symbol is ten cycles rather than 1085, a timeout of 2 ms, four bytes rather
  than 256. Say so at the declaration — *what was shrunk, to what, and why that is still a fair
  test*. An unexplained constant in a bench is the first thing a reader distrusts, and rightly:
  `always #5 clk = ~clk` sets the real period, which is not what `CLOCK_FREQ` says.
- **What each task drives, and on which edge.** One line per task: what it does to the wires, and
  that inputs move on the falling edge so nothing changes on the edge the design samples.

And the top of the file says **what this bench is out to catch** — one sentence per case, in the
order the cases run, naming the spec sentence where there is one. That header is what somebody
reads when a check fails at 2am; the rest of the bench is how it does it.

Why it behaved that way belongs to Workflow W, run later against the code — not here.

---

## Writing a reader can follow

Three of the things you produce here are prose, not data: **the comments in the RTL**, **the
waveform analysis**, and **the specification Workflow R writes**. All three fail the same way,
and it is not a style problem.

> **The reason writing about your own design is hard has a name: you cannot un-know it.**
> Once you know why `serial_in_d` resets to 1, a comment saying "reset to idle" reads as complete.
> To the reader it says nothing — they do not yet have the thing that makes it make sense.
> The bar is not "is this accurate". Accurate and unusable is the normal failure.

The eight principles below (plus 6b, which is about how much to mark up) are **constructive**: it is cheap to check whether a piece of writing
satisfies one, and when it does not, the principle says what to change. That is why "be clear" and
"omit needless words" are not on the list — you cannot check them.

| # | Principle | What it means here | Check |
|---|-----------|--------------------|-------|
| 1 | **One reader, named** | Fix one concrete reader with the **minimum** expertise you expect — "knows Verilog and the UART idea, has never read this file" — and write to them. For an analysis, say who it is in the first line of the file; for RTL, the module header is written to them. | Does anything here use a term or a fact that reader does not have, without giving it? |
| 2 | **A claim that could be wrong** | "The design works correctly" cannot be wrong, so it carries nothing. "`has_byte` rises on the stop bit's symbol edge and stays up for 40 clocks because only `data_out_ready` clears it" can be wrong, so it informs. Every 결과 field, and every module header's key sentence, is of the second kind. | Could this sentence turn out to be false? If not, rewrite it. |
| 3 | **One landmark** | One sentence, at the top, that the whole file is about — the module's key idea, or what this run establishes. Everything below earns its place against it. | Can you say in one clause how this paragraph serves that sentence? |
| 4 | **One point, stated first** | A comment block, or a field, carries exactly one point, and opens with it. Never build up to it through background. Two points means two blocks. | Does one sentence cover the whole block? Is it the first sentence? |
| 5 | **Old to new** | Start each sentence from something already said and end on what is new. This is what turns a run of true statements into an argument the reader can follow. | Does this sentence begin with a word the previous one used? |
| 6 | **One name per thing** | Signals, modules and instances keep the code's own spelling, everywhere, in any language: `bit_counter` is `bit_counter`, never "the counter" in one place and "비트 카운터" in the next. Two names for one thing is the most common reason a reader stops. | Does anything here appear under two names? |
| 6b | **Mark little** | Spelling a name the way the code does is not the same as marking it up. Backticks on the first mention and where the sentence turns on it; bold on the one phrase that carries the point. A paragraph in which forty words are marked has no emphasis left in it, and reads as a wall rather than a sentence. | Count the marked words in this paragraph. Would a reader know which one matters? |
| 7 | **Just in time, layered** | Put an explanation in the place that needs it, not in the header where the reader cannot use it yet. The layers have different audiences: **module header / three fields = everyone; block comments / the folded part = whoever is actually digging.** | Is everything in this block used *in* this block? Do the headers alone tell the story? |
| 8 | **Cut, then cut again** | When it feels finished, make a shortening pass — a required second pass. Cut run-ups, cut what another block already says, keep one running example rather than three. For an analysis, move rather than delete: evidence belongs under the fold, not in the bin. | Did you run the pass, and can you say what it removed? Is the same fact stated twice? |

(Sources: Benjamin C. Pierce, *The Curse of Knowledge*, PLMW 2017 — the canonical reader, the
landmark, falsifiable contributions, the running example, the shortening pass; Derek Dreyer, *How to
Write Papers and Give Talks That People Can Follow*, PLMW@ICFP 2017 — one point per unit stated
first, old-to-new, name your baby, just in time, audience layering.)

---

## Comments — top down, in the reader's language

Whenever you write RTL (Workflow B, Workflow C, or filling in a handed-out skeleton), the comments
are part of the deliverable. The eight principles above apply to every line of them. Someone opens the file cold and has to understand it before they can
trust it, and that is the order to write for: **the whole before the parts, the reason before the
mechanism**.

**A header on every module**, before the port list, saying in the reader's language:

1. what it is for, in a sentence;
2. the shape of what flows through it — a small ASCII drawing where that helps (a UART frame, a
   handshake, a pipeline's stages);
3. **the one idea that makes it work**, and why the obvious alternative is worse. This is the
   sentence a reader is really looking for: "the line is read at the middle of a symbol, because
   the two clocks are not the same and the middle is where the error has the most room";
4. the state it keeps — one line per register, saying what it remembers, not what type it is.

**Every declaration says what it holds — parameters, localparams and locals included.** This is
the part most often skipped, and it is the part a reader needs first: they meet `SAMPLE_TIME` in an
expression long before they find out what it is. One short line each, saying:

- **a `parameter`** — what it means to the outside, its units, and what happens if it is changed.
  `parameter CLOCK_FREQ = 125_000_000` is not "the clock frequency"; it is "the frequency the
  design is clocked at, in Hz — everything below is derived from it and nothing else reads it".
- **a `localparam`** — **where the number comes from**, worked through once with real numbers, so
  nobody has to redo the arithmetic: `// 비트 하나의 길이와, 그 한가운데. 125MHz / 115200baud 면
  1085 클럭과 542 클럭이다.` A localparam whose value is a formula is the single best place in a
  file to spend a comment.
- **a register** — what it remembers and what its values *mean*, not its type. `4'd0` meaning
  "idle" is the kind of thing that exists only in a comment. Say the encoding once, here, rather
  than at each branch that relies on it.
- **a wire** — what it is true of. `// 비트의 한가운데: 라인을 읽는 유일한 순간` beats anything
  about `clock_counter == SAMPLE_TIME - 1`, which the reader can see.
- **a width** — whenever it is derived (`$clog2(…)`) or easy to get wrong, say what fixes it.

Declarations that only exist to be wired through — a port already described in the header, a
temporary whose name says everything — take nothing. A comment per line is not the goal; a reader
who never has to guess what a name holds is.

**Inside, a comment per block that says why, never what.** `// count up` over `count <= count + 1`
is noise. `// the counter is also the busy flag: 0 means nothing is in flight` is the thing that
was in the author's head and nowhere in the code. Where a branch order matters, say that it
matters and what breaks if it is swapped.

**Names stay as the code spells them**, in any language: `bit_counter` is `bit_counter` in a Korean
comment. Translate the prose, never the identifiers. (Principle 6 — and the failure it prevents is
a reader who cannot tell whether "the counter" is `bit_counter` or `clock_counter`.)

**Then make the shortening pass** (principle 8). A comment that restates its expression, a second
header paragraph saying what the first already said, a third example of the same idea: all of it
goes. What survives is what was in your head and is nowhere in the code.

Comments follow the language the prompt asks for its report in: Korean prompts get Korean comments.
A handed-out skeleton's own comments are never touched, reworded, or translated — write yours
around them.

---

## Line endings — the scripts have to run on the machine they land on

A project here is often checked out on Windows, where Git converts files to CRLF, and then run
under Cygwin or MSYS, where a `.sh` with CRLF dies on the first line with
`$'\r': command not found` — `run-tb.sh`, the one command that says whether the design passes.

**`.gitattributes` is already provided.** `Copy Agent Spec to Workspace` writes one into a project
that has none (`* text=auto`, and `eol=lf` for `*.sh`, `Makefile`, `*.mk`, `*.mjs`) and leaves an
existing one alone. **Do not write your own, and do not edit the one that is there** unless the
user asks — if a project needs a rule for files you added, add that one line rather than replacing
the file.

What this asks of you: anything you write that a shell runs — a script, a `Makefile` — gets **LF
line endings**, and when a tool reports `\r` in an error, suspect the checkout before the script.

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
- [ ] `node .agent/rtlgraph/validate.mjs <top>.rtlgraph.json` reports `0 errors`

---

## About this document

It is copied into a workspace by `RTLGraph: Copy Agent Spec to Workspace` and describes RTLGraph,
a VS Code extension released under the MIT licence. The extension ships Mozilla's pdf.js viewer
(Apache-2.0) for reading a brief; the project's `docs/THIRD-PARTY.md` records that. Nothing here
constrains what you may do with the RTL you are reading — it is the user's.
