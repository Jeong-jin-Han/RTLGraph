export interface Endpoint {
  node: string
  port: string | null // null for a port node ("@ACC")
}

export function parseEndpoint(ref: string): Endpoint {
  const i = ref.lastIndexOf(':')
  return i < 0 ? { node: ref, port: null } : { node: ref.slice(0, i), port: ref.slice(i + 1) }
}

export function formatEndpoint(e: Endpoint): string {
  return e.port === null ? e.node : `${e.node}:${e.port}`
}
