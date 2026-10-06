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
import { langOf, type Lang } from '@rtlgraph/wave'
import { prefixesIn, walksIn, type Step, type Walk } from './steps.ts'

// The few words this shows. Everything else on screen is the document's own.
const WORDS = {
  ko: {
    steps: (n: number) => `${n} 스텝`,
    pick: '어느 시나리오를 걸을까?',
    list: (id: string, title: string) => `${id} — ${title}`,
    stepper: '목록에서 고르면 그 스텝이 열린다 · Esc 로 끝',
    before: '직전',
    tip: '클릭하면 전체 스텝 목록 · alt+→ / alt+← 로도 걷는다',
    none: '이 워크스페이스에는 걸을 수 있는 명세가 없다 (5 절 표가 있는 .md).',
    reader: '명세로 읽기',
  },
  en: {
    steps: (n: number) => `${n} steps`,
    pick: 'Which scenario?',
    list: (id: string, title: string) => `${id} — ${title}`,
    stepper: 'Pick a step to open it · Esc to finish',
    before: 'before',
    tip: 'Click for the whole list of steps · alt+→ / alt+← walk too',
    none: 'No specification here has a path table to walk (a .md with a section 5 table).',
    reader: 'Read as a specification',
  },
} as const

export function words(): typeof WORDS[Lang] {
  const setting = vscode.workspace.getConfiguration('rtlgraph').get<string>('language')
  const tag = setting === 'korean' ? 'ko' : setting === 'english' ? 'en' : vscode.env.language
  return WORDS[langOf(tag)]
}

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

/** Where a walk has got to, for whoever is showing it. */
export interface WalkAt {
  id: string
  index: number
  total: number
  file: string
  cycle: string
}

const watching: ((at: WalkAt | undefined) => void)[] = []

/** Told whenever the walk moves, and told `undefined` when it ends. */
export function onWalkMoved(listen: (at: WalkAt | undefined) => void): vscode.Disposable {
  watching.push(listen)
  return new vscode.Disposable(() => {
    const at = watching.indexOf(listen)
    if (at >= 0) watching.splice(at, 1)
  })
}

export class WalkSession {
  private static current: WalkSession | undefined

  static async start(spec: vscode.TextDocument, id: string, index = 0): Promise<WalkSession | undefined> {
    const prefixes = await prefixesFor(spec)
    const walk = walksIn(spec.getText(), prefixes).find(w => w.id === id)
    if (!walk) {
      void vscode.window.showWarningMessage(`RTLGraph: ${id} has no path table to walk.`)
      return undefined
    }
    WalkSession.current?.stop()
    const session = new WalkSession(spec.uri, walk)
    WalkSession.current = session
    await session.show(Math.min(Math.max(index, 0), walk.steps.length - 1))
    return session
  }

  static step(by: number): void {
    void WalkSession.current?.move(by)
  }

  /** Straight to one step — what clicking a row in the preview does. */
  static goto(index: number): void {
    void WalkSession.current?.show(index)
  }

  /** Which walk is on, if any, and where it has got to. */
  static where(): WalkAt | undefined {
    return WalkSession.current?.at_()
  }

  static stopCurrent(): void {
    WalkSession.current?.stop()
    WalkSession.current = undefined
  }

  /** The step list, for the palette and the status bar's middle button. */
  static steps(): void {
    void WalkSession.current?.stepper()
  }

  private readonly spec: vscode.Uri
  private readonly walk: Walk
  // Three buttons rather than one: a reader who expected to click through the
  // steps should not have to find out that the keyboard was the way.
  private readonly back: vscode.StatusBarItem
  private readonly status: vscode.StatusBarItem
  private readonly forth: vscode.StatusBarItem
  private at = 0

