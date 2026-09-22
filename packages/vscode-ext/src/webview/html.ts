// The webview document. Kept free of `vscode` imports so a plain browser can
// load it for testing.

export interface WebviewHtmlOptions {
  scriptUri: string
  cspSource: string
  nonce: string
}

const STYLE = `
html, body { height: 100%; margin: 0; padding: 0; }
body { display: flex; flex-direction: column; background: #ffffff; color: #111827; font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
#toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
#toolbar .label { color: #6b7280; margin-left: 8px; }
#toolbar .label:first-child { margin-left: 0; }
#toolbar button, #toolbar select { font: inherit; height: 24px; padding: 0 10px; border: 1px solid #d1d5db; border-radius: 4px; background: #ffffff; color: #374151; cursor: pointer; }
#toolbar button[aria-pressed="true"] { background: #2563eb; border-color: #1d4ed8; color: #ffffff; }
#toolbar .spacer { flex: 1; }
#toolbar .group { display: inline-flex; align-items: center; gap: 6px; }
#toolbar .selection { font-family: ui-monospace, monospace; color: #374151; }
/* A filter group: the parent switches its half on, the kinds under it are smaller
   and sit inside the same frame so the nesting is visible before you click. */
#toolbar .filter { gap: 3px; padding: 2px 4px; border: 1px solid #e5e7eb; border-radius: 6px; background: #ffffff; }
#toolbar .filter .parent { font-weight: 600; }
#toolbar .filter .child { height: 20px; padding: 0 8px; border-style: dashed; }
#toolbar .filter .child[aria-pressed="true"] { border-style: solid; }
#toolbar button:disabled { opacity: 0.5; cursor: default; }
#stage g.component { cursor: pointer; }
#stage g.component .fold { cursor: pointer; pointer-events: all; }
#stage g.component:hover rect.fold { stroke: #2563eb; }
#stage g.selected > rect:first-child { stroke: #f59e0b; stroke-width: 3px; vector-effect: non-scaling-stroke; }
/* The marks that say what is selected keep their size on screen: their widths
   are in screen pixels (vector-effect), and the grips are drawn divided by the
   zoom. Zoomed right in they used to swell into blobs over the wire. */
#stage .branch { fill: none; stroke: #f59e0b; stroke-width: 5; stroke-opacity: 0.45; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
body.editing #stage g.node { cursor: move; }
body.editing #stage g.node.foreign { cursor: not-allowed; }
body.editing #stage .resize { cursor: nwse-resize; pointer-events: all; }
body.editing #stage g.wire { cursor: pointer; }
#middle { flex: 1; display: flex; min-height: 0; }
#goals { width: 320px; overflow: auto; border-left: 1px solid #e5e7eb; background: #fbfdff; padding: 8px 10px; }
#goals h2 { font-size: 12px; margin: 0 0 6px; color: #374151; }
#goals p { color: #6b7280; margin: 4px 0; }
#goals ol { margin: 0; padding-left: 18px; }
#goals li { margin: 6px 0; cursor: pointer; }
#goals li.active .what { color: #1d4ed8; }
#goals li .what { font-weight: 600; }
/* which connection is missing, from one endpoint to the other */
#goals li .link { font-family: ui-monospace, monospace; color: #b45309; margin: 1px 0; }
#goals li .why { display: block; color: #6b7280; font-weight: 400; }
#goals .hints { margin: 6px 0 0; padding-left: 18px; color: #6b7280; }
#goals .hints li { margin: 3px 0; cursor: default; }
#goals .candidates { margin: 2px 0 0; font-family: ui-monospace, monospace; color: #374151; }
/* A state machine: the diagram on the left, what it means on the right. The
   table is the same thing the design was built from, so it is read next to the
   picture rather than exported on its own. */
#table { width: 360px; overflow: auto; border-left: 1px solid #e5e7eb; background: #fbfdff; padding: 8px 10px; }
#table h2 { font-size: 13px; margin: 0 0 2px; color: #111827; }
#table p.muted { color: #6b7280; margin: 0 0 8px; }
#table dl { margin: 0 0 10px; }
#table dt { font-weight: 600; color: #374151; }
#table dd { margin: 0 0 4px; color: #6b7280; }
#table table { border-collapse: collapse; width: 100%; }
#table th, #table td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
#table th { color: #6b7280; font-weight: 600; }
#table td.mono { font-family: ui-monospace, monospace; }
#table tbody tr { cursor: pointer; }
#table tbody tr:hover { background: #eef2ff; }
#table tbody tr.selected { background: #fee2e2; }
#stage g.fsm-edge { cursor: pointer; }
#stage g.fsm-edge:hover text { fill: #1d4ed8; }
/* Dragging a box or a wire must not sweep up the labels as if they were text. */
#canvas { flex: 1; position: relative; overflow: hidden; background: #ffffff; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
#canvas.panning { cursor: grabbing; }
/* Where to go from what was right-clicked. */
#menu { position: absolute; z-index: 2; min-width: 180px; padding: 4px; border: 1px solid #d1d5db; border-radius: 6px; background: #ffffff; box-shadow: 0 6px 20px rgba(15, 23, 42, 0.18); display: flex; flex-direction: column; }
#menu button { font: inherit; text-align: left; padding: 5px 10px; border: 0; border-radius: 4px; background: none; color: #111827; cursor: pointer; }
#menu button:hover { background: #eef2ff; }
/* What just happened, or what stopped it: one line, gone in a few seconds. */
#notice { position: absolute; left: 10px; bottom: 10px; max-width: 70%; padding: 5px 10px; border: 1px solid #fcd34d; border-radius: 4px; background: #fffbeb; color: #92400e; pointer-events: none; }
#stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
#stage svg { display: block; }
/* The overlay covers the whole drawing, so it must let every click through to
   the schematic under it; only the grips themselves take one. */
#stage svg.handles { position: absolute; left: 0; top: 0; background: none; pointer-events: none; }
#stage .handle { fill: #ffffff; stroke: #f59e0b; stroke-width: 1.5; vector-effect: non-scaling-stroke; pointer-events: all; }
#stage .handle.segment.vertical { cursor: ew-resize; }
#stage .handle.segment.horizontal { cursor: ns-resize; }
#stage .handle.vertex { cursor: pointer; }
#stage .handle.vertex.active { fill: #f59e0b; }
/* Every pin is a place to start a link from; the line follows the hand until it
   lands on another pin. */
#stage .pin { fill: #ffffff; stroke: #94a3b8; stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: all; cursor: crosshair; }
#stage .pin:hover { fill: #d97706; stroke: #b45309; }
/* While a link is being drawn: what can take it, what cannot, and what it would
   land on if the hand let go now. */
#stage .pin.off { fill: #f1f5f9; stroke: #cbd5e1; opacity: 0.5; pointer-events: none; }
#stage .pin.target { fill: #d97706; stroke: #b45309; stroke-width: 2; }
#stage .drawing { fill: none; stroke: #d97706; stroke-width: 2; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; pointer-events: none; }
#stage .drawing.landing { stroke-dasharray: none; }
#stage g.wire.sketch { cursor: pointer; }
#problems { max-height: 30%; overflow: auto; border-top: 1px solid #fcd34d; background: #fffbeb; padding: 4px 10px; font-family: ui-monospace, monospace; white-space: pre-wrap; }
#problems summary { cursor: pointer; font-family: system-ui, sans-serif; font-weight: 600; }
#problems .error { color: #b91c1c; }
/* The waveform view: places to go on the left, traces on the right. */
#wave-rail { width: 260px; overflow: auto; border-right: 1px solid #e5e7eb; background: #fbfdff; padding: 6px; }
#wave-rail .wave-place { padding: 6px 8px; border: 1px solid transparent; border-radius: 6px; cursor: pointer; }
#wave-rail .wave-place:hover { background: #eef2ff; }
#wave-rail .wave-place.active { background: #eff6ff; border-color: #bfdbfe; }
#wave-rail .wave-place.init .what { color: #b45309; }
#wave-rail .what { font-weight: 600; color: #111827; }
#wave-rail .when { font-family: ui-monospace, monospace; color: #6b7280; }
#wave-rail .note { color: #6b7280; }
#wave-rail .moments { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 3px; }
#wave-rail .moment { display: inline-flex; align-items: center; gap: 5px; font: 11px ui-monospace, monospace; padding: 1px 6px 1px 2px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff; color: #b45309; cursor: pointer; }
/* The number the plot draws in its badge, so the two can be read together. */
#wave-rail .moment .badge { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 4px; background: #fef3c7; color: #92400e; font-weight: 600; }
#wave-rail .moment.hot .badge { background: #f59e0b; color: #ffffff; }
#wave-rail .moment:hover, #wave-rail .moment.hot { border-color: #f59e0b; background: #fffbeb; }
#wave-rail .source { margin-top: 4px; font: 11px ui-monospace, monospace; padding: 1px 6px; border: 1px solid #dbeafe; border-radius: 4px; background: #eff6ff; color: #1d4ed8; cursor: pointer; }
#wave-rail .source:hover { border-color: #93c5fd; }
#wave-canvas { flex: 1; display: flex; min-width: 0; overflow: auto; }
#wave-labels { width: 190px; flex: none; border-right: 1px solid #e5e7eb; background: #ffffff; }
#wave-labels .wave-label { height: 26px; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 8px; border-bottom: 1px solid #f3f4f6; font-family: ui-monospace, monospace; color: #374151; overflow: hidden; }
#wave-labels .wave-label.axis { height: 22px; font-family: system-ui, sans-serif; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
#wave-labels .wave-label.bench .name { color: #1d4ed8; }
#wave-labels .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A name that knows its line of RTL is a way in, so it looks like one. */
#wave-labels button.name { font: inherit; padding: 0; border: 0; background: none; color: #1d4ed8; cursor: pointer; text-align: left; text-decoration: underline dotted #93c5fd; text-underline-offset: 2px; }
#wave-labels button.name:hover { color: #1e40af; text-decoration-style: solid; }
#wave-labels .value { color: #b45309; }
/* Signals that did not move in the chosen stretch: still drawn, but out of the way. */
#wave-labels .wave-label.aside { opacity: 0.45; }
#wave-labels .wave-label.hot { background: #fffbeb; opacity: 1; }
#wave-plot { flex: 1; min-width: 0; cursor: crosshair; }
#wave-plot .wave-line { stroke: #2563eb; stroke-width: 1.5; fill: none; }
#wave-plot .wave-bus { stroke: #2563eb; stroke-width: 1.2; fill: #eff6ff; }
#wave-plot .wave-unknown { fill: #fee2e2; stroke: #f87171; stroke-width: 1; }
#wave-plot .wave-value { fill: #1f2937; font: 10px ui-monospace, monospace; text-anchor: middle; }
#wave-plot .wave-row { stroke: #f3f4f6; stroke-width: 1; }
#wave-plot .wave-grid { stroke: #eef2f7; stroke-width: 1; }
#wave-plot .wave-tick { fill: #6b7280; font: 10px system-ui, sans-serif; }
#wave-plot .wave-cursor { stroke: #f59e0b; stroke-width: 1; }
#wave-plot .wave-window { fill: #eff6ff; opacity: 0.6; }
#wave-plot .wave-moment { stroke: #f59e0b; stroke-width: 1; stroke-dasharray: 3 3; opacity: 0.55; }
#wave-plot .wave-moment.hot { stroke-width: 2; stroke-dasharray: none; opacity: 1; }
#wave-plot .wave-moment-box.hot { fill: #fffbeb; stroke: #f59e0b; stroke-width: 1; }
#wave-plot .wave-badge { fill: #fef3c7; stroke: #f59e0b; stroke-width: 1; cursor: pointer; }
#wave-plot .wave-badge.hot { fill: #f59e0b; }
#wave-plot .wave-badge-number { fill: #92400e; font: 600 10px system-ui, sans-serif; text-anchor: middle; cursor: pointer; pointer-events: none; }
#wave-plot .wave-badge-number.hot { fill: #ffffff; }
#wave-plot .wave-moment-label { fill: #b45309; font: 10px system-ui, sans-serif; }
#wave-plot .wave-moment-label.hot { fill: #92400e; font-weight: 600; }
/* The row the hand is over, in the plot and in the labels beside it. */
#wave-plot .wave-row-hot { fill: #fef3c7; opacity: 0.45; }
#wave-plot .wave-line.hot { stroke: #b45309; stroke-width: 2.2; }
[hidden] { display: none !important; }
`

export function webviewHtml({ scriptUri, cspSource, nonce }: WebviewHtmlOptions): string {
  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} data: blob:`, // blob: — PNG export draws the SVG through an <img>

    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RTLGraph</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
}
