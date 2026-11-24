import { describe, expect, it } from 'vitest'
import { buildEdgeSegments } from './edges'
import { buildFamilyGraph } from './family-units'
import { computeLayout, NODE_H, NODE_W, PET_GAP_X, X_SIBLING, X_TIGHT, Y_GEN, type LaidNode } from './index'
import type { TreePerson, TreeRelation } from './types'

// Every expectation below is worked out by hand from the layout rules
// (card 168x72, couple gap 24, sibling gap 40, row pitch 140), never copied
// from the implementation's output.

const person = (birthYear: number | null, birthDate: string | null = null): TreePerson => ({ birthYear, birthDate })

let seq = 0
const rel = (type: string, fromId: string, toId: string, extra: Partial<TreeRelation> = {}): TreeRelation => ({
  id: `r${++seq}`,
  type,
  subtype: null,
  fromId,
  toId,
  startDate: null,
  endDate: null,
  status: 'ACCEPTED',
  ...extra,
})

const byId = (nodes: LaidNode[]) => new Map(nodes.map((n) => [n.id, n]))
const centre = (n: LaidNode) => n.x + NODE_W / 2

function expectNoOverlap(nodes: LaidNode[]) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      const overlaps = a.x < b.x + NODE_W && b.x < a.x + NODE_W && a.y < b.y + NODE_H && b.y < a.y + NODE_H
      expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false)
    }
  }
}

describe('constants shared with the web layout', () => {
  it('keeps the web card and spacing constants', () => {
    expect([NODE_W, NODE_H, Y_GEN, X_TIGHT, X_SIBLING, PET_GAP_X]).toEqual([168, 72, 140, 24, 40, 12])
  })
})

describe('a couple with two children', () => {
  const persons = { dad: person(1950), mom: person(1952), kid1: person(1980), kid2: person(1983) }
  const relations = [
    rel('SPOUSE', 'dad', 'mom', { subtype: 'married' }),
    rel('PARENT_OF', 'dad', 'kid1'),
    rel('PARENT_OF', 'mom', 'kid1'),
    rel('PARENT_OF', 'dad', 'kid2'),
    rel('PARENT_OF', 'mom', 'kid2'),
  ]
  const layout = computeLayout(persons, relations, 'dad')
  const at = byId(layout.nodes)

  it('places exactly the four people, none duplicated', () => {
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(['dad', 'kid1', 'kid2', 'mom'])
    expect(layout.nodes.every((n) => !n.isDuplicate)).toBe(true)
  })

  it('puts the partners on one row, the older one on the left, one couple gap apart', () => {
    expect(at.get('dad')!.y).toBe(at.get('mom')!.y)
    expect(at.get('mom')!.x - at.get('dad')!.x).toBe(NODE_W + X_TIGHT) // 192
  })

  it('puts the children on the next row, oldest first, one sibling gap apart', () => {
    expect(at.get('kid1')!.y).toBe(at.get('dad')!.y + Y_GEN)
    expect(at.get('kid2')!.y).toBe(at.get('dad')!.y + Y_GEN)
    expect(at.get('kid2')!.x - at.get('kid1')!.x).toBe(NODE_W + X_SIBLING) // 208
  })

  it('centres the children under the couple', () => {
    const coupleMid = (at.get('dad')!.x + at.get('mom')!.x + NODE_W) / 2
    const childrenMid = (at.get('kid1')!.x + at.get('kid2')!.x + NODE_W) / 2
    expect(childrenMid).toBe(coupleMid)
    // Couple spans 360, children span 376: the children overhang 8 on each side.
    expect(at.get('dad')!.x - at.get('kid1')!.x).toBe(8)
  })

  it('has no overlapping cards and bounds that wrap them', () => {
    expectNoOverlap(layout.nodes)
    expect(layout.bounds.maxX - layout.bounds.minX).toBe(2 * NODE_W + X_SIBLING) // 376, the children row
    expect(layout.bounds.maxY - layout.bounds.minY).toBe(Y_GEN + NODE_H) // 212
  })

  it('reports generations relative to the root', () => {
    expect(layout.generation.get('dad')).toBe(0)
    expect(layout.generation.get('mom')).toBe(0)
    expect(layout.generation.get('kid1')).toBe(1)
  })

  it('emits one couple line and four parent lines', () => {
    expect(layout.coupleLines).toHaveLength(1)
    expect(layout.parentLines).toHaveLength(4)
    expect(layout.siblingLines).toHaveLength(0)
  })

  it('draws a shared T-junction: drop from the couple midpoint, trunk, one stub per child', () => {
    const segments = buildEdgeSegments(layout)
    const parentSegments = segments.filter((s) => s.kind === 'parent')
    expect(parentSegments).toHaveLength(4) // drop + trunk + 2 stubs
    expect(segments.filter((s) => s.kind === 'spouse')).toHaveLength(1)
    const dad = at.get('dad')!
    const mid = (centre(dad) + centre(at.get('mom')!)) / 2
    const trunkY = dad.y + NODE_H + 28
    expect(parentSegments[0].d).toBe(`M ${mid} ${dad.y + NODE_H / 2} L ${mid} ${trunkY}`)
    expect(parentSegments[1].d).toBe(`M ${centre(at.get('kid1')!)} ${trunkY} L ${centre(at.get('kid2')!)} ${trunkY}`)
    // The couple line joins the facing edges of the two cards at mid-height.
    expect(segments.find((s) => s.kind === 'spouse')!.d).toBe(
      `M ${dad.x + NODE_W} ${dad.y + NODE_H / 2} L ${at.get('mom')!.x} ${dad.y + NODE_H / 2}`,
    )
  })

  it('highlights only the stub of the child on the compared path, plus the shared trunk', () => {
    const kid2Relation = relations[3].id
    const highlighted = buildEdgeSegments(layout, new Set([kid2Relation])).filter((s) => s.kind === 'parent' && s.highlighted)
    expect(highlighted).toHaveLength(3) // drop, trunk, kid2's stub
  })
})