  private constructor(spec: vscode.Uri, walk: Walk) {
    this.spec = spec
    this.walk = walk
    const item = (priority: number, command: string, tooltip: string) => {
      const made = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority)
      made.command = command
      made.tooltip = tooltip
      return made
    }
    this.back = item(102, 'rtlgraph.walkPrevious', 'alt+←')
    this.status = item(101, 'rtlgraph.walkSteps', words().tip)
    this.forth = item(100, 'rtlgraph.walkNext', 'alt+→')
  }

  /**
   * Every step of this scenario, as a list you move through.
   *
   * Moving the selection opens that step, so the list is the walk: click the
   * third row and the panes show the third cycle. It also answers "how many
   * are there" without having to reach the end to find out.
   */
  private async stepper(): Promise<void> {
    const total = this.walk.steps.length
    const pick = vscode.window.createQuickPick<vscode.QuickPickItem & { index: number }>()
    pick.title = `${this.walk.id} — ${this.walk.title}`
    pick.placeholder = words().stepper
    pick.matchOnDescription = true
    pick.items = this.walk.steps.map((step, index) => ({
      index,
      label: `${index + 1}/${total}  ·  ${step.cycle}`,
      description: step.said.replace(/`/g, ''),
      detail: `${step.file}:${step.spans.map(s => (s.from === s.to ? s.from : `${s.from}-${s.to}`)).join(', ')}`,
    }))
    pick.activeItems = [pick.items[this.at]]
    pick.onDidChangeActive(active => {
      if (active[0]) void this.show(active[0].index)
    })
    pick.onDidAccept(() => pick.hide())
    pick.onDidHide(() => pick.dispose())
    pick.show()
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
  async show(at: number): Promise<void> {
    if (at < 0 || at >= this.walk.steps.length) return
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
    const total = this.walk.steps.length
    this.back.text = '$(chevron-left)'
    this.status.text = `$(debug-step-over) ${this.walk.id}  ${at + 1}/${total}  ·  ${step.cycle}`
    this.forth.text = at + 1 < total ? '$(chevron-right)' : '$(check)'
    this.forth.command = at + 1 < total ? 'rtlgraph.walkNext' : 'rtlgraph.walkStop'
    for (const item of [this.back, this.status, this.forth]) item.show()
    for (const listen of [...watching]) listen(this.at_())
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

  private at_(): WalkAt {
    const step = this.walk.steps[this.at]
    return { id: this.walk.id, index: this.at, total: this.walk.steps.length, file: step.file, cycle: step.cycle }
  }

  stop(): void {
    void vscode.commands.executeCommand('setContext', 'rtlgraph.walking', false)
    for (const listen of [...watching]) listen(undefined)
    for (const item of [this.back, this.status, this.forth]) item.dispose()
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(READING, [])
      editor.setDecorations(BEFORE, [])
    }
    if (WalkSession.current === this) WalkSession.current = undefined
  }
}

/**
 * Every scenario in the workspace, with the document it came from.
 *
 * A code lens only exists in a text editor, so a reader working in the
 * **markdown preview** sees none. The palette has to be able to offer the
 * scenarios without a document in focus, which means finding them.
 */
export async function allWalks(): Promise<{ spec: vscode.Uri; walk: Walk }[]> {
  const out: { spec: vscode.Uri; walk: Walk }[] = []
  for (const spec of await vscode.workspace.findFiles('**/*.md', '**/node_modules/**', 200)) {
    let doc: vscode.TextDocument
    try {
      doc = await vscode.workspace.openTextDocument(spec)
    } catch {
      continue
    }
    if (!/\|/.test(doc.getText())) continue // no table, no path
    for (const walk of walksIn(doc.getText(), await prefixesFor(doc))) out.push({ spec, walk })
  }
  return out
}

/**
 * The scenario to walk, asked for in whatever way the reader is working.
 *
 * With the document open as text, only its own scenarios are offered; from a
 * preview or from nowhere in particular, every scenario in the workspace is,
 * each saying which file it is in.
 */
export async function askForWalk(doc?: vscode.TextDocument): Promise<{ spec: vscode.Uri; id: string } | undefined> {
  const here = doc?.languageId === 'markdown' ? walksIn(doc.getText(), await prefixesFor(doc)) : []
  let found = here.length > 0 ? here.map(walk => ({ spec: doc!.uri, walk })) : await allWalks()
  if (here.length === 0) {
    // A preview has no document to ask, but its tab is named after one
    // ("Preview 30-uart_receiver.md"). If that file is among the specs, the
    // reader means its scenarios and not the whole workspace's.
    const named = /([^\s/\\]+\.md)\s*$/.exec(vscode.window.tabGroups.activeTabGroup.activeTab?.label ?? '')?.[1]
    const inThat = named ? found.filter(f => f.spec.path.endsWith(`/${named}`)) : []
    if (inThat.length > 0) found = inThat
  }
  if (found.length === 0) {
    void vscode.window.showWarningMessage(`RTLGraph: ${words().none}`)
    return undefined
  }
  const picked = await vscode.window.showQuickPick(
    found.map(({ spec, walk }) => ({
      label: words().list(walk.id, walk.title),
      description: words().steps(walk.steps.length),
      detail: here.length > 0 ? undefined : vscode.workspace.asRelativePath(spec),
      spec,
      id: walk.id,
    })),
    { placeHolder: words().pick, matchOnDetail: true })
  return picked ? { spec: picked.spec, id: picked.id } : undefined
}

/** The `▶ workflow` above each scenario that has a table under it. */
export class WalkLens implements vscode.CodeLensProvider {
  async provideCodeLenses(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (doc.languageId !== 'markdown') return []
    const prefixes = await prefixesFor(doc)
    const walks = walksIn(doc.getText(), prefixes)
    if (walks.length === 0) return []
    const lines = doc.getText().split('\n')
    // One at the top for the document as a whole: the reader, where the
    // scenarios are laid out with their steps rather than counted.
    const out: vscode.CodeLens[] = [new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
      title: `📖 ${words().reader}`,
      command: 'rtlgraph.readSpec',
      arguments: [doc.uri],
    })]
    for (const walk of walks) {
      const at = lines.findIndex(line => new RegExp(`^#{2,4}\\s+${walk.id}[.\\s]`).test(line))
      if (at < 0) continue
      out.push(new vscode.CodeLens(new vscode.Range(at, 0, at, 0), {
        title: `▶ workflow — ${words().steps(walk.steps.length)}`,
        command: 'rtlgraph.walkWorkflow',
        arguments: [doc.uri, walk.id],
      }))
    }
    return out
  }
}
