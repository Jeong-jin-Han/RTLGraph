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
#stage g.selected > rect:first-child { stroke: #f59e0b; stroke-width: 3px; }
#stage .branch { fill: none; stroke: #f59e0b; stroke-width: 6; stroke-opacity: 0.45; stroke-linecap: round; stroke-linejoin: round; }
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
#goals li.active { font-weight: 600; color: #1d4ed8; }
#goals li .why { display: block; color: #6b7280; font-weight: 400; }
#goals .candidates { margin: 2px 0 0; font-family: ui-monospace, monospace; color: #374151; }
#canvas { flex: 1; position: relative; overflow: hidden; background: #ffffff; cursor: grab; touch-action: none; }
#canvas.panning { cursor: grabbing; }
#stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
#stage svg { display: block; }
#stage svg.handles { position: absolute; left: 0; top: 0; background: none; }
#stage .handle { fill: #ffffff; stroke: #f59e0b; stroke-width: 1.5; }
#stage .handle.segment.vertical { cursor: ew-resize; }
#stage .handle.segment.horizontal { cursor: ns-resize; }
#stage .handle.vertex { cursor: pointer; }
#stage .handle.vertex.active { fill: #f59e0b; }
#problems { max-height: 30%; overflow: auto; border-top: 1px solid #fcd34d; background: #fffbeb; padding: 4px 10px; font-family: ui-monospace, monospace; white-space: pre-wrap; }
#problems summary { cursor: pointer; font-family: system-ui, sans-serif; font-weight: 600; }
#problems .error { color: #b91c1c; }
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