describe('a three-generation chain', () => {
  const persons = { grandpa: person(1920), father: person(1950), me: person(1980) }
  const relations = [rel('PARENT_OF', 'grandpa', 'father'), rel('PARENT_OF', 'father', 'me')]

  it('stacks one generation per row when viewed from the middle', () => {
    const layout = computeLayout(persons, relations, 'father')
    const at = byId(layout.nodes)
    expect(at.get('grandpa')!.y).toBe(-Y_GEN)
    expect(at.get('father')!.y).toBe(0)
    expect(at.get('me')!.y).toBe(Y_GEN)
    expect(at.get('me')!.x).toBe(at.get('father')!.x)
    // The shared web algorithm anchors a lone ancestor on its card edge, not
    // its centre, so the grandparent is only required to stay over the column.
    expect(Math.abs(at.get('grandpa')!.x - at.get('father')!.x)).toBeLessThan(NODE_W)
    expect(layout.bounds.maxY - layout.bounds.minY).toBe(2 * Y_GEN + NODE_H) // 352
    expectNoOverlap(layout.nodes)
  })

  it('keeps the same column whichever person is the root', () => {
    for (const rootId of ['grandpa', 'me']) {
      const layout = computeLayout(persons, relations, rootId)
      const at = byId(layout.nodes)
      expect(layout.nodes).toHaveLength(3)
      expect(at.get('father')!.y - at.get('grandpa')!.y).toBe(Y_GEN)
      expect(at.get('me')!.y - at.get('father')!.y).toBe(Y_GEN)
      expect(at.get('grandpa')!.x).toBe(at.get('me')!.x)
      expect(layout.generation.get(rootId)).toBe(0)
    }
  })

  it('draws each lone parent-child link as one straight elbow', () => {
    const layout = computeLayout(persons, relations, 'father')
    const segments = buildEdgeSegments(layout)
    expect(segments).toHaveLength(2)
    const father = byId(layout.nodes).get('father')!
    const x = centre(father)
    // Card bottom (72) to the child's top (140): the elbow turns at the halfway point, 106.
    expect(segments[1].d).toBe(`M ${x} 72 L ${x} 106 L ${x} 106 L ${x} 140`)
  })

  it('hides descendants of a collapsed person and flags the toggle', () => {
    const layout = computeLayout(persons, relations, 'grandpa', new Set(['father']))
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(['father', 'grandpa'])
    const father = byId(layout.nodes).get('father')!
    expect(father.hasCollapsible).toBe(true)
    expect(father.isCollapsed).toBe(true)
    expect(father.collapseDirection).toBe('down')
  })
})

