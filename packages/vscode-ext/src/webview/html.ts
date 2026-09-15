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
#toolbar button:disabled { opacity: 0.5; cursor: default; }
#stage g.component { cursor: pointer; }
#stage g.component .fold { cursor: pointer; pointer-events: all; }
#stage g.component:hover rect.fold { stroke: #2563eb; }
#stage g.selected > rect:first-child { stroke: #f59e0b; stroke-width: 3px; }
#canvas { flex: 1; position: relative; overflow: hidden; background: #ffffff; cursor: grab; touch-action: none; }
#canvas.panning { cursor: grabbing; }
#stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
#stage svg { display: block; }
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
