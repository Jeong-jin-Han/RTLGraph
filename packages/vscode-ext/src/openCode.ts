import * as vscode from 'vscode'
import { columnRightOf } from './tabs.ts'

// Where the code goes when you jump to it from a drawing: beside the schematic,
// never on top of it. The schematic stays where it is and the file lands in the
// group to its right — a new one the first time, the same one after that, so
// jumping again does not keep splitting the window.

const showsDocument = (tab: vscode.Tab, uri: vscode.Uri): boolean => {
  const input = tab.input
  const of = (input as { uri?: vscode.Uri }).uri
  return of instanceof vscode.Uri && of.toString() === uri.toString()
}

// The group the schematic is in, whichever kind of editor is showing it.
function groupOf(document: vscode.TextDocument | undefined): number | undefined {
  if (!document) return vscode.window.tabGroups.activeTabGroup.viewColumn
  const holding = vscode.window.tabGroups.all.find(group => group.tabs.some(tab => showsDocument(tab, document.uri)))
  return (holding ?? vscode.window.tabGroups.activeTabGroup).viewColumn
}

export async function openCodeBeside(
  uri: vscode.Uri,
  line: number,
  schematic: vscode.TextDocument | undefined,
): Promise<vscode.TextEditor> {
  const columns = vscode.window.tabGroups.all.map(group => group.viewColumn)
  const column = columnRightOf(columns, groupOf(schematic))
  const at = Math.max(0, line - 1)
  return vscode.window.showTextDocument(uri, {
    viewColumn: column ?? vscode.ViewColumn.Beside,
    selection: new vscode.Range(at, 0, at, 0),
    preview: false,
  })
}
