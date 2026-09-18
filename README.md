# RTLGraph

A VS Code extension (in progress) that turns an **existing RTL project** into an
editable, high-level schematic — the sibling of
[NodeGraph](https://github.com/Jeong-jin-Han/NodeGraph), with Verilog instead of
papers as input.

```
RTL folder ──[AI agent + .agent/RTLGRAPH_SPEC.md]──→ *.rtlgraph.json + *.rtlgraph-schematic.json ──[extension]──→ schematic
```

## Try it

1. Build once:
   ```bash
   npm install
   npm run check        # typecheck + tests; also builds the extension bundles
   ```
2. Open this repository in VS Code and press **F5** (**Run RTLGraph**). An *Extension Development
   Host* window opens on `demo/`.
3. In that window open `acc/acc_top.rtlgraph.json`: the root appears with its one main component
   `acc` unfolded as a frame around its schematic. The filter is two buttons deep — **Comb** switches
   the combinational half on and opens **Data / Control**, **Seq** switches the registers on and opens
   **Registers / FSM** — or pick a preset. Drag to pan, scroll to zoom.
4. **Edit** arranges the picture by hand and writes it under `layout` in the file, nothing else:
   drag a box or a component frame to move it, a frame corner to resize it, a straight run of a wire
   sideways, right-click a wire to turn its corner the other way round, and Delete to cut a link.
   Every pin carries a dot — drag from one onto another pin, or anywhere over the box you want, and
   the link is drawn to the nearest pin that can take it; while you drag, only those pins stay lit.
   Drawing is also how a cut link comes back. A link the RTL has no net for is drawn amber and dashed, and the panel on the right
   lists it (with everything else the sketch owes the code) the way a proof assistant lists its goals.
5. Components: click a box or frame to select it, then **Fold** / **Unfold** asks whether to act on it
   only or on everything inside it too; with nothing selected (`Esc`) they act on the whole hierarchy.
   Double-click a box to toggle just that one. **Right-click any box** to ask where to go: into a
   component's own schematic, or straight to the line of Verilog it came from (a net's right-click
   menu opens its line too), or — where the file says which sentence of the brief a box exists for —
   **the requirement itself**: `demo/pwm` cites `spec/pwm_brief.pdf`, and the workbook export lists
   every requirement beside what carries it. Code opens *beside* the drawing — a group is made to its right the
   first time and reused after that, so the schematic stays on the left while you read, and the
   drawing refits itself whenever the room it has changes — a tab opening beside it, or closing again.
6. `Ctrl+Shift+P` → type `RTLGraph`:

   | Command | What it does |
   |---|---|
   | `RTLGraph: Copy Agent Spec to Workspace` | Writes the agent files into a folder (also on folder right-click in the Explorer) |
   | `RTLGraph: Copy Prompt Path` | Pick a branch of work; its `.prompt/…md` path goes to the clipboard, ready to paste into an agent |
   | `RTLGraph: Export Schematic (SVG / PNG / PDF)` | Exports the current view (also the **Export…** toolbar button) |
   | `RTLGraph: Fold Components` / `Unfold Components` | The selected component (only it, or with everything inside), else all |
   | `RTLGraph: Open Component Schematic` | Opens the selected component's own schematic file |
   | `RTLGraph: Open the Code of the Selected Box` | Jumps to the `origin` line the box came from, in the editor group right of the schematic |
   | `RTLGraph: Set View Preset` | All · Datapath · Control path · Combinational only · Registers only · State registers only |
   | `RTLGraph: Fit View` | Fit the schematic to the window |

### Export

**Export…** writes what is on screen — the current filter and fold state, cropped to what is visible —
next to the graph file:

```
acc/acc_top.rtlgraph.json
acc/.out-acc_top/acc_top.datapath.svg   vector; Inkscape, Illustrator, web pages
acc/.out-acc_top/acc_top.datapath.png   2× image; slides, chat
acc/.out-acc_top/acc_top.datapath.pdf   vector; papers, reports
acc/.out-acc_top/acc_top.control.xlsx   the tables behind it; Excel, LibreOffice
```

**XLSX** is the drawing read back as the tables it was made from — including, where a brief is
cited, one tab of requirements against what carries each — the way D02 builds a machine in a
spreadsheet before any Verilog. A schematic or a root gives one tab of control signals per level
(what drives each, what reads it, what it means) and one tab per control block's truth table; a
`*.rtlgraph-fsm.json` gives the machine, its states and every transition. Written without a
dependency, like the PDF.

A figure holds the schematic and nothing else: the fold markers stay in the editor, and a root that
only wraps one main component is left out — the export draws that component, laid out as in its
frame, without the frame or the doubled port pills.

The file name carries the view (`all`, `datapath`, `controlpath`, `comb`, `registers`, `fsm`, or the
groups spelled out, e.g. `comb-control.seq-off`).
The folder is the `rtlgraph.export.folder` setting, default `.out-${name}` — hidden, like NodeGraph's
`.<name>-imgs`; set it to `out-${name}` for a visible folder. PDF text uses the built-in Helvetica font, so non-Latin labels
(e.g. Hangul) show as `?` there — you are warned, and SVG/PNG show them correctly.

Without VS Code: `node packages/rtl-render/src/cli.ts <graph> datapath --unfold --format pdf -o out.pdf`
(add `--keep-root` to draw the wrapper root as the editor does).

### Files

One root per project and one schematic per component, each next to the code it describes:

