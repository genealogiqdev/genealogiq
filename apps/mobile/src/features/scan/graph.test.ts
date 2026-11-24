import { describe, expect, it } from 'vitest'
import type { ScanConfidence, ScanEdge, ScanGraph, ScanNode, ScanNodeType, ScanRelation } from '@/api/scan'
import { buildIndex, CONFIDENCES, filterGraph, labelVisible, linkGroups, localIds, NODE_TYPES, nodeRadius, nodeSources, searchNodes, surnameNodeId } from './graph'

const node = (id: string, type: ScanNodeType, label: string, confidence: ScanConfidence = 'documented', sources: string[] = []): ScanNode => ({
  id,
  type,
  label,
  summary: '',
  confidence,
  years: '',
  sources,
})
const edge = (from: string, to: string, relation: ScanRelation, label = ''): ScanEdge => ({ from, to, relation, label })

/*
 *   silva (surname) ◄─variant_of── sylva (variant, probable)
 *     ▲ member_of        ▲ member_of
 *   joao (person) ──spouse_of──► maria (person, speculative)
 *     │ parent_of
 *     ▼
 *   pedro (person) ──lived_in──► porto (place)
 *   lisbon (place)  — no edges
 */
const graph: ScanGraph = {
  version: 1,
  surname: 'Silva',
  summary: '',
  nodes: [
    node('silva', 'surname', 'Silva', 'documented', ['s1']),
    node('sylva', 'variant', 'Sylva', 'probable', ['s1']),
    node('joao', 'person', 'João da Silva', 'documented', ['s2', 's1']),
    node('maria', 'person', 'Maria Sylva', 'speculative'),
    node('pedro', 'person', 'Pedro Silva', 'documented', ['s2']),
    node('porto', 'place', 'Porto', 'documented', ['s1']),
    node('lisbon', 'place', 'Lisboa', 'probable', ['s1']),
  ],
  edges: [
    edge('sylva', 'silva', 'variant_of'),
    edge('joao', 'silva', 'member_of'),
    edge('maria', 'silva', 'member_of'),
    edge('joao', 'maria', 'spouse_of', 'm. 1845'),
    edge('joao', 'pedro', 'parent_of'),
    edge('pedro', 'porto', 'lived_in'),
  ],
  sources: [
    { id: 's1', title: 'Surname dictionary', url: 'https://example.org/silva' },
    { id: 's2', title: 'Parish register', url: 'https://example.org/register' },
  ],
}

describe('buildIndex', () => {
  const index = buildIndex(graph)

  it('counts the edges touching each node', () => {
    expect(Object.fromEntries(index.degree)).toEqual({ silva: 3, sylva: 1, joao: 3, maria: 2, pedro: 2, porto: 1, lisbon: 0 })
  })

  it('lists every edge on both of its ends', () => {
    const ids = (id: string) => index.links.get(id)!.map((link) => `${link.direction}:${link.relation}:${link.node.id}`)
    expect(ids('joao')).toEqual(['out:member_of:silva', 'out:spouse_of:maria', 'out:parent_of:pedro'])
    expect(ids('pedro')).toEqual(['in:parent_of:joao', 'out:lived_in:porto'])
    expect(ids('lisbon')).toEqual([])
  })

  it('ignores edges that point at nodes the graph does not have', () => {
    const broken = buildIndex({ nodes: graph.nodes, edges: [...graph.edges, edge('joao', 'ghost', 'related_to'), edge('joao', 'joao', 'related_to')] })
    expect(broken.degree.get('joao')).toBe(3)
  })
})

describe('linkGroups (linked notes and backlinks)', () => {
  const index = buildIndex(graph)
  const shape = (id: string) => linkGroups(index, id).map((group) => [group.relation, group.direction, group.items.map((item) => item.node.id)])

  it('groups the surname node backlinks by relation', () => {
    expect(shape('silva')).toEqual([
      ['variant_of', 'in', ['sylva']],
      ['member_of', 'in', ['joao', 'maria']],
    ])
  })

  it('separates outgoing links from backlinks of the same node', () => {
    expect(shape('maria')).toEqual([
      ['spouse_of', 'in', ['joao']],
      ['member_of', 'out', ['silva']],
    ])
    expect(shape('pedro')).toEqual([
      ['parent_of', 'in', ['joao']],
      ['lived_in', 'out', ['porto']],
    ])
  })

  it('keeps the edge label', () => {
    const spouse = linkGroups(index, 'joao').find((group) => group.relation === 'spouse_of')
    expect(spouse?.items[0].label).toBe('m. 1845')
  })

  it('is empty for an isolated or unknown node', () => {
    expect(linkGroups(index, 'lisbon')).toEqual([])
    expect(linkGroups(index, 'nope')).toEqual([])
  })
})

