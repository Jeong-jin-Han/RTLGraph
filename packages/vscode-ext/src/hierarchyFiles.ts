import { componentRefs } from '@rtlgraph/ir'

// Gathers the text of every component schematic an opened file reaches, so the
// webview (which cannot read files) gets the whole hierarchy in one message.
// Kept free of `vscode` so it can be tested under node.

export const MAX_HIERARCHY_FILES = 256

export interface CollectedFiles {
  files: Record<string, string> // path relative to the opened file's directory -> text
  requested: string[] // every child path looked up, readable or not (watched for changes)
}

const refsOf = (path: string, text: string) => {
  try {
    return componentRefs(path, JSON.parse(text))
  } catch {
    return []
  }
}

export async function collectHierarchyFiles(
  rootName: string,
  rootText: string,
  read: (path: string) => Promise<string | undefined>,
): Promise<CollectedFiles> {
  const files: Record<string, string> = { [rootName]: rootText }
  const requested: string[] = []
  const queue = refsOf(rootName, rootText)
  while (queue.length > 0 && requested.length < MAX_HIERARCHY_FILES) {
    const path = queue.shift()!
    if (Object.hasOwn(files, path) || requested.includes(path)) continue
    requested.push(path)
    const text = await read(path)
    if (text === undefined) continue // loadHierarchy reports it as missing
    files[path] = text
    queue.push(...refsOf(path, text))
  }
  return { files, requested }
}
