// The webview document. Kept free of `vscode` imports so a plain browser can
// load it for testing.

export interface WebviewHtmlOptions {
  scriptUri: string
  cspSource: string
  nonce: string
  /** KaTeX's stylesheet, when this view renders formulas. */
  mathUri?: string
}

const STYLE = `
html, body { height: 100%; margin: 0; padding: 0; }
/* The host's own stylesheet reaches into a webview — its dark-theme styling of
   inline code landed as black boxes on this white panel — so the tags we use
   are given their ground back explicitly. */
code, kbd, samp, pre { background: none; color: inherit; }
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
#toolbar .marking { margin-right: 8px; padding: 1px 6px; border-radius: 10px; background: #fee2e2; color: #991b1b; font: 600 11px system-ui, sans-serif; }
#wave-rail { width: 260px; overflow: auto; border-right: 1px solid #e5e7eb; background: #fbfdff; padding: 6px; }
#wave-rail .wave-place { padding: 6px 8px; border: 1px solid transparent; border-radius: 6px; cursor: pointer; }
#wave-rail .wave-place:hover { background: #eef2ff; }
#wave-rail .wave-place.active { background: #eff6ff; border-color: #bfdbfe; }
#wave-rail .wave-place.init .what { color: #b45309; }
#wave-rail .what { font-weight: 600; color: #111827; }
#wave-rail .when { font-family: ui-monospace, monospace; color: #6b7280; }
#wave-rail .note { color: #6b7280; }
/* 목적 · 방식 · 결과 — the order a reader asks in. */
#wave-rail .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
#wave-rail .tag { font: 10px system-ui, sans-serif; padding: 0 5px; border-radius: 8px; background: #f3f4f6; color: #6b7280; }
#wave-rail .tag.written { background: #ede9fe; color: #5b21b6; font-weight: 600; }
#wave-rail .tag.unwritten { border: 1px dashed #d1d5db; background: none; color: #9ca3af; }
#wave-rail .part { margin-top: 5px; }
#wave-rail .part-name { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: #9ca3af; }
#wave-rail .step { font-family: ui-monospace, monospace; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#wave-rail .moments { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 3px; }
#wave-rail .moment { display: inline-flex; align-items: center; gap: 5px; font: 11px ui-monospace, monospace; padding: 1px 6px 1px 2px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff; color: #b45309; cursor: pointer; }
/* The number the plot draws in its badge, so the two can be read together. */
#wave-rail .moment .badge { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 4px; background: #fef3c7; color: #92400e; font-weight: 600; }
#wave-rail .moment.hot .badge { background: #f59e0b; color: #ffffff; }
#wave-rail .moment:hover, #wave-rail .moment.hot { border-color: #f59e0b; background: #fffbeb; }
#wave-rail .source { margin-top: 4px; font: 11px ui-monospace, monospace; padding: 1px 6px; border: 1px solid #dbeafe; border-radius: 4px; background: #eff6ff; color: #1d4ed8; cursor: pointer; }
#wave-rail .source:hover { border-color: #93c5fd; }
/* What an agent wrote about a place, and the citations in it. */
#wave-rail .why { margin-top: 5px; font: 11px system-ui, sans-serif; padding: 1px 6px; border: 1px solid #e5e7eb; border-radius: 4px; background: #ffffff; color: #6b7280; cursor: pointer; }
#wave-rail .why:hover { border-color: #93c5fd; color: #1d4ed8; }
#wave-rail .ask { margin-top: 5px; font: 11px system-ui, sans-serif; padding: 1px 6px; border: 1px dashed #d1d5db; border-radius: 4px; background: none; color: #9ca3af; cursor: pointer; }
#wave-rail .ask:hover { border-color: #f59e0b; border-style: solid; color: #b45309; background: #fffbeb; }
#wave-rail .wave-note { margin-top: 8px; padding: 6px 8px; border-top: 1px solid #e5e7eb; }
#wave-rail .note-open { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: #111827; cursor: pointer; }
#wave-rail .note-open:hover { color: #5b21b6; }
/* The written explanation, beside the traces rather than on top of the list of
   them: the argument is read against the signals it is about. */
#wave-why { width: 380px; flex: none; overflow: auto; border-left: 1px solid #e5e7eb; background: #ffffff; padding: 8px 10px; }
/* Drag to decide how much room the argument gets. */
#wave-why-grip { flex: none; width: 5px; cursor: col-resize; background: #eef2f7; border-right: 1px solid #e5e7eb; }
#wave-why-grip:hover { background: #ddd6fe; }
#wave-why .why-when { font-family: ui-monospace, monospace; color: #6b7280; margin-bottom: 6px; }
#wave-why .part { margin-top: 8px; }
#wave-why .part-name { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: #6d28d9; font-weight: 600; margin-bottom: 2px; }
#wave-why .part-name.written { margin-top: 10px; border-top: 1px solid #ede9fe; padding-top: 8px; }
#wave-why .step { font-family: ui-monospace, monospace; color: #0f172a; white-space: pre-wrap; word-break: break-word; }
#wave-why .note { color: #1f2937; }
#wave-why .moments { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 8px; }
#wave-why .moment { display: inline-flex; align-items: center; gap: 5px; font: 11px ui-monospace, monospace; padding: 1px 6px 1px 2px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff; color: #b45309; cursor: pointer; }
#wave-why .moment .badge { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 4px; background: #fef3c7; color: #92400e; font-weight: 600; }
#wave-why .moment.hot .badge { background: #f59e0b; color: #ffffff; }
#wave-why .moment:hover, #wave-why .moment.hot { border-color: #f59e0b; background: #fffbeb; }
#wave-why .source { margin-top: 8px; font: 11px ui-monospace, monospace; padding: 1px 6px; border: 1px solid #dbeafe; border-radius: 4px; background: #eff6ff; color: #1d4ed8; cursor: pointer; }
#wave-why .ask { margin-top: 10px; font: 11px system-ui, sans-serif; padding: 2px 8px; border: 1px dashed #d1d5db; border-radius: 4px; background: none; color: #9ca3af; cursor: pointer; }
#wave-why .ask:hover { border-color: #f59e0b; border-style: solid; color: #b45309; background: #fffbeb; }
#wave-why .why-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
#wave-why .why-title { flex: 1; font-weight: 700; color: #111827; }
#wave-why .why-close { border: 0; background: none; font-size: 15px; line-height: 1; color: #6b7280; cursor: pointer; }
#wave-why .why-close:hover { color: #111827; }
#wave-why .prose { color: #111827; line-height: 1.6; }
#wave-why .prose p { margin: 0 0 8px; }
#wave-why .prose p:last-child { margin-bottom: 0; }
/* A citation is the way back into the code, so it reads as a control: dark
   enough against the page to be seen, and not the blue everything else uses. */
/* A citation is a link in a sentence: coloured and underlined, not a button
   with walls. Five of them in one clause were five boxes to read around. */
#wave-why .cite, #wave-rail .cite { display: inline; white-space: nowrap; font: 11px ui-monospace, monospace; padding: 0; border: 0; background: none; color: #6d28d9; text-decoration: underline dotted #c4b5fd; text-underline-offset: 2px; cursor: pointer; }
#wave-why .cite:hover, #wave-rail .cite:hover { color: #4c1d95; text-decoration-style: solid; }
/* The handout, not the code: a different place to land, so a different colour. */
#wave-why .cite.brief { color: #b45309; text-decoration-color: #fcd34d; font-family: system-ui, sans-serif; }
#wave-why .cite.brief:hover { color: #92400e; }
/* 목적 · 방식 · 결과 — the three fields every section is written in. */
/* Text, not columns: as a flex row every span and every citation became its own
   column, and a sentence came out one word wide. */
#wave-why .prose .field { margin: 0 0 8px; }
#wave-why .prose .field-name { display: inline-block; margin-right: 6px; font: 600 10px system-ui, sans-serif; letter-spacing: 0.03em; text-transform: uppercase; color: #6d28d9; }
#wave-why .prose .field-more { margin: 0 0 6px; }
/* The writer's own aside: there, but not in the way of the verdict. */
#wave-why .aside { margin: 6px 0; border-top: 1px solid #ede9fe; padding-top: 5px; }
#wave-why .aside > summary { cursor: pointer; font: 600 11px system-ui, sans-serif; color: #5b21b6; }
#wave-why .md-list { margin: 0 0 8px; padding-left: 18px; }
#wave-why .md-list li { margin: 2px 0; }
/* A name from the code is a word in the sentence, not a control. Boxed and
   tinted, forty of them in a paragraph turned the text into a wall of chips
   with no hierarchy left: everything emphasised is nothing emphasised. The
   monospace face alone says it comes from the code. */
#wave-why code { font-family: ui-monospace, monospace; font-size: 11.5px; color: #0f172a; background: none; border: 0; padding: 0; }
#wave-why strong { font-weight: 700; color: #111827; }
#wave-why .math.block { margin: 8px 0; overflow-x: auto; }
#wave-why .md-table { border-collapse: collapse; width: 100%; margin: 0 0 8px; }
#wave-why .md-table th, #wave-why .md-table td { border: 1px solid #e5e7eb; padding: 3px 6px; text-align: left; vertical-align: top; }
#wave-why .md-table th { background: #f9fafb; font-weight: 600; color: #111827; }
#wave-canvas { flex: 1; display: flex; min-width: 0; overflow: auto; }
#wave-labels { width: 190px; flex: none; border-right: 1px solid #e5e7eb; background: #ffffff; }
/* A signal belongs to a module, and the eye should not have to work that out:
   the rows are indented under their heading and share a tinted spine. */
#wave-labels .wave-label { height: 26px; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 8px 0 16px; border-bottom: 1px solid #f3f4f6; border-left: 3px solid #ede9fe; font-family: ui-monospace, monospace; color: #374151; overflow: hidden; }
#wave-labels .wave-label:hover { background: #faf5ff; }
#wave-labels .wave-label.axis { border-left: 0; height: 22px; font-family: system-ui, sans-serif; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
/* Which module the rows under it belong to — read off the line of RTL that
   drives each signal, so a name never has to be traced by hand. */
#wave-labels .wave-label.group { padding-left: 8px; border-left: 3px solid #a78bfa; font: 600 10px system-ui, sans-serif; letter-spacing: 0.04em; text-transform: uppercase; color: #4c1d95; background: #f5f3ff; border-bottom: 1px solid #ddd6fe; }
#wave-labels .wave-label.bench .name { color: #1e3a8a; }
#wave-labels .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A name that knows its line of RTL is a way in, so it looks like one. */
/* A name is read far more often than it is clicked, so it is dark first and
   underlined only under the hand: the dotted line on every row at once was
   noise, and the pale blue made the whole column hard to read. */
#wave-labels button.name { font: inherit; padding: 0; border: 0; background: none; color: #1f2937; cursor: pointer; text-align: left; text-decoration: none; }
#wave-labels button.name:hover { color: #4c1d95; text-decoration: underline; text-underline-offset: 2px; }
#wave-labels .value { color: #b45309; }
/* Signals that did not move in the chosen stretch: still drawn, but out of the way. */
/* Not part of what this check watches — set back, but still legible: at 0.45
   the name could not be read at all, which is not "out of the way", it is gone. */
#wave-labels .wave-label.aside { opacity: 0.72; }
#wave-labels .wave-label.aside .name { color: #6b7280; }
#wave-labels .wave-label.hot { background: #fffbeb; opacity: 1; }
/* What a signal is, under the hand: where it lives, how wide, and the line of
   RTL that drives it. A native title tooltip takes a second to appear and
   cannot show the code line, and this is what a reader asks most often. */
/* Dragging pans the view; without this the browser treats it as a text
   selection and sweeps up every value and tick label on the way. The rail keeps
   its selection — the writing there is meant to be copied. */
#wave-plot { flex: 1; min-width: 0; cursor: crosshair; user-select: none; -webkit-user-select: none; touch-action: none; }
#wave-plot.panning { cursor: grabbing; }
#wave-labels { user-select: none; -webkit-user-select: none; }
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
#wave-plot .wave-badge { fill: #fef3c7; stroke: #f59e0b; stroke-width: 1; cursor: pointer; }
#wave-plot .wave-badge.hot { fill: #f59e0b; }
#wave-plot .wave-badge-number { fill: #92400e; font: 600 10px system-ui, sans-serif; text-anchor: middle; cursor: pointer; pointer-events: none; }
#wave-plot .wave-badge-number.hot { fill: #ffffff; }
/* The row the hand is over, in the plot and in the labels beside it. */
#wave-plot .wave-row-hot { fill: #fef3c7; opacity: 0.45; }
/* The lane a module heading occupies: nothing is drawn in it, and the tint is
   what keeps the eye's place across to the labels. */
#wave-plot .wave-row-group { fill: #faf5ff; }
#wave-plot .wave-line.hot { stroke: #b45309; stroke-width: 2.2; }
/* ── the specification reader ─────────────────────────────────────────────
   A document first: one column, measured line length, nothing competing with
   the writing. The only thing added to it is the step list under a scenario,
   and that is tinted rather than boxed in so it reads as part of the section
   it belongs to. */
.spec-bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
.spec-bar .name { font: 600 12px ui-monospace, monospace; color: #374151; }
.spec-bar .spacer { flex: 1; }
.spec-bar button.plain { font: inherit; height: 22px; padding: 0 10px; border: 1px solid #d1d5db; border-radius: 4px; background: #ffffff; color: #374151; cursor: pointer; }
.spec-bar button.plain:hover { border-color: #2563eb; color: #1d4ed8; }
.spec-doc { flex: 1; overflow: auto; padding: 14px 20px 60px; max-width: 900px; font: 13px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1f2937; }
.spec-doc h1 { font-size: 20px; margin: 4px 0 10px; color: #111827; }
.spec-doc h2 { font-size: 16px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; color: #111827; }
.spec-doc h3 { font-size: 14px; margin: 18px 0 6px; color: #1f2937; }
.spec-doc h4 { font-size: 13px; margin: 14px 0 4px; color: #374151; }
.spec-doc p { margin: 6px 0; }
.spec-doc hr { border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0; }
.spec-doc code { font-family: ui-monospace, monospace; font-size: 12px; background: #f3f4f6; border-radius: 3px; padding: 0 3px; color: #1f2937; }
.spec-doc pre.code { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 5px; padding: 8px 10px; overflow: auto; font: 12px/1.5 ui-monospace, monospace; }
.spec-doc .md-list { margin: 6px 0; padding-left: 20px; }
.spec-doc .md-list li { margin: 3px 0; }
.spec-doc .md-list li.under { list-style: '– '; color: #4b5563; }
.spec-doc .md-table { border-collapse: collapse; margin: 8px 0; font-size: 12px; }
.spec-doc .md-table th, .spec-doc .md-table td { border: 1px solid #e5e7eb; padding: 3px 7px; text-align: left; vertical-align: top; }
.spec-doc .md-table th { background: #f9fafb; font-weight: 600; color: #111827; }
.spec-doc a.link { color: #1d4ed8; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
/* A line number is a way into the code, so it looks like a key you press. */
.spec-doc button.cite { font: 11px ui-monospace, monospace; padding: 0 4px; border: 1px solid #ddd6fe; border-radius: 3px; background: #f5f3ff; color: #5b21b6; cursor: pointer; }
.spec-doc button.cite:hover { background: #ede9fe; border-color: #a78bfa; }
.spec-doc code.cite.dead { color: #6b7280; }
.spec-doc .walk { margin: 8px 0 14px; border-left: 3px solid #ddd6fe; background: #faf9ff; border-radius: 0 5px 5px 0; }
.spec-doc .walk.live { border-left-color: #7c3aed; background: #f5f3ff; }
.spec-doc .walk-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 5px 8px; }
.spec-doc .walk-bar button { font: inherit; height: 22px; padding: 0 9px; white-space: nowrap; flex: none; border: 1px solid #d1d5db; border-radius: 4px; background: #ffffff; color: #374151; cursor: pointer; }
.spec-doc .walk-bar button.fold { width: 22px; padding: 0; border-color: transparent; background: none; color: #6b7280; }
.spec-doc .walk-bar button.go { border-color: #a78bfa; color: #5b21b6; font-weight: 600; }
.spec-doc .walk-bar button.go:hover { background: #ede9fe; }
.spec-doc .walk-bar button.move { width: 26px; padding: 0; }
.spec-doc .walk-bar button:disabled { opacity: 0.4; cursor: default; }
.spec-doc .walk-bar .count { color: #6b7280; font-size: 11px; white-space: nowrap; }
.spec-doc .walk-bar .now { margin-left: auto; font: 600 11px ui-monospace, monospace; color: #5b21b6; white-space: nowrap; }
.spec-doc .steps { margin: 0; padding: 0 6px 6px 8px; list-style: none; }
.spec-doc .steps .step { display: flex; gap: 8px; align-items: flex-start; padding: 4px 6px; border-radius: 4px; cursor: pointer; }
.spec-doc .steps .step:hover { background: #ede9fe; }
.spec-doc .steps .step.now { background: #ddd6fe; }
.spec-doc .steps .step .n { flex: none; width: 18px; height: 18px; border-radius: 9px; background: #ffffff; border: 1px solid #c4b5fd; color: #5b21b6; font: 600 10px/17px system-ui, sans-serif; text-align: center; }
.spec-doc .steps .step.now .n { background: #7c3aed; border-color: #7c3aed; color: #ffffff; }
.spec-doc .steps .step .body { min-width: 0; }
.spec-doc .steps .step .head { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
.spec-doc .steps .step .cycle { font: 600 11px ui-monospace, monospace; color: #1f2937; }
.spec-doc .steps .step .where { font: 11px ui-monospace, monospace; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spec-doc .steps .step .why { font-size: 13px; color: #1f2937; }
.spec-doc .steps .step .said { font-size: 12px; color: #4b5563; }
/* The code under a sentence is evidence for it, not the thing being said. */
.spec-doc .steps .step .said.under { font-size: 11px; color: #6b7280; margin-top: 1px; }
.spec-doc .steps .step .said.under code { background: none; padding: 0; }
.spec-doc p.nothing { color: #6b7280; font-style: italic; }
[hidden] { display: none !important; }
`

export function webviewHtml({ scriptUri, cspSource, nonce, mathUri }: WebviewHtmlOptions): string {
  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} data: blob:`, // blob: — PNG export draws the SVG through an <img>
    // KaTeX ships its own stylesheet and fonts; both are files under dist/, so
    // they are allowed by source rather than by nonce.
    `font-src ${cspSource}`,
    `style-src 'nonce-${nonce}'${mathUri ? ` ${cspSource}` : ''}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RTLGraph</title>
${mathUri ? `<link rel="stylesheet" href="${mathUri}">` : ''}
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
}
