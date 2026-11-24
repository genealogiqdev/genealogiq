// Pure graph logic for the Genealogy Scan screens: indexes, backlinks,
// local-graph selection, filtering and search. No React / React Native imports.
import type { ScanConfidence, ScanEdge, ScanGraph, ScanNode, ScanNodeType, ScanRelation } from '@/api/scan'

export const NODE_TYPES: readonly ScanNodeType[] = ['surname', 'variant', 'person', 'family', 'place', 'event']
export const CONFIDENCES: readonly ScanConfidence[] = ['documented', 'probable', 'speculative']
export const RELATIONS: readonly ScanRelation[] = [
  'parent_of',
  'spouse_of',
  'sibling_of',
  'variant_of',
  'originated_in',
  'lived_in',
  'migrated_to',
  'member_of',
  'participated_in',
  'related_to',
]

/** `out`: this node is the edge's `from`. `in`: another node points at this one (a backlink). */
export type LinkDirection = 'out' | 'in'

export interface Neighbour {
  node: ScanNode
  relation: ScanRelation
  direction: LinkDirection
  /** The edge's own free-text label (may be empty). */
  label: string
}

export interface LinkGroup {
  relation: ScanRelation
  direction: LinkDirection
  items: Neighbour[]
}

export interface GraphIndex {
  byId: Map<string, ScanNode>
  /** Every edge appears twice: as `out` on its source and as `in` on its target. */
  links: Map<string, Neighbour[]>
  /** Number of edges touching the node. */
  degree: Map<string, number>
}

type GraphLike = Pick<ScanGraph, 'nodes' | 'edges'>

export function buildIndex(graph: GraphLike): GraphIndex {
  const byId = new Map<string, ScanNode>()
  const links = new Map<string, Neighbour[]>()
  const degree = new Map<string, number>()
  for (const node of graph.nodes) {
    byId.set(node.id, node)
    links.set(node.id, [])
    degree.set(node.id, 0)
  }
  for (const edge of graph.edges) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to || from === to) continue
    links.get(from.id)!.push({ node: to, relation: edge.relation, direction: 'out', label: edge.label })
    links.get(to.id)!.push({ node: from, relation: edge.relation, direction: 'in', label: edge.label })
    degree.set(from.id, degree.get(from.id)! + 1)
    degree.set(to.id, degree.get(to.id)! + 1)
  }
  return { byId, links, degree }
}

/**
 * The "Linked notes" of one node: neighbours grouped by relation and
 * direction, in the fixed relation order, outgoing before incoming.
 */
export function linkGroups(index: GraphIndex, id: string): LinkGroup[] {
  const all = index.links.get(id) ?? []
  const groups: LinkGroup[] = []
  for (const relation of RELATIONS) {
    for (const direction of ['out', 'in'] as const) {
      const items = all.filter((link) => link.relation === relation && link.direction === direction)
      if (items.length > 0) groups.push({ relation, direction, items })
    }
  }
  return groups
}

/** Ids within `hops` edges of `startId` (edges are followed in both directions), including the start. */
export function localIds(graph: GraphLike, startId: string, hops: number): Set<string> {
  const found = new Set<string>()
  if (!graph.nodes.some((node) => node.id === startId)) return found
  const adjacency = new Map<string, string[]>()
  const push = (a: string, b: string) => {
    const list = adjacency.get(a)
    if (list) list.push(b)
    else adjacency.set(a, [b])
  }
  for (const edge of graph.edges) {
    push(edge.from, edge.to)
    push(edge.to, edge.from)
  }
  found.add(startId)
  let frontier = [startId]
  for (let hop = 0; hop < hops && frontier.length > 0; hop++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const other of adjacency.get(id) ?? []) {
        if (found.has(other)) continue
        found.add(other)
        next.push(other)
      }
    }
    frontier = next
  }
  return found
}

export interface GraphFilter {
  types: ReadonlySet<ScanNodeType>
  confidences: ReadonlySet<ScanConfidence>
  /** When set, only these ids may be shown (the local graph). */
  only?: ReadonlySet<string> | null
  /** Always shown, whatever the type/confidence filters say (the selected node). */
  keep?: string | null
}

/** Visible nodes, and only the edges whose two ends are both visible. */
export function filterGraph(graph: GraphLike, filter: GraphFilter): { nodes: ScanNode[]; edges: ScanEdge[] } {
  const nodes = graph.nodes.filter((node) => {
    if (filter.only && !filter.only.has(node.id)) return false
    if (filter.keep && node.id === filter.keep) return true
    return filter.types.has(node.type) && filter.confidences.has(node.confidence)
  })
  const visible = new Set(nodes.map((node) => node.id))
  const edges = graph.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to))
  return { nodes, edges }
}

/** The graph's hub: the surname node, else the best-connected node. */
export function surnameNodeId(graph: GraphLike, index: GraphIndex = buildIndex(graph)): string | null {
  const surname = graph.nodes.find((node) => node.type === 'surname')
  if (surname) return surname.id
  let best: string | null = null
  let bestDegree = -1
  for (const node of graph.nodes) {
    const degree = index.degree.get(node.id) ?? 0
    if (degree > bestDegree) {
      best = node.id
      bestDegree = degree
    }
  }
  return best
}

/** Lower-case and strip accents so "joao" finds "João". */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Nodes whose label contains the query; labels that start with it come first. */
export function searchNodes(nodes: readonly ScanNode[], query: string, limit = 8): ScanNode[] {
  const needle = fold(query)
  if (!needle) return []
  const starts: ScanNode[] = []
  const contains: ScanNode[] = []
  for (const node of nodes) {
    const label = fold(node.label)
    if (label.startsWith(needle)) starts.push(node)
    else if (label.includes(needle)) contains.push(node)
  }
  return [...starts, ...contains].slice(0, limit)
}

export function countByType(nodes: readonly ScanNode[]): Record<ScanNodeType, number> {
  const counts: Record<ScanNodeType, number> = { surname: 0, variant: 0, person: 0, family: 0, place: 0, event: 0 }
  for (const node of nodes) counts[node.type] += 1
  return counts
}

export function countByConfidence(nodes: readonly ScanNode[]): Record<ScanConfidence, number> {
  const counts: Record<ScanConfidence, number> = { documented: 0, probable: 0, speculative: 0 }
  for (const node of nodes) counts[node.confidence] += 1
  return counts
}

/** Drawn radius in layout units: grows with the square root of the degree; the hub is a little larger. */
export function nodeRadius(degree: number, isHub = false): number {
  return 4 + Math.min(10, Math.sqrt(Math.max(0, degree)) * 2) + (isHub ? 3 : 0)
}

/**
 * Zoom level 0 shows no labels (other than the hub and the selection), each
 * further level reveals less-connected nodes, level 3 shows every label.
 */
export function labelVisible(degree: number, zoomLevel: number): boolean {
  if (zoomLevel >= 3) return true
  if (zoomLevel === 2) return degree >= 3
  if (zoomLevel === 1) return degree >= 6
  return false
}

/** Sources of one node, in the node's own order, skipping ids the graph does not have. */
export function nodeSources(graph: Pick<ScanGraph, 'sources'>, node: ScanNode): ScanGraph['sources'] {
  const byId = new Map(graph.sources.map((source) => [source.id, source]))
  const seen = new Set<string>()
  const result: ScanGraph['sources'] = []
  for (const id of node.sources) {
    const source = byId.get(id)
    if (!source || seen.has(id)) continue
    seen.add(id)
    result.push(source)
  }
  return result
}