describe('localIds', () => {
  const sorted = (ids: Set<string>) => [...ids].sort()

  it('returns only the start node at 0 hops', () => {
    expect(sorted(localIds(graph, 'porto', 0))).toEqual(['porto'])
  })

  it('follows edges in both directions, one hop at a time', () => {
    expect(sorted(localIds(graph, 'porto', 1))).toEqual(['pedro', 'porto'])
    expect(sorted(localIds(graph, 'porto', 2))).toEqual(['joao', 'pedro', 'porto'])
    expect(sorted(localIds(graph, 'porto', 3))).toEqual(['joao', 'maria', 'pedro', 'porto', 'silva'])
  })

  it('never reaches a disconnected node', () => {
    expect(localIds(graph, 'silva', 3).has('lisbon')).toBe(false)
    expect(sorted(localIds(graph, 'lisbon', 3))).toEqual(['lisbon'])
  })

  it('is empty for an unknown start', () => {
    expect(localIds(graph, 'nope', 2).size).toBe(0)
  })
})

describe('filterGraph', () => {
  const all = { types: new Set(NODE_TYPES), confidences: new Set(CONFIDENCES) }
  const edgeKeys = (edges: ScanEdge[]) => edges.map((e) => `${e.from}>${e.to}`)

  it('keeps everything when nothing is filtered', () => {
    const result = filterGraph(graph, all)
    expect(result.nodes).toHaveLength(7)
    expect(result.edges).toHaveLength(6)
  })

  it('hiding a type removes the edges that touched it', () => {
    const result = filterGraph(graph, { ...all, types: new Set<ScanNodeType>(['surname', 'variant', 'place', 'family', 'event']) })
    expect(result.nodes.map((n) => n.id)).toEqual(['silva', 'sylva', 'porto', 'lisbon'])
    expect(edgeKeys(result.edges)).toEqual(['sylva>silva'])
  })

  it('hiding a confidence removes the edges that touched it', () => {
    const result = filterGraph(graph, { ...all, confidences: new Set<ScanConfidence>(['documented']) })
    expect(result.nodes.map((n) => n.id)).toEqual(['silva', 'joao', 'pedro', 'porto'])
    expect(edgeKeys(result.edges)).toEqual(['joao>silva', 'joao>pedro', 'pedro>porto'])
  })

  it('combines type and confidence', () => {
    const result = filterGraph(graph, { types: new Set<ScanNodeType>(['person']), confidences: new Set<ScanConfidence>(['documented', 'probable']) })
    expect(result.nodes.map((n) => n.id)).toEqual(['joao', 'pedro'])
    expect(edgeKeys(result.edges)).toEqual(['joao>pedro'])
  })

  it('restricts to the local graph and keeps the selected node whatever the filters', () => {
    const result = filterGraph(graph, {
      types: new Set<ScanNodeType>(['person']),
      confidences: new Set(CONFIDENCES),
      only: new Set(['porto', 'pedro', 'joao']),
      keep: 'porto',
    })
    expect(result.nodes.map((n) => n.id)).toEqual(['joao', 'pedro', 'porto'])
    expect(edgeKeys(result.edges)).toEqual(['joao>pedro', 'pedro>porto'])
  })
})

describe('surnameNodeId', () => {
  it('is the surname node', () => {
    expect(surnameNodeId(graph)).toBe('silva')
  })

  it('falls back to the best-connected node', () => {
    const withoutSurname = { nodes: graph.nodes.filter((n) => n.id !== 'silva'), edges: graph.edges.filter((e) => e.to !== 'silva') }
    // joao keeps spouse_of + parent_of (2); pedro has parent_of + lived_in (2); the first of the tie wins.
    expect(surnameNodeId(withoutSurname)).toBe('joao')
  })

  it('is null for an empty graph', () => {
    expect(surnameNodeId({ nodes: [], edges: [] })).toBeNull()
  })
})

describe('searchNodes', () => {
  it('ignores case and accents, prefix matches first', () => {
    expect(searchNodes(graph.nodes, 'joao').map((n) => n.id)).toEqual(['joao'])
    expect(searchNodes(graph.nodes, 'SILVA').map((n) => n.id)).toEqual(['silva', 'joao', 'pedro'])
    expect(searchNodes(graph.nodes, 'sylva').map((n) => n.id)).toEqual(['sylva', 'maria'])
  })

  it('returns nothing for a blank query and respects the limit', () => {
    expect(searchNodes(graph.nodes, '   ')).toEqual([])
    expect(searchNodes(graph.nodes, 'a', 2)).toHaveLength(2)
  })
})

describe('drawing rules', () => {
  it('sizes nodes by degree with a cap', () => {
    expect(nodeRadius(0)).toBe(4)
    expect(nodeRadius(4)).toBe(8)
    expect(nodeRadius(9)).toBe(10)
    expect(nodeRadius(400)).toBe(14)
    expect(nodeRadius(4, true)).toBe(11)
  })

  it('reveals labels of less-connected nodes as the zoom level rises', () => {
    expect(labelVisible(50, 0)).toBe(false)
    expect(labelVisible(6, 1)).toBe(true)
    expect(labelVisible(5, 1)).toBe(false)
    expect(labelVisible(3, 2)).toBe(true)
    expect(labelVisible(2, 2)).toBe(false)
    expect(labelVisible(0, 3)).toBe(true)
  })
})

describe('nodeSources', () => {
  it('resolves ids in the node order and skips unknown or repeated ids', () => {
    const joao = { ...graph.nodes[2], sources: ['s2', 'missing', 's1', 's2'] }
    expect(nodeSources(graph, joao).map((s) => s.url)).toEqual(['https://example.org/register', 'https://example.org/silva'])
  })
})
