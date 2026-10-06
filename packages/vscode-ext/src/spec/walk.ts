// Walking a scenario through the code.
//
// A specification's path table says, cycle by cycle, which lines ran. Reading
// it means looking those lines up by hand, one after another, losing the place
// each time. This walks them: the current step is open on the right, the step
// before it underneath, and a bracket down the gutter says how far to read.
//
// Two editors, never more. Each step replaces what is in its pane rather than
// opening beside it — a walk of ten steps must not leave ten tabs behind.

import * as vscode from 'vscode'
import { prefixesIn, walksIn, type Step, type Walk } from './steps.ts'

/** A `## 5.`-style path table is what makes a markdown file walkable. */
export function looksLikeSpec(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'markdown' && walksIn(doc.getText()).length > 0
}

/**
 * The prefix table lives in the format file, beside the one being read, so a
 * `rx:74` in any module file resolves the same way.
 */
async function prefixesFor(doc: vscode.TextDocument): Promise<Map<string, string>> {
  const here = vscode.Uri.joinPath(doc.uri, '..')
  for (const name of ['00-format.md', '0-format.md', 'format.md']) {
    try {
      const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(here, name)))
      const found = prefixesIn(text)
      if (found.size > 0) return found
    } catch {
      // not that one; try the next
    }
  }
  return prefixesIn(doc.getText()) // a single-file spec may carry its own table
}

/** Where the step's file is: beside the spec, or up and out of `spec/`. */
export async function sourceOf(spec: vscode.Uri, file: string): Promise<vscode.Uri | undefined> {
  const candidates = [
    vscode.Uri.joinPath(spec, '..', file),              // beside the document
    vscode.Uri.joinPath(spec, '..', '..', file),        // <folder>/spec/ → <folder>/
    vscode.Uri.joinPath(spec, '..', '..', '..', file),  // me/spec/ → the project
  ]
  for (const candidate of candidates) {
    try {
      await vscode.workspace.fs.stat(candidate)
      return candidate
    } catch {
      // keep looking
    }
  }
  const found = await vscode.workspace.findFiles(`**/${file}`, '**/node_modules/**', 2)
  return found.length === 1 ? found[0] : undefined
}

// The bracket down the left: one decoration for the whole stretch, so a step
// that reads lines 115–116 looks like one thing and not two highlights.
const READING = vscode.window.createTextEditorDecorationType({
  isWholeLine: true,
  borderWidth: '0 0 0 3px',
  borderStyle: 'solid',
  borderColor: new vscode.ThemeColor('editorCursor.foreground'),
  backgroundColor: new vscode.ThemeColor('editor.selectionHighlightBackground'),
  overviewRulerColor: new vscode.ThemeColor('editorCursor.foreground'),
  overviewRulerLane: vscode.OverviewRulerLane.Left,
})
const BEFORE = vscode.window.createTextEditorDecorationType({
  isWholeLine: true,
  borderWidth: '0 0 0 3px',
  borderStyle: 'solid',
  borderColor: new vscode.ThemeColor('editorLineNumber.foreground'),
  opacity: '0.75',
})

export class WalkSession {
  private static current: WalkSession | undefined

  static async start(spec: vscode.TextDocument, id: string): Promise<WalkSession | undefined> {
    const prefixes = await prefixesFor(spec)
    const walk = walksIn(spec.getText(), prefixes).find(w => w.id === id)
    if (!walk) {
      void vscode.window.showWarningMessage(`RTLGraph: ${id} has no path table to walk.`)
      return undefined
    }
    WalkSession.current?.stop()
    const session = new WalkSession(spec.uri, walk)
    WalkSession.current = session
    await session.show(0)
    return session
  }

  static step(by: number): void {
    void WalkSession.current?.move(by)
  }

  static stopCurrent(): void {
    WalkSession.current?.stop()
    WalkSession.current = undefined
  }

  private readonly spec: vscode.Uri
  private readonly walk: Walk
  private readonly status: vscode.StatusBarItem
  private at = 0

  private constructor(spec: vscode.Uri, walk: Walk) {
    this.spec = spec
    this.walk = walk
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
    this.status.command = 'rtlgraph.walkNext'
  }

  private async move(by: number): Promise<void> {
    const next = this.at + by
    if (next < 0 || next >= this.walk.steps.length) return
    await this.show(next)
  }

  /**
   * Current step above, the one before it below.
   *
   * The two groups are made once and then reused: opening with `preview` means
   * the next step lands in the same tab instead of beside it.
   */
  private async show(at: number): Promise<void> {
    this.at = at
    const step = this.walk.steps[at]
    const before = at > 0 ? this.walk.steps[at - 1] : undefined

    await vscode.commands.executeCommand('vscode.setEditorLayout', {
      orientation: 0, // columns
      groups: [{ size: 0.5 }, { groups: [{ size: 0.5 }, { size: 0.5 }], size: 0.5 }],
    })
    await this.open(step, vscode.ViewColumn.Two, READING)
    if (before) await this.open(before, vscode.ViewColumn.Three, BEFORE)

    // Only while a walk is on do ← / → mean "step": a keybinding that always
    // takes those is one the reader did not ask for.
    await vscode.commands.executeCommand('setContext', 'rtlgraph.walking', true)
    this.status.text = `$(debug-step-over) ${this.walk.id}  ${at + 1}/${this.walk.steps.length}  ·  ${step.cycle}`
    this.status.tooltip = `${step.said}\n\n← / → to walk, click for the next step`
    this.status.show()
  }

  private async open(step: Step, column: vscode.ViewColumn, how: vscode.TextEditorDecorationType): Promise<void> {
    const uri = await sourceOf(this.spec, step.file)
    if (!uri) {
      void vscode.window.showWarningMessage(`RTLGraph: could not find ${step.file}.`)
      return
    }
    const doc = await vscode.workspace.openTextDocument(uri)
    const editor = await vscode.window.showTextDocument(doc, { viewColumn: column, preview: true, preserveFocus: true })
    const ranges = step.spans.map(span => new vscode.Range(
      Math.max(span.from - 1, 0), 0, Math.min(span.to - 1, doc.lineCount - 1), 0))
    editor.setDecorations(READING, [])
    editor.setDecorations(BEFORE, [])
    editor.setDecorations(how, ranges)
    if (ranges[0]) editor.revealRange(ranges[0], vscode.TextEditorRevealType.InCenter)
  }

  stop(): void {
    void vscode.commands.executeCommand('setContext', 'rtlgraph.walking', false)
    this.status.dispose()
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(READING, [])
      editor.setDecorations(BEFORE, [])
    }
    if (WalkSession.current === this) WalkSession.current = undefined
  }
}

/** The `▶ workflow` above each scenario that has a table under it. */
export class WalkLens implements vscode.CodeLensProvider {
  async provideCodeLenses(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (doc.languageId !== 'markdown') return []
    const prefixes = await prefixesFor(doc)
    const walks = walksIn(doc.getText(), prefixes)
    if (walks.length === 0) return []
    const lines = doc.getText().split('\n')
    const out: vscode.CodeLens[] = []
    for (const walk of walks) {
      const at = lines.findIndex(line => new RegExp(`^#{2,4}\\s+${walk.id}[.\\s]`).test(line))
      if (at < 0) continue
      out.push(new vscode.CodeLens(new vscode.Range(at, 0, at, 0), {
        title: `▶ workflow — ${walk.steps.length} steps`,
        command: 'rtlgraph.walkWorkflow',
        arguments: [doc.uri, walk.id],
      }))
    }
    return out
  }
}