```
<project>/
├── <top>.rtlgraph.json                       root: the top's ports and component boxes, no logic
└── <main>/                                   the main component — a folder even when it is the only one
    ├── comb/  seq/  tb/
    ├── <main>.rtlgraph-schematic.json        its schematic; a component inside it is a box that refers to…
    └── <child>/<child>.rtlgraph-schematic.json   …its own schematic, and so on
```

A component with a state machine also gets `<name>.rtlgraph-fsm.json` beside its schematic: it opens
as a state diagram with the meaning of each state and the transition table next to it, and the **FSM**
and **Schematic** buttons walk between the two. `demo/pwm` is the worked example — three levels of
components and three machines.

Every file opens in the editor. The fold state is remembered per file by VS Code, never written to
the JSON.

### Your own RTL

1. In the Extension Development Host, **File → Open Folder…** your RTL project.
2. Right-click the project folder → **RTLGraph: Copy Agent Spec to Workspace** (or run it from
   `Ctrl+Shift+P`). It writes:
   ```
   .agent/RTLGRAPH_SPEC.md          how to turn RTL into *.rtlgraph.json (and how to write RTL)
   .agent/ENVIRONMENT.md            which simulators / tools this machine has
   .agent/rtlgraph-validate.mjs     validator the agent runs on what it wrote
   .prompt/rtlgraph/korean.md       existing RTL → RTLGraph   (english.md too)
   .prompt/assignment/korean.md     the same, for a skeleton that may not be touched at all
   .prompt/rtl/korean.md            spec → RTL in the three-layer layout, then RTLGraph (english.md too)
   .prompt/refactor/korean.md       existing RTL → restructured RTL, then RTLGraph
   .prompt/spec/korean.md           an idea → SPEC.md
   ```

   **Which one.** `rtlgraph` and `assignment` both draw code you keep as it is; they differ in where
   the files go. `rtlgraph` builds the contract layout (a folder per component) — use it on your own
   projects. `assignment` touches nothing: by default each JSON goes beside the module it describes
   (`demo/hw`), or set `RTLGRAPH_FOLDER` in the prompt and they are all kept in one folder of their
   own (`demo/lab`, where the code stays in `src/`). `refactor` is the one that restructures the
   code, and it is a separate task on purpose. `RTLGraph: Copy Prompt Path` hands you the path of
   whichever branch you want.
3. Open `.prompt/rtlgraph/korean.md`, fill in the project path, and paste it into your agent (Claude
   Code, Codex, Cursor…). The agent reads the code without changing it, writes the root and one
   schematic per component, and validates them.
4. Open the root. It redraws by itself whenever the agent rewrites any of the files.

Code does not have to follow the three-layer contract: `assign` and `always` logic is inferred into
the same symbols, and every inference or contract violation is listed under the schematic.

## Layout

| Path | What |
|---|---|
| `packages/rtl-ir` | IR types, validator, source cross-check, layout merge, view filter — no VS Code, no dependencies |
| `packages/rtl-registry` | Symbols for the `base/` primitives, width and port checks |
| `packages/rtl-layout` | Row-based placement and orthogonal wire routing |
| `packages/rtl-render` | IR → SVG, shared by the editor and HTML export |
| `packages/rtl-sheet` | IR → XLSX: control signals, truth tables, a machine's transitions |
| `packages/vscode-ext` | The extension: custom editor, commands, agent spec and prompts (`assets/`) |
| `demo/acc` | D01-2 accumulator: root, main component `acc/` with its schematic, golden SVGs |
| `demo/base` | Shared primitives (`DFF INC ADD SUB MUX2 CMP_EQ`) |
| `demo/pwm` | D02-2 PWM controller: three levels of components and three state machines |
| `demo/hw` | An assignment skeleton: one flat folder, RTLGraph files beside the code |
| `demo/lab` | The same idea, files kept together: code in `src/`, every JSON in `rtlgraph/` |
| `packages/rtl-sheet` (tests) | The workbook: control signals, truth tables, machines, requirements |
| `docs/DECISIONS.md` | Schema, layout, filter, editor and agent decisions |

Only `packages/vscode-ext` imports `vscode`.

## Develop

Node ≥ 22.18 runs the TypeScript sources and tests directly.

```bash
npm run check    # tsc typecheck + node --test
npm run golden   # regenerate the golden SVGs under demo/acc after an intended visual change

# end-to-end in a real VS Code with a throwaway profile, off screen
VSCODE_EXECUTABLE=/usr/share/code/code xvfb-run -a npm run e2e

# render or validate any graph without VS Code
node packages/rtl-render/src/cli.ts demo/acc/acc_top.rtlgraph.json datapath --unfold > datapath.svg
node packages/vscode-ext/dist/agent/rtlgraph-validate.mjs demo/acc/acc_top.rtlgraph.json
```

## Status

| Milestone | Scope | State |
|---|---|---|
| M0 | `rtl-ir` + hand-written golden IR + registry | done |
| M1 | `rtl-layout` + `rtl-render` (IR → SVG, no VS Code) | done — `datapath` preset matches slide p.31 |
| M2 | Custom editor + the two-level filter | done — verified in a real VS Code |
| M5 | Agent spec, validator, prompts (existing RTL → RTLGraph first) | done — pulled ahead of M3/M4 |
| M6.5 | Component hierarchy: root + schematic files, frames, fold / unfold | done — pulled ahead |
| — | FSM files (`*.rtlgraph-fsm.json`): diagram + table, Moore / Mealy | done — `demo/pwm` |
| — | Code jump (node or net → `file:line`) | done — right-click a box |
| M3 | Manual placement + `layout` merge on re-extraction | planned |
