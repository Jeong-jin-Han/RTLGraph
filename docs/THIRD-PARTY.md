# Third-party code in RTLGraph

RTLGraph has no runtime dependencies of its own: the SVG, PDF and XLSX writers
are all in this repository. One thing is shipped inside the extension, and one is
used to build it.

## Shipped inside the extension

### pdf.js — Apache License 2.0

The requirement reader is Mozilla's own PDF viewer, mounted whole.

| What | Where | Comes from |
|---|---|---|
| `viewer.html`, `viewer.mjs`, `viewer.css`, `images/`, `locale/{en-US,ko}` | `packages/vscode-ext/assets/pdfjs-viewer/web/` | the [pdf.js 6.3.289 legacy release](https://github.com/mozilla/pdf.js/releases/tag/v6.3.289) |
| `pdf.mjs`, `pdf.worker.mjs`, `standard_fonts/`, `cmaps/`, `wasm/`, `iccs/` | copied into `dist/pdfjs-viewer/` at build time | the `pdfjs-dist` package (same version) |

The licence text is kept beside the files it covers, at
`packages/vscode-ext/assets/pdfjs-viewer/LICENSE`.

**What RTLGraph changes.** The viewer's own files are shipped byte for byte. Two
things are added around them, and both are RTLGraph's:

- `web/bridge.mjs` (built from `packages/vscode-ext/src/webview/pdf.ts`) — blanks
  the sample document the viewer would otherwise open, starts the worker from a
  blob, finds the quoted sentence and hands it to the viewer's find controller.
- `viewer.html` is **served with a modified head** (`packages/vscode-ext/src/specView.ts`):
  a Content-Security-Policy a webview will accept, a `<base>` so the viewer's
  relative assets resolve to webview URIs, a reset of the side padding VS Code
  gives a webview's body, and the two script tags above. The file on disk is not
  modified; the change happens when the page is handed to the webview.

## Used to build, not shipped

| What | Licence | Why |
|---|---|---|
| `esbuild` | MIT | bundles the extension host and the two webview scripts |
| `typescript` | Apache-2.0 | type checking (`tsc --noEmit`); the packages themselves run as TypeScript sources under Node |
| `@vscode/test-electron`, `@types/vscode`, `@types/node` | MIT | the end-to-end run and type definitions |
| `pdfjs-dist` | Apache-2.0 | the library, worker, fonts and character maps copied into `dist/` (see above) |

## RTLGraph's own licence

MIT — [`LICENSE`](../LICENSE) at the root, matching what
`packages/vscode-ext/package.json` declares and the badge in the README.

Apache-2.0 allows that: pdf.js can be shipped inside an MIT-licensed extension as
long as its licence text travels with its files, which it does
(`packages/vscode-ext/assets/pdfjs-viewer/LICENSE`).
