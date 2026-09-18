// Marking RTLGraph's files in the Explorer.
//
// A tab's icon belongs to the editor that owns it, so the drawing carries its own
// mark wherever it is opened (see specView.tabIcon). The Explorer's does not: it
// comes from whichever file icon theme the reader installed, and a theme that
// resolves by file *extension* — Material Icon Theme, the most common one — sees
// `.json` and draws braces. The language RTLGraph contributes is only consulted
// by themes that have nothing to say about the file, such as the default Seti.
//
// Material can be told otherwise, one line per pattern, and this writes those
// lines. It is a command rather than something done at startup: the Explorer is
// the reader's, and an extension that quietly rewrites their settings is worse
// than braces.

export const RTLGRAPH_FILES = ['*.rtlgraph.json', '*.rtlgraph-schematic.json', '*.rtlgraph-fsm.json']

// Material's own icon for hardware description files. The mark cannot be ours —
// an association names one of the theme's icons, not a file of ours.
export const MATERIAL_ICON = 'verilog'

// What the setting should become, or undefined when it already says it. Pure, so
// the merge is checked without a window: it must add without disturbing whatever
// else the reader has associated.
export function withRtlgraphFiles(
  existing: Record<string, string> | undefined,
  icon = MATERIAL_ICON,
): Record<string, string> | undefined {
  const already = RTLGRAPH_FILES.every(pattern => existing?.[pattern] === icon)
  return already ? undefined : { ...existing, ...Object.fromEntries(RTLGRAPH_FILES.map(p => [p, icon])) }
}
