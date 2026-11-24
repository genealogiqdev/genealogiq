// Pure validation of the graph document the research agent writes. The file
// comes from a model that read arbitrary web pages, so nothing in it is
// trusted: it is clamped, de-duplicated and stripped of dangling references
// before it is stored or shown. No next/prisma imports — unit-testable.

export const NODE_TYPES = ["surname", "variant", "person", "family", "place", "event"] as const
export type ScanNodeType = (typeof NODE_TYPES)[number]

export const CONFIDENCES = ["documented", "probable", "speculative"] as const
export type ScanConfidence = (typeof CONFIDENCES)[number]

export const RELATIONS = [
  "parent_of",
  "spouse_of",
  "sibling_of",
  "variant_of",
  "originated_in",
  "lived_in",
  "migrated_to",
  "member_of",
  "participated_in",
  "related_to",
] as const
export type ScanRelation = (typeof RELATIONS)[number]

export interface ScanSource {
  id: string
  title: string
  url: string
}

export interface ScanNode {
  id: string
  type: ScanNodeType
  label: string
  summary: string
  confidence: ScanConfidence
  years: string
  sources: string[]
}

export interface ScanEdge {
  from: string
  to: string
  relation: ScanRelation
  label: string
}

export interface ScanGraph {
  version: 1
  surname: string
  summary: string
  nodes: ScanNode[]
  edges: ScanEdge[]
  sources: ScanSource[]
}

export const GRAPH_LIMITS = {
  nodes: 400,
  edges: 1200,
  sources: 400,
  label: 120,
  nodeSummary: 800,
  summary: 6000,
  years: 40,
  sourcesPerNode: 12,
} as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  // Control characters have no place in display text and can hide content.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max)
}

const ID = /^[A-Za-z0-9_-]{1,40}$/
const id = (value: unknown): string | null => (typeof value === "string" && ID.test(value) ? value : null)

/** Only plain web links are kept: no javascript:, data:, file: or credentialed URLs. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Turn the agent's JSON into a graph that is safe to store and render, or null
 * when it is not a graph at all. Rules:
 *  - unknown node types, relations and malformed ids are dropped;
 *  - an edge survives only if both ends exist, and self-loops are dropped;
 *  - a source survives only with an http(s) URL; nodes keep only source ids that survived;
 *  - a node left with no source is downgraded to "speculative": nothing unsourced is shown as established;
 *  - sizes are clamped to GRAPH_LIMITS.
 */
export function parseGraph(raw: unknown): ScanGraph | null {
  if (!isRecord(raw) || !Array.isArray(raw.nodes)) return null

  const sources: ScanSource[] = []
  const sourceIds = new Set<string>()
  for (const entry of Array.isArray(raw.sources) ? raw.sources : []) {
    if (sources.length >= GRAPH_LIMITS.sources) break
    if (!isRecord(entry)) continue
    const sourceId = id(entry.id)
    const url = safeHttpUrl(entry.url)
    if (!sourceId || !url || sourceIds.has(sourceId)) continue
    sourceIds.add(sourceId)
    sources.push({ id: sourceId, url, title: text(entry.title, 200) || new URL(url).hostname })
  }

  const nodes: ScanNode[] = []
  const nodeIds = new Set<string>()
  for (const entry of raw.nodes) {
    if (nodes.length >= GRAPH_LIMITS.nodes) break
    if (!isRecord(entry)) continue
    const nodeId = id(entry.id)
    const label = text(entry.label, GRAPH_LIMITS.label)
    const type = NODE_TYPES.find((candidate) => candidate === entry.type)
    if (!nodeId || !label || !type || nodeIds.has(nodeId)) continue
    const kept = Array.from(
      new Set((Array.isArray(entry.sources) ? entry.sources : []).filter((s): s is string => typeof s === "string" && sourceIds.has(s))),
    ).slice(0, GRAPH_LIMITS.sourcesPerNode)
    const claimed = CONFIDENCES.find((candidate) => candidate === entry.confidence) ?? "speculative"
    nodeIds.add(nodeId)
    nodes.push({
      id: nodeId,
      type,
      label,
      summary: text(entry.summary, GRAPH_LIMITS.nodeSummary),
      confidence: kept.length === 0 ? "speculative" : claimed,
      years: text(entry.years, GRAPH_LIMITS.years),
      sources: kept,
    })
  }
  if (nodes.length === 0) return null

  const edges: ScanEdge[] = []
  const seen = new Set<string>()
  for (const entry of Array.isArray(raw.edges) ? raw.edges : []) {
    if (edges.length >= GRAPH_LIMITS.edges) break
    if (!isRecord(entry)) continue
    const from = id(entry.from)
    const to = id(entry.to)
    const relation = RELATIONS.find((candidate) => candidate === entry.relation)
    if (!from || !to || !relation || from === to || !nodeIds.has(from) || !nodeIds.has(to)) continue
    const key = `${from}>${to}>${relation}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ from, to, relation, label: text(entry.label, 80) })
  }

  const usedSources = new Set(nodes.flatMap((node) => node.sources))
  return {
    version: 1,
    surname: text(raw.surname, 80),
    summary: text(raw.summary, GRAPH_LIMITS.summary),
    nodes,
    edges,
    sources: sources.filter((source) => usedSources.has(source.id)),
  }
}
