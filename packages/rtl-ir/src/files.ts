// RTLGraph file names.
//   sys_top.rtlgraph.json               root: named after the top module
//   host/host.rtlgraph-schematic.json   a component: named after the component, in its folder
//   host/host.rtlgraph-fsm.json         that component's FSM, only when it has one

export const ROOT_SUFFIX = '.rtlgraph.json'
export const SCHEMATIC_SUFFIX = '.rtlgraph-schematic.json'
export const FSM_SUFFIX = '.rtlgraph-fsm.json'

export type GraphFileKind = 'system' | 'schematic' | 'fsm'

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

export function graphFileKind(path: string): GraphFileKind | undefined {
  const name = baseName(path).toLowerCase()
  if (name.endsWith(SCHEMATIC_SUFFIX)) return 'schematic'
  if (name.endsWith(FSM_SUFFIX)) return 'fsm'
  if (name.endsWith(ROOT_SUFFIX)) return 'system'
  return undefined
}

// "host/host.rtlgraph-schematic.json" -> "host"; "sys_top.rtlgraph.json" -> "sys_top"
export function graphName(path: string): string {
  const name = baseName(path)
  for (const suffix of [SCHEMATIC_SUFFIX, FSM_SUFFIX, ROOT_SUFFIX]) {
    if (name.toLowerCase().endsWith(suffix)) return name.slice(0, -suffix.length) || name
  }
  return name.replace(/\.json$/i, '')
}

export const schematicFileName = (component: string) => `${component}${SCHEMATIC_SUFFIX}`
export const fsmFileName = (component: string) => `${component}${FSM_SUFFIX}`
export const rootFileName = (topModule: string) => `${topModule}${ROOT_SUFFIX}`
