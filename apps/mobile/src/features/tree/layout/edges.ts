// Edge geometry — a pure port of the web's canvas/edges/family-edges.tsx.
// The web renders <line>/<path> elements directly; here the same geometry is
// returned as SVG path data so the renderer can merge every edge of one style
// into a single <Path> (few native nodes = cheap redraws while panning).

import { NODE_H, NODE_W, Y_GEN } from './index'
import type { CoupleLineGeom, LaidNode, ParentLineGeom, PetLineGeom, SiblingLineGeom } from './index'

export const TRUNK_OFFSET = 28 // vertical distance below parent card before the horizontal trunk

export type EdgeKind = 'parent' | 'spouse' | 'sibling' | 'pet'

export interface EdgeSegment {
  kind: EdgeKind
  subtype: string
  highlighted: boolean
  d: string
}

interface Pos {
  x: number
  y: number
}

interface EdgeInput {
  nodes: LaidNode[]
  parentLines: ParentLineGeom[]
  coupleLines: CoupleLineGeom[]
  siblingLines: SiblingLineGeom[]
  petLines: PetLineGeom[]
}

const line = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} L ${x2} ${y2}`

export function buildEdgeSegments(input: EdgeInput, highlightedRelationIds?: ReadonlySet<string>): EdgeSegment[] {
  const { nodes, parentLines, coupleLines, siblingLines, petLines } = input
  const out: EdgeSegment[] = []
  const pos = new Map<string, Pos>()
  for (const n of nodes) pos.set(n.id, { x: n.x, y: n.y })
  const isHighlighted = (relationId: string) => highlightedRelationIds?.has(relationId) ?? false

  // Group parent lines by child (to detect two-parent T-junctions).
  const parentsByChild = new Map<string, { parentId: string; subtype: string; relationId: string }[]>()
  for (const p of parentLines) {
    const arr = parentsByChild.get(p.childId) ?? []
    arr.push({ parentId: p.parentId, subtype: p.subtype, relationId: p.relationId })
    parentsByChild.set(p.childId, arr)
  }

  interface Group {
    children: string[]
    subtypes: Map<string, string>
    highlightedChildren: Set<string>
  }

  // Two-parent families, grouped by sorted parent pair so children share one trunk.
  const familiesByPair = new Map<string, Group & { parents: [string, string] }>()
  for (const [childId, ps] of parentsByChild.entries()) {
    if (ps.length < 2) continue
    const sortedIds = ps.map((p) => p.parentId).sort()
    const key = sortedIds.join('|')
    const family = familiesByPair.get(key) ?? {
      parents: [sortedIds[0], sortedIds[1]] as [string, string],
      children: [],
      subtypes: new Map<string, string>(),
      highlightedChildren: new Set<string>(),
    }
    family.children.push(childId)
    family.subtypes.set(childId, ps[0].subtype === 'blood' ? ps[1].subtype : ps[0].subtype)
    if (ps.some((p) => isHighlighted(p.relationId))) family.highlightedChildren.add(childId)
    familiesByPair.set(key, family)
  }

  // Single-parent groups; a T-junction is drawn only for 2+ children.
  const singleParentGroups = new Map<string, Group>()
  for (const [childId, ps] of parentsByChild.entries()) {
    if (ps.length !== 1) continue
    const { parentId, subtype, relationId } = ps[0]
    const group = singleParentGroups.get(parentId) ?? {
      children: [],
      subtypes: new Map<string, string>(),
      highlightedChildren: new Set<string>(),
    }
    group.children.push(childId)
    group.subtypes.set(childId, subtype)
    if (isHighlighted(relationId)) group.highlightedChildren.add(childId)
    singleParentGroups.set(parentId, group)
  }

  const junction = (group: Group, topX: number, topY: number, trunkY: number) => {
    const childCenters = group.children
      .map((id) => pos.get(id))
      .filter((p): p is Pos => !!p)
      .map((p) => p.x + NODE_W / 2)
    if (childCenters.length === 0) return
    // Extend the trunk to include the parent x so the vertical always connects.
    const leftX = Math.min(topX, ...childCenters)
    const rightX = Math.max(topX, ...childCenters)
    const trunkSubtype = group.subtypes.values().next().value ?? 'blood'
    const trunkHighlighted = group.highlightedChildren.size > 0
    out.push({ kind: 'parent', subtype: trunkSubtype, highlighted: trunkHighlighted, d: line(topX, topY, topX, trunkY) })
    out.push({ kind: 'parent', subtype: trunkSubtype, highlighted: trunkHighlighted, d: line(leftX, trunkY, rightX, trunkY) })
    for (const cid of group.children) {
      const cp = pos.get(cid)
      if (!cp) continue
      const stubX = cp.x + NODE_W / 2
      out.push({
        kind: 'parent',
        subtype: group.subtypes.get(cid) ?? trunkSubtype,
        highlighted: group.highlightedChildren.has(cid),
        d: line(stubX, trunkY, stubX, cp.y),
      })
    }
  }

  for (const fam of familiesByPair.values()) {
    const pa = pos.get(fam.parents[0])
    const pb = pos.get(fam.parents[1])
    if (!pa || !pb) continue
    // Start at the couple-line Y: the card is drawn above the edges and hides the part inside it.
    const coupleLineY = Math.max(pa.y, pb.y) + NODE_H / 2
    const trunkY = Math.max(pa.y, pb.y) + NODE_H + TRUNK_OFFSET
    const parentMidX = (pa.x + NODE_W / 2 + (pb.x + NODE_W / 2)) / 2
    junction(fam, parentMidX, coupleLineY, trunkY)
  }

  for (const [parentId, group] of singleParentGroups.entries()) {
    if (group.children.length < 2) continue
    const pp = pos.get(parentId)
    if (!pp) continue
    junction(group, pp.x + NODE_W / 2, pp.y + NODE_H, pp.y + NODE_H + TRUNK_OFFSET)
  }

  const elbow = (a: Pos, b: Pos) => {
    const ax = a.x + NODE_W / 2
    const bx = b.x + NODE_W / 2
    const ay = a.y + NODE_H
    const by = b.y
    const midY = ay + (by - ay) / 2
    return `M ${ax} ${ay} L ${ax} ${midY} L ${bx} ${midY} L ${bx} ${by}`
  }

  // Lone parent → lone child elbows.
  for (const p of parentLines) {
    const ps = parentsByChild.get(p.childId)
    if (ps && ps.length >= 2) continue
    const group = singleParentGroups.get(p.parentId)
    if (group && group.children.length >= 2) continue
    const a = pos.get(p.parentId)
    const b = pos.get(p.childId)
    if (!a || !b) continue
    out.push({ kind: 'parent', subtype: p.subtype, highlighted: isHighlighted(p.relationId), d: elbow(a, b) })
  }

  for (const c of coupleLines) {
    const a = pos.get(c.aId)
    const b = pos.get(c.bId)
    if (!a || !b) continue
    const x1 = a.x + NODE_W
    const y1 = a.y + NODE_H / 2
    const x2 = b.x
    const sameRow = Math.abs(a.y - b.y) < 4
    const curveY = (a.y + b.y) / 2 + Y_GEN / 4
    const d = sameRow
      ? line(Math.min(x1, x2), y1, Math.max(x1, x2), y1)
      : `M ${a.x + NODE_W / 2} ${a.y + NODE_H} C ${a.x + NODE_W / 2} ${curveY} ${b.x + NODE_W / 2} ${curveY} ${b.x + NODE_W / 2} ${b.y}`
    out.push({ kind: 'spouse', subtype: c.subtype, highlighted: isHighlighted(c.relationId), d })
  }

  for (const s of siblingLines) {
    const a = pos.get(s.aId)
    const b = pos.get(s.bId)
    if (!a || !b) continue
    const y = a.y + NODE_H / 2
    out.push({
      kind: 'sibling',
      subtype: s.subtype,
      highlighted: isHighlighted(s.relationId),
      d: line(a.x + NODE_W / 2, y, b.x + NODE_W / 2, y),
    })
  }

  for (const p of petLines) {
    const a = pos.get(p.ownerId)
    const b = pos.get(p.petId)
    if (!a || !b) continue
    out.push({ kind: 'pet', subtype: 'pet', highlighted: isHighlighted(p.relationId), d: elbow(a, b) })
  }

  return out
}

/** Dash pattern per relation subtype — same table as the web's edge-style.ts. */
export function edgeDash(kind: EdgeKind, subtype: string): string | undefined {
  if (kind === 'parent') return subtype === 'adopted' ? '5 4' : subtype === 'step' ? '2 4' : undefined
  if (kind === 'spouse') {
    return subtype === 'divorced' ? '5 4' : subtype === 'partner' ? '1 4' : subtype === 'widowed' ? '1 6 4 6' : undefined
  }
  if (kind === 'sibling') return subtype === 'half' ? '5 4' : subtype === 'adopted' ? '1 3' : subtype === 'step' ? '2 4' : undefined
  return '1 3'
}
