import type { ComponentGraph, ComponentNode, Diagnostic } from './types.ts'
import { validateComponentGraph } from './validate.ts'

// Loads a root or schematic file together with every component schematic it
// reaches, recursively, and checks that each component box agrees with the
// file it points at. Pure — files come through `read` — so the extension host
// and the webview share it.

export const MAX_HIERARCHY_DEPTH = 16

export interface HierarchyEntry {
  path: string // '/'-separated, relative to the opened file's directory
  instance: string // '' for the opened file, else component node ids joined by '/', e.g. "u_host/u_dma"
  graph: ComponentGraph
  children: Record<string, HierarchyEntry> // keyed by component node id
}

export interface Hierarchy {
  root?: HierarchyEntry // undefined when the opened file itself is unusable
  diagnostics: Diagnostic[]
}

// Resolves `ref` against the directory of `fromFile` without node:path.
export function resolveRef(fromFile: string, ref: string): string {
  const parts = fromFile.split(/[\\/]+/).slice(0, -1)
  for (const part of ref.split(/[\\/]+/)) {
    if (part === '' || part === '.') continue
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

// Paths of the component schematics a (possibly invalid) graph refers to.
export function componentRefs(fromFile: string, graph: unknown): string[] {
  const nodes = (graph as { nodes?: Record<string, { kind?: unknown; ref?: unknown }> } | undefined)?.nodes
  if (!nodes || typeof nodes !== 'object') return []
  return Object.values(nodes)
    .filter(n => n && n.kind === 'component' && typeof n.ref === 'string')
    .map(n => resolveRef(fromFile, n.ref as string))
}

export function loadHierarchy(rootPath: string, read: (path: string) => string | undefined): Hierarchy {
  const diagnostics: Diagnostic[] = []

  const visit = (path: string, instance: string, stack: string[]): HierarchyEntry | undefined => {
    const where = instance ? { node: instance } : {}
    const prefix = instance ? `${path}: ` : ''
    const text = read(path)
    if (text === undefined) {
      diagnostics.push({ severity: 'error', code: 'hierarchy-missing', msg: `${path} not found`, ...where })
      return undefined
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      diagnostics.push({ severity: 'error', code: 'json', msg: `${prefix}${(err as Error).message}`, ...where })
      return undefined
    }
    const result = validateComponentGraph(parsed)
    for (const d of result.diagnostics) {
      diagnostics.push(instance ? { ...d, msg: `${prefix}${d.msg}`, node: d.node ? `${instance}/${d.node}` : instance } : d)
    }
    if (!result.ok) return undefined

    const graph = parsed as ComponentGraph
    if (instance && graph.kind !== 'component') {
      diagnostics.push({ severity: 'error', code: 'hierarchy-kind', msg: `${path} must be a component schematic, not "${graph.kind}"`, ...where })
      return undefined
    }

    const entry: HierarchyEntry = { path, instance, graph, children: {} }
    for (const [id, node] of Object.entries(graph.nodes)) {
      if (node.kind !== 'component') continue
      const childInstance = instance ? `${instance}/${id}` : id
      const childPath = resolveRef(path, node.ref)
      if (stack.includes(childPath)) {
        diagnostics.push({ severity: 'error', code: 'hierarchy-cycle', msg: `${childPath} includes itself: ${[...stack, childPath].join(' -> ')}`, node: childInstance })
        continue
      }
      if (stack.length > MAX_HIERARCHY_DEPTH) {
        diagnostics.push({ severity: 'error', code: 'hierarchy-depth', msg: `components nest deeper than ${MAX_HIERARCHY_DEPTH} levels`, node: childInstance })
        continue
      }
      const child = visit(childPath, childInstance, [...stack, childPath])
      if (!child) continue
      checkBoxAgainstFile(node, child.graph, childPath, childInstance)
      entry.children[id] = child
    }
    return entry
  }

  const checkBoxAgainstFile = (node: ComponentNode, child: ComponentGraph, path: string, instance: string) => {
    const at = { node: instance }
    if (child.source.top !== node.module) {
      diagnostics.push({ severity: 'warn', code: 'hierarchy-module', msg: `box says module ${node.module}, ${path} describes ${child.source.top}`, ...at })
    }
    const inside = new Map(
      Object.entries(child.nodes)
        .filter(([id, n]) => n.kind === 'port' && id.startsWith('@'))
        .map(([id, n]) => [id.slice(1), (n as { dir: string }).dir]),
    )
    for (const [port, dir] of Object.entries(node.ports)) {
      const want = inside.get(port)
      if (want === undefined) diagnostics.push({ severity: 'error', code: 'hierarchy-ports', msg: `${path} has no port ${port}`, ...at })
      else if (want !== dir) diagnostics.push({ severity: 'error', code: 'hierarchy-ports', msg: `port ${port} is ${want} in ${path} but ${dir} on the box`, ...at })
    }
    for (const port of inside.keys()) {
      if (!Object.hasOwn(node.ports, port)) diagnostics.push({ severity: 'error', code: 'hierarchy-ports', msg: `the box lacks port ${port} of ${path}`, ...at })
    }
  }

  return { root: visit(rootPath, '', [rootPath]), diagnostics }
}

// Every entry of a hierarchy, parents before children.
export function hierarchyEntries(root: HierarchyEntry | undefined): HierarchyEntry[] {
  if (!root) return []
  return [root, ...Object.values(root.children).flatMap(hierarchyEntries)]
}

// Where the code behind a drawn element is, as a path relative to the folder of
// the root file. The id carries the instance path ("sys/u_dev/u_inbuf/BUF_FF"),
// which says which schematic describes it; that schematic says where its sources
// are, and the element itself says the line.
export function originOf(
  root: HierarchyEntry | undefined,
  of: { node?: string; signal?: string },
): { path: string; line: number } | undefined {
  const id = of.node ?? of.signal
  if (!root || id === undefined) return undefined
  const parts = id.split('/')
  const own = parts.pop()!
  const entry = hierarchyEntries(root).find(e => e.instance === parts.join('/'))
  if (!entry) return undefined
  const origin = of.node !== undefined ? entry.graph.nodes[own]?.origin : entry.graph.signals[own]?.origin
  if (!origin) return undefined
  const folder = entry.path.split('/').slice(0, -1)
  const path: string[] = []
  for (const part of [...folder, ...entry.graph.source.root.split('/'), ...origin.file.split('/')]) {
    if (part === '' || part === '.') continue
    // A ".." with nothing to climb stays: the sources may sit beside the folder
    // the RTLGraph files were put in, not under it.
    if (part === '..' && path.length > 0 && path[path.length - 1] !== '..') path.pop()
    else path.push(part)
  }
  return { path: path.join('/'), line: origin.line }
}
