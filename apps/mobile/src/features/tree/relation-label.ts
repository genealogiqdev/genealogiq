// Port of the web's lib/family-relation-label.ts (pure TypeScript).
import type { TreePerson, TreeRelation } from '@/api/app'

type Direction = 'parent' | 'child' | 'spouse' | 'sibling'

export interface RelationPathStep {
  via: Direction
  toId: string
  /** The relation this step traversed, so the canvas can highlight its edge. */
  relationId: string
  isStep: boolean
}

export interface RelationPath {
  targetId: string
  steps: RelationPathStep[]
}

/** Shortest path (BFS by hop count) from `rootId` to `targetId`; null when unreachable or identical. */
export function findRelationPath(
  relations: readonly Pick<TreeRelation, 'id' | 'type' | 'subtype' | 'fromId' | 'toId'>[],
  rootId: string,
  targetId: string,
  maxHops = 12,
): RelationPath | null {
  if (rootId === targetId) return null
  const adj = new Map<string, RelationPathStep[]>()
  const push = (from: string, step: RelationPathStep) => {
    const arr = adj.get(from) ?? []
    arr.push(step)
    adj.set(from, arr)
  }
  for (const r of relations) {
    const isStep = r.subtype === 'step' || r.subtype === 'adopted'
    if (r.type === 'PARENT_OF') {
      push(r.toId, { via: 'parent', toId: r.fromId, relationId: r.id, isStep })
      push(r.fromId, { via: 'child', toId: r.toId, relationId: r.id, isStep })
    } else if (r.type === 'SPOUSE') {
      push(r.fromId, { via: 'spouse', toId: r.toId, relationId: r.id, isStep: false })
      push(r.toId, { via: 'spouse', toId: r.fromId, relationId: r.id, isStep: false })
    } else if (r.type === 'SIBLING') {
      const sibStep = r.subtype === 'half' || r.subtype === 'step'
      push(r.fromId, { via: 'sibling', toId: r.toId, relationId: r.id, isStep: sibStep })
      push(r.toId, { via: 'sibling', toId: r.fromId, relationId: r.id, isStep: sibStep })
    }
  }
  const queue: { id: string; steps: RelationPathStep[] }[] = [{ id: rootId, steps: [] }]
  const visited = new Set<string>([rootId])
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (cur.steps.length >= maxHops) continue
    for (const s of adj.get(cur.id) ?? []) {
      if (visited.has(s.toId)) continue
      visited.add(s.toId)
      const nextSteps = [...cur.steps, s]
      if (s.toId === targetId) return { targetId, steps: nextSteps }
      queue.push({ id: s.toId, steps: nextSteps })
    }
  }
  return null
}

/**
 * Label for `targetId` seen from `rootId` (up to 4 hops). `t` is scoped to
 * `FamilyTree`; `possessive` picks "Your cousin" (`relation.*`) or the bare
 * noun (`relation.bare.*`) for a sentence that already names both people.
 */
export function relationFromRoot(
  persons: Record<string, TreePerson>,
  relations: readonly TreeRelation[],
  rootId: string,
  targetId: string,
  t: (key: string) => string,
  possessive = true,
): string | null {
  if (rootId === targetId) return null
  const target = persons[targetId]
  if (!target) return null
  const path = findRelationPath(relations, rootId, targetId, 4)
  const rel = (key: string) => t(possessive ? `relation.${key}` : `relation.bare.${key}`)
  if (!path) return rel('relative')
  return labelForPath(
    path.steps.map((s) => s.via),
    path.steps.map((s) => s.isStep),
    target.gender,
    rel,
  )
}

function labelForPath(via: Direction[], steps: boolean[], gender: string | null, rel: (key: string) => string): string {
  const fem = gender === 'FEMALE'
  const pick = (female: string, male: string) => rel(fem ? female : male)
  const path = via.join('>')
  if (path === 'parent') return steps[0] ? pick('stepMother', 'stepFather') : pick('mother', 'father')
  if (path === 'child') return steps[0] ? pick('stepDaughter', 'stepSon') : pick('daughter', 'son')
  if (path === 'spouse') return pick('wife', 'husband')
  if (path === 'sibling') return steps[0] ? pick('halfSister', 'halfBrother') : pick('sister', 'brother')
  if (path === 'parent>parent') return pick('grandmother', 'grandfather')
  if (path === 'child>child') return pick('granddaughter', 'grandson')
  if (path === 'parent>sibling') return pick('aunt', 'uncle')
  if (path === 'sibling>child') return pick('niece', 'nephew')
  if (path === 'parent>spouse') return pick('stepMother', 'stepFather')
  if (path === 'spouse>parent') return pick('motherInLaw', 'fatherInLaw')
  if (path === 'spouse>child') return pick('stepDaughter', 'stepSon')
  if (path === 'sibling>spouse' || path === 'spouse>sibling') return pick('sisterInLaw', 'brotherInLaw')
  if (path === 'parent>parent>parent') return pick('greatGrandmother', 'greatGrandfather')
  if (path === 'child>child>child') return pick('greatGranddaughter', 'greatGrandson')
  if (path === 'parent>sibling>child') return rel('cousin')
  if (path === 'parent>parent>sibling') return pick('greatAunt', 'greatUncle')
  if (path === 'sibling>child>child') return pick('grandNiece', 'grandNephew')
  return rel('relative')
}
