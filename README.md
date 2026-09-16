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
4. Components: click a box or frame to select it, then **Fold** / **Unfold** asks whether to act on it
   only or on everything inside it too; with nothing selected (`Esc`) they act on the whole hierarchy.
   Double-click a box to toggle just that one. **Open** shows its own `*.rtlgraph-schematic.json`.
5. `Ctrl+Shift+P` → type `RTLGraph`:

   | Command | What it does |
   |---|---|
   | `RTLGraph: Copy Agent Spec to Workspace` | Writes the agent files into a folder (also on folder right-click in the Explorer) |
   | `RTLGraph: Export Schematic (SVG / PNG / PDF)` | Exports the current view (also the **Export…** toolbar button) |
   | `RTLGraph: Fold Components` / `Unfold Components` | The selected component (only it, or with everything inside), else all |
   | `RTLGraph: Open Component Schematic` | Opens the selected component's own schematic file |
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
```

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

Every file opens in the editor. The fold state is remembered per file by VS Code, never written to
the JSON. (`<name>.rtlgraph-fsm.json` for state machines comes next.)

### Your own RTL

1. In the Extension Development Host, **File → Open Folder…** your RTL project.
2. Right-click the project folder → **RTLGraph: Copy Agent Spec to Workspace** (or run it from
   `Ctrl+Shift+P`). It writes:
   ```
   .agent/RTLGRAPH_SPEC.md          how to turn RTL into *.rtlgraph.json (and how to write RTL)
   .agent/ENVIRONMENT.md            which simulators / tools this machine has
   .agent/rtlgraph-validate.mjs     validator the agent runs on what it wrote
   .prompt/rtlgraph/korean.md       existing RTL → RTLGraph   (english.md too)
   .prompt/rtl/korean.md            spec → RTL in the three-layer layout, then RTLGraph (english.md too)
   ```
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
| `packages/vscode-ext` | The extension: custom editor, commands, agent spec and prompts (`assets/`) |
| `demo/acc` | D01-2 accumulator: root, main component `acc/` with its schematic, golden SVGs |
| `demo/base` | Shared primitives (`DFF INC ADD SUB MUX2 CMP_EQ`) |
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
| — | FSM files (`*.rtlgraph-fsm.json`): diagram + table, Moore / Mealy | next |
| — | Code jump (node or net → `file:line`) | planned |
| M3 | Manual placement + `layout` merge on re-extraction | planned |
