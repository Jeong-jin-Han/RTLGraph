# RTLGraph

A VS Code extension (in progress) that turns an RTL project folder into an
editable, high-level schematic — the sibling of
[NodeGraph](https://github.com/Jeong-jin-Han/NodeGraph), with Verilog instead of
papers as input.

```
RTL folder ──[agent / rtl-parse]──→ *.rtlgraph.json ──[extension]──→ schematic
```

## Layout

| Path | What |
|---|---|
| `packages/rtl-ir` | IR types, validator, layout merge, view filter — no VS Code, no dependencies |
| `packages/rtl-registry` | Symbols for the `base/` primitives, width and port checks |
| `packages/rtl-layout` | Row-based placement and orthogonal wire routing |
| `packages/rtl-render` | IR → SVG, shared by the editor and HTML export |
| `demo/acc` | D01-2 accumulator: golden IR and SVGs next to its Verilog |
| `demo/base` | Shared primitives (`DFF INC ADD SUB MUX2 CMP_EQ`) |
| `docs/DECISIONS.md` | Schema, layout and filter decisions |

Only `packages/vscode-ext` (not written yet) will import `vscode`.

## Develop

Node ≥ 22.18 runs the TypeScript sources and tests directly.

```bash
npm install
npm run check    # tsc typecheck + node --test
npm run golden   # regenerate demo/acc/*.svg after an intended visual change

# render any graph; presets: all | datapath | controlpath | comb | seq
node packages/rtl-render/src/cli.ts demo/acc/acc_top.rtlgraph.json datapath > datapath.svg
```

## Status

| Milestone | Scope | State |
|---|---|---|
| M0 | `rtl-ir` + hand-written golden IR + registry | done |
| M1 | `rtl-layout` + `rtl-render` (IR → SVG, no VS Code) | done — `datapath` preset matches slide p.31 |
| M2 | Custom Editor + 2-axis filter | next |
