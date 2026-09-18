// Where a jump to the code should land, as a rule about editor groups rather than
// about VS Code — so it can be tested without one.
//
// The drawing stays where it is and the code goes to its right: a new group the
// first time, the same one after that, so jumping again does not keep splitting
// the window. With three groups open it is the one immediately right of the
// schematic, not the far end.

// `columns` is the groups left to right; `holding` is the one the schematic is in.
// Returns the column to open in, or undefined when a group has to be made.
export function columnRightOf(columns: readonly number[], holding: number | undefined): number | undefined {
  const at = holding === undefined ? -1 : columns.indexOf(holding)
  if (at < 0) return columns.length > 1 ? columns[1] : undefined // nothing to go by: the second group, else a new one
  return columns[at + 1]
}
