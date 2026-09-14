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
| `packages/rtl-ir` | IR types, validator, layout merge — no VS Code, no dependencies |
| `packages/rtl-registry` | Symbols for the `base/` primitives, width and port checks |
| `demo/acc` | D01-2 accumulator: golden `acc_top.rtlgraph.json` next to its Verilog |
| `demo/base` | Shared primitives (`DFF INC ADD SUB MUX2 CMP_EQ`) |
| `docs/DECISIONS.md` | Schema decisions taken while building M0 |

Only `packages/vscode-ext` (not written yet) will import `vscode`.

## Develop

Node ≥ 22.18 runs the TypeScript sources and tests directly.

```bash
npm install
npm run check   # tsc typecheck + node --test
```

## Status

| Milestone | Scope | State |
|---|---|---|
| M0 | `rtl-ir` + hand-written golden IR + registry | done |
| M1 | `rtl-layout` + `rtl-render` (IR → SVG, no VS Code) | next |
| M2 | Custom Editor + 2-axis filter | |
