<p align="center">
  <img src="resources/banner-hires.png" width="100%" alt="RTLGraph — Draw the RTL. Don't just read it." />
</p>

**Turn an existing RTL project into the schematic you would have drawn on a whiteboard.**

Point an AI agent at a Verilog folder and it reads the code and writes the graph
itself — one file per component, every box and every net carrying the line of code
it came from. Or write the JSON by hand and use the same canvas.

- **Component hierarchy** — one root plus a schematic per component; fold a frame to a box, or open three levels at once
- **Two-level filter** — Comb opens Data / Control, Seq opens Registers / FSM, plus presets
- **Code jump** — right-click any box or net to open the exact `file:line`, beside the drawing
- **Requirement jump** — right-click to open the brief the design was asked for, in pdf.js's own viewer, with the quoted sentence highlighted
- **Hand editing that survives** — move, resize, bend, cut, draw; all of it lives under `layout` and re-extraction leaves it alone
- **State machines** — `*.rtlgraph-fsm.json` draws Moore or Mealy with its transition table
- **Export** — SVG / PNG / PDF of what is on screen, and XLSX of the tables behind it
- **Agent-friendly** — `RTLGraph: Copy Agent Spec to Workspace` writes the spec, a validator, the
  primitive library and five ready-to-paste prompts into your project

## Getting started

1. Run **`RTLGraph: Copy Agent Spec to Workspace`** on your project folder
2. Read `.prompt/README.md` — it says which of the five prompts fits what you have
3. Paste that prompt's path into your agent, with your project's path
4. Open the finished `<top>.rtlgraph.json`

Full documentation, demos and the file format:
**https://github.com/Jeong-jin-Han/RTLGraph**

MIT. The requirement reader is Mozilla's pdf.js viewer (Apache-2.0); see
`docs/THIRD-PARTY.md` in the repository.
