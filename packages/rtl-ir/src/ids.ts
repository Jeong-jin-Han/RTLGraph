// Node ids are name-based so they survive code edits: an instance path relative
// to the component top ("data_path.u_inc", "CNT_FF"), or "@NAME" for a port of
// the component. "@" cannot start a Verilog identifier, so the two never collide.

const IDENT = '[A-Za-z_][A-Za-z0-9_$]*'
const PATH_RE = new RegExp(`^${IDENT}(\\.${IDENT})*$`)
const PORT_NODE_RE = new RegExp(`^@${IDENT}$`)

export const isInstancePath = (id: string): boolean => PATH_RE.test(id)
export const isPortNodeId = (id: string): boolean => PORT_NODE_RE.test(id)
export const portNodeId = (portName: string): string => `@${portName}`