describe('a pet attached to an owner', () => {
  it('sits on the next row, centred under a single owner', () => {
    const layout = computeLayout({ owner: person(1980), rex: person(null) }, [], 'owner', new Set(), [
      { id: 'o1', petId: 'rex', ownerId: 'owner' },
    ])
    const at = byId(layout.nodes)
    expect(at.get('rex')!.x).toBe(at.get('owner')!.x)
    expect(at.get('rex')!.y).toBe(at.get('owner')!.y + Y_GEN)
    expect(layout.petLines).toEqual([{ petId: 'rex', ownerId: 'owner', relationId: 'o1' }])
    expect(buildEdgeSegments(layout).filter((s) => s.kind === 'pet')).toHaveLength(1)
  })

  it('never joins the genealogy: the pet has no generation and no family lines', () => {
    const layout = computeLayout({ owner: person(1980), rex: person(null) }, [], 'owner', new Set(), [
      { id: 'o1', petId: 'rex', ownerId: 'owner' },
    ])
    expect(layout.generation.has('rex')).toBe(false)
    expect(layout.parentLines).toHaveLength(0)
  })

  it('moves aside instead of covering a child card on the same row', () => {
    const persons = { owner: person(1950), child: person(1980), rex: person(null) }
    const layout = computeLayout(persons, [rel('PARENT_OF', 'owner', 'child')], 'owner', new Set(), [
      { id: 'o1', petId: 'rex', ownerId: 'owner' },
    ])
    const at = byId(layout.nodes)
    expect(at.get('rex')!.y).toBe(at.get('child')!.y)
    // First free slot: right of the child card plus the pet gap.
    expect(at.get('rex')!.x).toBe(at.get('child')!.x + NODE_W + PET_GAP_X)
    expectNoOverlap(layout.nodes)
  })

  it('stacks two pets of the same owner side by side, centred as a group', () => {
    const layout = computeLayout({ owner: person(1980), a: person(null), b: person(null) }, [], 'owner', new Set(), [
      { id: 'o1', petId: 'a', ownerId: 'owner' },
      { id: 'o2', petId: 'b', ownerId: 'owner' },
    ])
    const at = byId(layout.nodes)
    expect(at.get('b')!.x - at.get('a')!.x).toBe(NODE_W + PET_GAP_X) // 180
    const groupMid = (at.get('a')!.x + at.get('b')!.x + NODE_W) / 2
    expect(groupMid).toBe(centre(at.get('owner')!))
  })

  it('skips a pet whose owner is not in the tree', () => {
    const layout = computeLayout({ owner: person(1980), rex: person(null) }, [], 'owner', new Set(), [
      { id: 'o1', petId: 'rex', ownerId: 'someone-else' },
    ])
    expect(layout.nodes.map((n) => n.id)).toEqual(['owner'])
    expect(layout.petLines).toHaveLength(0)
  })
})

describe('siblings, ISO dates and rejected relations', () => {
  it('orders the root between an older and a younger sibling using ISO birth dates', () => {
    const persons = {
      p: person(1950),
      older: person(null, '1978-05-01T00:00:00.000Z'),
      me: person(null, '1980-05-01T00:00:00.000Z'),
      younger: person(null, '1984-05-01T00:00:00.000Z'),
    }
    const relations = [rel('PARENT_OF', 'p', 'older'), rel('PARENT_OF', 'p', 'me'), rel('PARENT_OF', 'p', 'younger')]
    const layout = computeLayout(persons, relations, 'me')
    const at = byId(layout.nodes)
    expect(at.get('older')!.x).toBeLessThan(at.get('me')!.x)
    expect(at.get('me')!.x).toBeLessThan(at.get('younger')!.x)
    expect(new Set(['older', 'me', 'younger'].map((id) => at.get(id)!.y))).toEqual(new Set([0]))
    expect(at.get('p')!.y).toBe(-Y_GEN)
    expectNoOverlap(layout.nodes)
  })

  it('emits a sibling line only when the two share no recorded parent', () => {
    const persons = { a: person(1980), b: person(1982) }
    const layout = computeLayout(persons, [rel('SIBLING', 'a', 'b')], 'a')
    expect(layout.siblingLines).toHaveLength(1)
    expect(byId(layout.nodes).get('b')!.y).toBe(0)
  })

  it('ignores a rejected partner when picking the active spouse', () => {
    const persons = { a: person(1980), b: person(1981), c: person(1982) }
    const graph = buildFamilyGraph(persons, [
      rel('SPOUSE', 'a', 'b', { status: 'REJECTED' }),
      rel('SPOUSE', 'a', 'c', { status: 'PENDING' }),
    ])
    expect(graph.spouseOf.get('a')).toBe('c')
    expect(graph.spouseOf.get('b')).toBeNull()
  })

  it('prefers a current marriage over one that ended', () => {
    const persons = { a: person(1950), ex: person(1951), now: person(1955) }
    const graph = buildFamilyGraph(persons, [
      rel('SPOUSE', 'a', 'ex', { subtype: 'divorced', endDate: '1990-01-01T00:00:00.000Z' }),
      rel('SPOUSE', 'a', 'now', { subtype: 'married' }),
    ])
    expect(graph.spouseOf.get('a')).toBe('now')
  })
})

describe('a larger tree', () => {
  it('lays out 150 people without overlapping cards', () => {
    // Five generations: each couple has three children, each child marries in.
    const persons: Record<string, TreePerson> = {}
    const relations: TreeRelation[] = []
    let count = 0
    const add = (year: number) => {
      const id = `p${count++}`
      persons[id] = person(year)
      return id
    }
    let couples: [string, string][] = [[add(1900), add(1901)]]
    relations.push(rel('SPOUSE', couples[0][0], couples[0][1]))
    while (count < 150) {
      const next: [string, string][] = []
      for (const [a, b] of couples) {
        for (let i = 0; i < 3 && count < 150; i++) {
          const year = persons[a].birthYear! + 25 + i
          const child = add(year)
          relations.push(rel('PARENT_OF', a, child), rel('PARENT_OF', b, child))
          if (count < 150) {
            const partner = add(year + 1)
            relations.push(rel('SPOUSE', child, partner))
            next.push([child, partner])
          }
        }
      }
      couples = next
    }
    const layout = computeLayout(persons, relations, 'p0')
    expect(layout.nodes).toHaveLength(150)
    expectNoOverlap(layout.nodes)
  })
})
