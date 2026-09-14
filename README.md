# RTLGraph

A VS Code extension (in progress) that turns an **existing RTL project** into an
editable, high-level schematic — the sibling of
[NodeGraph](https://github.com/Jeong-jin-Han/NodeGraph), with Verilog instead of
papers as input.

```
RTL folder ──[AI agent + .agent/RTLGRAPH_SPEC.md]──→ *.rtlgraph.json ──[extension]──→ schematic
```

## Try it

1. Build once:
   ```bash
   npm install
   npm run check        # typecheck + tests; also builds the extension bundles
   ```
2. Open this repository in VS Code and press **F5** (**Run RTLGraph**). An *Extension Development
   Host* window opens on `demo/`.
3. In that window open `acc/acc_top.rtlgraph.json`: the schematic appears. Toggle **Data / Control**
   and **Comb / Seq**, pick a preset, drag to pan, scroll to zoom.
4. `Ctrl+Shift+P` → type `RTLGraph`:

   | Command | What it does |
   |---|---|
   | `RTLGraph: Copy Agent Spec to Workspace` | Writes the agent files into a folder (also on folder right-click in the Explorer) |
   | `RTLGraph: Export Schematic (SVG / PNG / PDF)` | Exports the current view (also the **Export…** toolbar button) |
   | `RTLGraph: Set View Preset` | All · Datapath · Control path · Combinational only · Sequential only |
   | `RTLGraph: Fit View` | Fit the schematic to the window |

### Export

**Export…** writes what is on screen — the current filter, cropped to what is visible — next to the
graph file:

```
acc/acc_top.rtlgraph.json
acc/.out-acc_top/acc_top.datapath.svg   vector; Inkscape, Illustrator, web pages
acc/.out-acc_top/acc_top.datapath.png   2× image; slides, chat
acc/.out-acc_top/acc_top.datapath.pdf   vector; papers, reports
```

The file name carries the view (`all`, `datapath`, `controlpath`, `comb`, `seq`, or the raw filter).
The folder is the `rtlgraph.export.folder` setting, default `.out-${name}` — hidden, like NodeGraph's
`.<name>-imgs`; set it to `out-${name}` for a visible folder. PDF text uses the built-in Helvetica font, so non-Latin labels
(e.g. Hangul) show as `?` there — you are warned, and SVG/PNG show them correctly.

Without VS Code: `node packages/rtl-render/src/cli.ts <graph> datapath --format pdf -o out.pdf`.

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
   Code, Codex, Cursor…). The agent reads the code without changing it, writes `<top>.rtlgraph.json`
   and validates it.
4. Open that file. It redraws by itself whenever the agent rewrites it.

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
| `demo/acc` | D01-2 accumulator: golden IR and SVGs next to its Verilog |
| `demo/base` | Shared primitives (`DFF INC ADD SUB MUX2 CMP_EQ`) |
| `docs/DECISIONS.md` | Schema, layout, filter, editor and agent decisions |

Only `packages/vscode-ext` imports `vscode`.

## Develop

Node ≥ 22.18 runs the TypeScript sources and tests directly.

```bash
npm run check    # tsc typecheck + node --test
npm run golden   # regenerate demo/acc/*.svg after an intended visual change

# end-to-end in a real VS Code with a throwaway profile, off screen
VSCODE_EXECUTABLE=/usr/share/code/code xvfb-run -a npm run e2e

# render or validate any graph without VS Code
node packages/rtl-render/src/cli.ts demo/acc/acc_top.rtlgraph.json datapath > datapath.svg
node packages/vscode-ext/dist/agent/rtlgraph-validate.mjs demo/acc/acc_top.rtlgraph.json
```

## Status

| Milestone | Scope | State |
|---|---|---|
| M0 | `rtl-ir` + hand-written golden IR + registry | done |
| M1 | `rtl-layout` + `rtl-render` (IR → SVG, no VS Code) | done — `datapath` preset matches slide p.31 |
| M2 | Custom editor + 2-axis filter | done — verified in a real VS Code |
| M5 | Agent spec, validator, prompts (existing RTL → RTLGraph first) | done — pulled ahead of M3/M4 |
| M3 | Manual placement + `layout` merge on re-extraction | next |
