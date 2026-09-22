// Family-tree layout — rewrite based on family-unit rigidity (Buchheim et al.
// 2002, adapted). The core insight: lay out every level as a sequence of
// FAMILY UNITS (couples + their children) rather than individual people. A
// family unit is the rigid block; we never sort across unit boundaries.
//
// Pipeline:
//   1. buildFamilyGraph(persons, relations)               (see ./family-units)
//   2. computeDescendantSubtree(rootId) — recursive, bottom-up:
//        returns subtree positions relative to the root's centerX,
//        plus the [leftX, rightX] extent. Subject's sibling row at gen=0 is
//        a *forest* of subtrees combined side-by-side.
//   3. computeAncestorSubtree(parentId, gen) — recursive, going up:
//        returns positions relative to the focal-parent centerX. Paternal
//        and maternal ancestor blocks flank the parent couple symmetrically.
//   4. Stitch the descendant forest + ancestor forest around the subject.
//   5. Build edge geometry arrays and bounds from the placed positions.
//
// Pedigree collapse (the same real person legitimately reachable via two
// distinct branches — e.g. a cousin marriage converging on a shared
// great-grandparent, or two cousins who marry each other) is handled by
// `DedupState`: the FIRST time a person is placed — as a focal descendant, a
// focal ancestor, or a SPOUSE card inside a couple slot — they get their
// real id as node id ("primary"); every subsequent placement, through any of
// those three paths, gets a synthetic occurrence id and renders as a leaf
// stub (no further recursion) — see `resolveOccurrence` below, the single
// choke point `dedup.placedAsPrimary` is written through. This is orthogonal
// to `visited`, which stays the pure recursion-termination guard it always
// was (a real ancestry cycle must still be prevented — the DB-layer cycle
// guard has a known PENDING-vs-PENDING blind spot, so this is not purely
// redundant with it). Ancestor-side duplicates additionally get a
// correctly-routed connecting edge via `dedup.parentEdgeOverrides` (see
// layoutAncestorSubtreeIndividual) — descendant-side duplicates (including
// spouse-card duplicates) are stubbed but their incoming edge is left to the
// default (primary-occurrence) resolution, a deliberate, documented v1 scope
// cut: the position-collision failure mode (mis-drawn edges) is
// architecturally only possible on the ancestor side (see the husband/wife
// split in layoutAncestorCoupleBlock), so that's where getting edge routing
// exactly right matters.
//
// User-driven collapse (`collapsedIds`, a computeLayout param) reuses this
// exact same "stub, don't recurse" shape — a collapsed occurrence renders
// its card but not its descendants/ancestors, same as a pedigree-collapse
// duplicate. It is orthogonal to `dedup`: a collapsed person still claims
// their real id as primary the first time they're placed. Not persisted —
// pure client view state, reset on reload (see family-tree-canvas.tsx).
//
// v1 limitations (out of scope here, documented for later upgrades):
//   - Extras at gen <= -2 (great-aunts/uncles, etc.) render as couple slots
//     only — their own descendants are not shown to keep deep generations
//     compact. gen=-1 aunts/uncles still render with their cousin subtree.
//   - Multi-marriage is supported for the subject (gen=0) and the subject's
//     parents (gen=-1) via half-blocks; deeper levels still fold non-primary
//     marriages into the active spouse.
//   - Half-siblings emerge naturally from per-unit `children` lists — the
//     SIBLING-line emitter still treats explicit cross-unit SIBLING relations
//     uniformly (no dashed-line distinction yet; that's a v2 polish).

import type { TreePerson, TreePetOwnership, TreeRelation } from "@/queries/family-tree"
import { buildFamilyGraph, type FamilyGraph, type FamilyUnit } from "./family-units"

// ─── Constants (unchanged from the previous layout) ─────────────────────────

export const NODE_W    = 168
export const NODE_H    = 72
export const Y_GEN     = 140
export const X_TIGHT   = 24   // gap inside a couple
export const X_SIBLING = 40   // gap between siblings of the same parents
export const X_FAMILY  = 64   // gap between unrelated family blocks at the same level
export const PET_GAP_X = 12   // horizontal gap between two pets stacked under the same owner(s)

// ─── Output types ────────────────────────────────────────────────────────────

export interface LaidNode {
  /** Node/occurrence id — unique. Equals `personId` for the first (primary)
   *  occurrence of a person; a synthetic `"<personId>~dupN"` for every
   *  subsequent occurrence (pedigree collapse). Use as React key / edge
   *  position-map key. */
  id:          string
  /** The real person id — always. Use this for persons[id] lookups,
   *  selection/session comparisons, and any mutation-layer call. */
  personId:    string
  /** True for every occurrence after the first — renders as a leaf stub
   *  (no further recursion into that person's own parents/children). */
  isDuplicate: boolean
  /** True when this occurrence has further content in `collapseDirection`
   *  (descendants if "down", ancestors if "up") that user-driven collapse
   *  can hide — regardless of whether it's currently collapsed. Always
   *  false for a duplicate. Lets the UI show a collapse/expand toggle only
   *  where there is something to toggle. */
  hasCollapsible:   boolean
  /** True when `hasCollapsible` content is currently hidden (this
   *  occurrence's id was in the `collapsedIds` passed to computeLayout). */
  isCollapsed:      boolean
  /** Which side collapsing this occurrence would hide — "down" for
   *  descendants, "up" for ancestors. Meaningless when !hasCollapsible. */
  collapseDirection: "up" | "down"
  x: number
  y: number
}

export interface ParentLineGeom {
  parentId:   string
  childId:    string
  subtype:    string
  /** The underlying TreeRelation.id — lets a caller (e.g. the relationship-
   *  path compare tool) highlight the exact edge a path traversed. */
  relationId: string
}

export interface CoupleLineGeom {
  aId:        string
  bId:        string
  subtype:    string
  endDate:    Date | null
  relationId: string
}

export interface SiblingLineGeom {
  aId:        string
  bId:        string
  subtype:    string
  relationId: string
}

export interface PetLineGeom {
  petId:      string
  ownerId:    string
  relationId: string
}

export interface LayoutResult {
  nodes:        LaidNode[]
  parentLines:  ParentLineGeom[]
  coupleLines:  CoupleLineGeom[]
  siblingLines: SiblingLineGeom[]
  petLines:     PetLineGeom[]
  bounds:       { minX: number; maxX: number; minY: number; maxY: number }
  generation:   Map<string, number>
}

// ─── Pedigree-collapse dedup state (one instance per computeLayout() call) ──

interface DedupState {
  /** Real person ids already placed once. Never cloned — shared across every
   *  recursive branch, including the husband/wife split, so a second branch
   *  reaching the same person is detected regardless of which branch got
   *  there first. */
  placedAsPrimary: Set<string>
  /** Allocates a unique synthetic occurrence id for a duplicate placement. */
  nextDupId: (personId: string) => string
  /** Ancestor-chain PARENT_OF edges that must connect to a specific
   *  (possibly-duplicate) occurrence rather than the default "whichever
   *  occurrence owns the bare real id" resolution. Keyed by
   *  `${realParentId}|${realChildId}`; only populated when the parent
   *  occurrence in question is itself a duplicate — the primary case is
   *  already correct via the default resolution. */
  parentEdgeOverrides: Map<string, string>
}

function createDedupState(): DedupState {
  const dupCounts = new Map<string, number>()
  return {
    placedAsPrimary: new Set<string>(),
    nextDupId: (personId: string) => {
      const n = (dupCounts.get(personId) ?? 0) + 1
      dupCounts.set(personId, n)
      return `${personId}~dup${n}`
    },
    parentEdgeOverrides: new Map<string, string>(),
  }
}

// ─── User-driven collapse (not persisted — pure client view state) ─────────

interface CollapseEntry {
  hasCollapsible:    boolean
  isCollapsed:       boolean
  collapseDirection: "up" | "down"
}

const NOT_COLLAPSIBLE: CollapseEntry = { hasCollapsible: false, isCollapsed: false, collapseDirection: "down" }

/** Keyed by occurrence (node) id, populated at the same recursive call sites
 *  that decide whether to descend further — see layoutDescendantSubtree /
 *  layoutAncestorSubtreeIndividual / layoutHalfMarriageBlock. */
type CollapseInfo = Map<string, CollapseEntry>

// ─── Block: a placed subtree, anchor at x=0 ─────────────────────────────────

interface PlacedPos { x: number; y: number; personId: string; isDuplicate: boolean }

interface Block {
  /** Node id → placed position + occurrence metadata, relative to the
   *  block's anchor (anchor.x = 0). */
  positions: Map<string, PlacedPos>
  /** Horizontal extent of the block (relative to anchor=0). */
  leftX:  number
  rightX: number
}

const emptyBlock = (): Block => ({ positions: new Map(), leftX: 0, rightX: 0 })

/** Translate every position in a block by `dx`. Mutates and returns. */
function shiftBlock(b: Block, dx: number): Block {
  for (const p of b.positions.values()) p.x += dx
  b.leftX  += dx
  b.rightX += dx
  return b
}

/** Merge `right` into `left` (assumes both have positions in the same coord space). */
function mergeBlocks(left: Block, right: Block): Block {
  for (const [id, pos] of right.positions.entries()) left.positions.set(id, pos)
  left.leftX  = Math.min(left.leftX,  right.leftX)
  left.rightX = Math.max(left.rightX, right.rightX)
  return left
}

/** Place `right` to the right of `left` with `gap`. Translates `right` accordingly. */
function placeRightOf(left: Block, right: Block, gap: number): Block {
  const dx = left.rightX + gap - right.leftX
  shiftBlock(right, dx)
  return mergeBlocks(left, right)
}

// ─── Couple slot (single person OR couple of 2) ─────────────────────────────

interface SlotCard {
  nodeId:      string
  personId:    string
  isDuplicate: boolean
}

interface CoupleSlot {
  /** Cards in left-to-right order — 1 or 2. */
  cards: SlotCard[]
  /** x of the LEFT card relative to the slot anchor. */
  leftCardX: number
  /** The "focal" person inside the couple (the one whose ancestors/descendants we follow). */
  focalId: string
  /** Width of the slot in pixels. */
  width: number
}

// Prefer the exact date; fall back to the (always-populated, redaction-safe)
// year so a redacted person still sorts by approximate age instead of
// always landing last.
function ageOf(persons: Record<string, TreePerson>, id: string): number {
  const p = persons[id]
  if (p?.birthDate) return p.birthDate.getTime()
  if (p?.birthYear) return Date.UTC(p.birthYear, 0, 1)
  return Number.POSITIVE_INFINITY
}

/** Single choke point for pedigree-collapse bookkeeping: the first placement
 *  of a person (through ANY path — focal descendant, focal ancestor, or
 *  spouse card) claims their real id; every later placement, through any
 *  path, is a duplicate and gets a synthetic occurrence id. Centralizing
 *  this means a person reached first as someone's spouse and later as a
 *  focal placement (or vice versa) is still caught correctly. */
function resolveOccurrence(personId: string, dedup: DedupState): SlotCard {
  const isDuplicate = dedup.placedAsPrimary.has(personId)
  if (!isDuplicate) dedup.placedAsPrimary.add(personId)
  return { nodeId: isDuplicate ? dedup.nextDupId(personId) : personId, personId, isDuplicate }
}

/** Build a couple slot for a focal person, ordered older-leftmost. Both the
 *  focal and spouse cards go through `resolveOccurrence` — either one may
 *  turn out to be a duplicate (already placed via a different branch), in
 *  which case that card renders as a stub instead of colliding with its
 *  earlier position. */
function buildCoupleSlot(
  focalId:  string,
  graph:    FamilyGraph,
  persons:  Record<string, TreePerson>,
  dedup:    DedupState,
  // If provided, force pairing with this specific spouse. Otherwise use the active spouse.
  forcedSpouseId?: string | null,
): CoupleSlot {
  const focalCard = resolveOccurrence(focalId, dedup)

  if (focalCard.isDuplicate) {
    return { cards: [focalCard], leftCardX: 0, focalId, width: NODE_W }
  }

  const spouseId = forcedSpouseId ?? graph.spouseOf.get(focalId) ?? null
  if (!spouseId || !persons[spouseId]) {
    return { cards: [focalCard], leftCardX: 0, focalId, width: NODE_W }
  }
  const spouseCard = resolveOccurrence(spouseId, dedup)
  const olderLeft = ageOf(persons, focalId) <= ageOf(persons, spouseId)
  const cards = olderLeft ? [focalCard, spouseCard] : [spouseCard, focalCard]
  return { cards, leftCardX: 0, focalId, width: 2 * NODE_W + X_TIGHT }
}

function slotToBlock(slot: CoupleSlot, gen: number): Block {
  const positions = new Map<string, PlacedPos>()
  let x = slot.leftCardX
  for (const card of slot.cards) {
    positions.set(card.nodeId, { x, y: gen * Y_GEN, personId: card.personId, isDuplicate: card.isDuplicate })
    x += NODE_W + X_TIGHT
  }
  return { positions, leftX: slot.leftCardX, rightX: slot.leftCardX + slot.width }
}

// ─── Descendant subtree ─────────────────────────────────────────────────────

/** Lay out a person and all their descendants. Returns a block anchored such
 *  that the focal person's card top-left is at x=0 inside the returned block.
 *  Children are placed centered under the focal couple. A duplicate
 *  occurrence (pedigree collapse) renders as a leaf stub — no children, and
 *  so does a user-collapsed one (`collapsedIds`), which reuses the exact
 *  same "stub, don't recurse" shape. */
function layoutDescendantSubtree(
  focalId:      string,
  graph:        FamilyGraph,
  persons:      Record<string, TreePerson>,
  gen:          number,
  visited:      Set<string>,
  dedup:        DedupState,
  collapsedIds: Set<string>,
  collapseInfo: CollapseInfo,
): Block {
  if (visited.has(focalId)) return emptyBlock()
  visited.add(focalId)

  const isDuplicate = dedup.placedAsPrimary.has(focalId)
  const slot      = buildCoupleSlot(focalId, graph, persons, dedup)
  const slotBlock = slotToBlock(slot, gen)

  const marriage = graph.marriageUnit.get(focalId)
  const hasKids  = !isDuplicate && !!marriage && marriage.children.length > 0
  const isCollapsed = hasKids && collapsedIds.has(focalId)
  const focalCard = slot.cards.find((c) => c.personId === focalId)
  if (focalCard) collapseInfo.set(focalCard.nodeId, { hasCollapsible: hasKids, isCollapsed, collapseDirection: "down" })

  if (isDuplicate || isCollapsed) return slotBlock
  if (!marriage || marriage.children.length === 0) return slotBlock

  // Build each child's subtree.
  const childBlocks: Block[] = []
  for (const childId of marriage.children) {
    if (visited.has(childId)) continue
    const cb = layoutDescendantSubtree(childId, graph, persons, gen + 1, visited, dedup, collapsedIds, collapseInfo)
    if (cb.positions.size === 0) continue
    childBlocks.push(cb)
  }
  if (childBlocks.length === 0) return slotBlock

  // Concatenate child blocks horizontally, X_SIBLING between siblings.
  // Each child block anchors at its focal (the child). We just chain them.
  let combined = childBlocks[0]
  for (let i = 1; i < childBlocks.length; i++) {
    combined = placeRightOf(combined, childBlocks[i], X_SIBLING)
  }

  // Center the focal couple over the children block's midpoint, OR put
  // children under the couple's center if the children are narrower.
  // The focal-couple slot's center is at slot.width / 2.
  const childrenMidX = (combined.leftX + combined.rightX) / 2
  const slotCenterX  = slot.width / 2

  // Shift to align slot.center with children.midX in a shared coordinate system.
  // Slot is positioned in slotBlock at [slot.leftCardX..slot.width].
  // We re-anchor: pick the focal couple's center as x=0 in the returned block.
  // Recompute:
  //   slotBlock currently has left=0, right=slot.width.
  //   We want slot.center at 0 → shift slotBlock by -slotCenterX.
  shiftBlock(slotBlock, -slotCenterX)
  //   combined currently has leftX..rightX with the first child's slot left at 0.
  //   We want combined.midX at 0 → shift by -childrenMidX.
  shiftBlock(combined, -childrenMidX)

  // Merge and return — both blocks are now centered on x=0.
  return mergeBlocks(slotBlock, combined)
}

// ─── Ancestor subtree ───────────────────────────────────────────────────────

/** Lay out the focal person + all their ancestors going UP. Returns a block
 *  anchored such that the focal's card top-left sits at x=0 (NOT centered on
 *  the couple — we anchor on the focal individual so the caller can stitch
 *  multiple branches under a couple precisely).
 *
 *  `viaChildId` is the real id of the person this ancestor is being placed
 *  AS A PARENT OF (always a primary occurrence — recursion never continues
 *  past a duplicate, see below). When this placement turns out to be a
 *  duplicate, we record a `parentEdgeOverrides` entry so the edge-building
 *  pass in computeLayout connects THIS specific relation to THIS specific
 *  occurrence instead of the default (primary) one — this is what fixes the
 *  "edge stretches to the wrong branch" manifestation of pedigree collapse. */
function layoutAncestorSubtreeIndividual(
  focalId:      string,
  graph:        FamilyGraph,
  persons:      Record<string, TreePerson>,
  gen:          number,
  visited:      Set<string>,
  dedup:        DedupState,
  viaChildId:   string,
  collapsedIds: Set<string>,
  collapseInfo: CollapseInfo,
): Block {
  if (visited.has(focalId)) return emptyBlock()
  visited.add(focalId)

  const card = resolveOccurrence(focalId, dedup)
  if (card.isDuplicate) dedup.parentEdgeOverrides.set(`${focalId}|${viaChildId}`, card.nodeId)

  const birth = graph.birthUnit.get(focalId)
  const hasParents = !card.isDuplicate && !!birth && birth.parents.length > 0
  const isCollapsed = hasParents && collapsedIds.has(focalId)
  collapseInfo.set(card.nodeId, { hasCollapsible: hasParents, isCollapsed, collapseDirection: "up" })

  // Focal-only slot (a single card; the couple is built one level down by the caller).
  const block = new Map<string, PlacedPos>()
  block.set(card.nodeId, { x: 0, y: gen * Y_GEN, personId: focalId, isDuplicate: card.isDuplicate })
  const focalBlock: Block = { positions: block, leftX: 0, rightX: NODE_W }

  if (card.isDuplicate || isCollapsed) return focalBlock
  if (!birth || birth.parents.length === 0) return focalBlock

  // Build the parents-couple block at gen-1.
  // parents are sorted by age in buildCoupleSlot semantics: older left.
  const parentsCoupleBlock = layoutAncestorCoupleBlock(
    birth.parents,
    graph,
    persons,
    gen - 1,
    visited,
    dedup,
    focalId,
    collapsedIds,
    collapseInfo,
  )

  // Center the parents block over the focal's card center.
  const focalCenterX = NODE_W / 2
  const parentsCenterX = (parentsCoupleBlock.leftX + parentsCoupleBlock.rightX) / 2
  shiftBlock(parentsCoupleBlock, focalCenterX - parentsCenterX)

  return mergeBlocks(focalBlock, parentsCoupleBlock)
}

/** Lay out a parents couple plus their ancestors. The couple's cards live at
 *  the given `gen`. The block anchors so that the couple's center is at x=0. */
function layoutAncestorCoupleBlock(
  parents:      string[],
  graph:        FamilyGraph,
  persons:      Record<string, TreePerson>,
  gen:          number,
  visited:      Set<string>,
  dedup:        DedupState,
  viaChildId:   string,
  collapsedIds: Set<string>,
  collapseInfo: CollapseInfo,
): Block {
  // Single parent — fall back to the individual case.
  if (parents.length === 1) {
    return layoutAncestorSubtreeIndividual(parents[0], graph, persons, gen, visited, dedup, viaChildId, collapsedIds, collapseInfo)
  }

  // Two parents: order older-leftmost.
  const [husbandId, wifeId] = parents[0] === parents[1]
    ? parents
    : (ageOf(persons, parents[0]) <= ageOf(persons, parents[1]) ? [parents[0], parents[1]] : [parents[1], parents[0]])

  // Recursively layout each parent's ancestor tree. Each returns a block
  // anchored on the parent's own card (top-left at x=0 in that block).
  // `visited` is cloned per side (unchanged from before this fix) so each
  // branch's recursion-termination bookkeeping is independent — but `dedup`
  // is NEVER cloned, so a person reached by both sides is correctly detected
  // as a duplicate on the second side, regardless of which side gets there
  // first.
  const husbandBlock = layoutAncestorSubtreeIndividual(husbandId, graph, persons, gen, new Set(visited), dedup, viaChildId, collapsedIds, collapseInfo)
  const wifeBlock    = layoutAncestorSubtreeIndividual(wifeId,    graph, persons, gen, new Set(visited), dedup, viaChildId, collapsedIds, collapseInfo)
  // Mark the actual parents as visited in the shared set to avoid loops elsewhere.
  visited.add(husbandId)
  visited.add(wifeId)

  // Position the two blocks so the husband's card is to the left of the wife's
  // card with X_TIGHT gap (couple connector). The husbandBlock's focal card
  // is at x=0 inside it; the wifeBlock similarly. We need:
  //   husbandCard.x = -NODE_W/2 - X_TIGHT/2   (couple center at x=0)
  //   wifeCard.x    =  NODE_W/2 + X_TIGHT/2
  // So shift husbandBlock so that the focal card's left edge ends at
  // -NODE_W - X_TIGHT/2, and the wifeBlock so its focal card's left edge is
  // at +X_TIGHT/2.

  const husbandTargetX = -(NODE_W + X_TIGHT / 2)   // top-left of husband's card
  const wifeTargetX    = X_TIGHT / 2                // top-left of wife's card

  // Current focal x in each block is 0.
  shiftBlock(husbandBlock, husbandTargetX)
  shiftBlock(wifeBlock,    wifeTargetX)

  // If the two blocks overlap (husband's rightX > wife's leftX), push them
  // outward symmetrically.
  const overlap = husbandBlock.rightX + X_FAMILY - wifeBlock.leftX
  if (overlap > 0) {
    const half = overlap / 2
    shiftBlock(husbandBlock, -half)
    shiftBlock(wifeBlock,     half)
  }

  return mergeBlocks(husbandBlock, wifeBlock)
}

// ─── Half-marriage block ────────────────────────────────────────────────────
//
// Used when a person has more than one marriage. The "primary" marriage is
// rendered by layoutDescendantSubtree (active spouse + children below). For
// every NON-primary marriage we emit a half-block: just the OTHER spouse at
// `gen` plus their joint children at gen+1, rendered as full descendant
// subtrees. The block anchors with the other spouse's card at x=0, and the
// children are centered under that card. The couple connector itself, and the
// PARENT_OF lines from the central person to the half-children, are drawn by
// the edge pass at the end.

function layoutHalfMarriageBlock(
  otherSpouseId: string,
  unit:          FamilyUnit,
  gen:           number,
  graph:         FamilyGraph,
  persons:       Record<string, TreePerson>,
  visited:       Set<string>,
  dedup:         DedupState,
  collapsedIds:  Set<string>,
  collapseInfo:  CollapseInfo,
): Block {
  if (visited.has(otherSpouseId)) return emptyBlock()
  visited.add(otherSpouseId)

  const card = resolveOccurrence(otherSpouseId, dedup)
  const hasKids = !card.isDuplicate && unit.children.length > 0
  const isCollapsed = hasKids && collapsedIds.has(otherSpouseId)
  collapseInfo.set(card.nodeId, { hasCollapsible: hasKids, isCollapsed, collapseDirection: "down" })

  const positions = new Map<string, PlacedPos>()
  positions.set(card.nodeId, { x: 0, y: gen * Y_GEN, personId: otherSpouseId, isDuplicate: card.isDuplicate })
  const block: Block = { positions, leftX: 0, rightX: NODE_W }

  if (card.isDuplicate || isCollapsed) return block
  if (unit.children.length === 0) return block

  const childBlocks: Block[] = []
  for (const childId of unit.children) {
    const cb = layoutDescendantSubtree(childId, graph, persons, gen + 1, visited, dedup, collapsedIds, collapseInfo)
    if (cb.positions.size > 0) childBlocks.push(cb)
  }
  if (childBlocks.length === 0) return block

  let kids = childBlocks[0]
  for (let i = 1; i < childBlocks.length; i++) {
    kids = placeRightOf(kids, childBlocks[i], X_SIBLING)
  }
  const childrenMidX = (kids.leftX + kids.rightX) / 2
  shiftBlock(kids, NODE_W / 2 - childrenMidX)

  return mergeBlocks(block, kids)
}

// ─── Top-level orchestration ────────────────────────────────────────────────

export function computeLayout(
  persons:      Record<string, TreePerson>,
  relations:    TreeRelation[],
  rootId:       string,
  // User-driven, not persisted — see the module-level v1-limitations note.
  collapsedIds: Set<string> = new Set(),
  petOwnerships: TreePetOwnership[] = [],
): LayoutResult {
  const graph = buildFamilyGraph(persons, relations)
  const dedup = createDedupState()
  const collapseInfo: CollapseInfo = new Map()

  // BFS to derive `generation` (still useful for downstream consumers + ancestor
  // tree-header stats). Same rule as before: parent = -1, child = +1, spouse/sibling = 0.
  const generation = new Map<string, number>()
  if (persons[rootId]) {
    generation.set(rootId, 0)
    const queue: string[] = [rootId]
    while (queue.length > 0) {
      const id = queue.shift()!
      const gen = generation.get(id)!
      const bu = graph.birthUnit.get(id)
      if (bu) for (const p of bu.parents) if (!generation.has(p)) { generation.set(p, gen - 1); queue.push(p) }
      const mu = graph.marriageUnit.get(id)
      if (mu) for (const c of mu.children) if (!generation.has(c)) { generation.set(c, gen + 1); queue.push(c) }
      const sp = graph.spouseOf.get(id)
      if (sp && !generation.has(sp)) { generation.set(sp, gen); queue.push(sp) }
      const sibs = graph.siblingsOf.get(id) ?? []
      for (const s of sibs) if (!generation.has(s)) { generation.set(s, gen); queue.push(s) }
    }
  }

  // 1. Descendant subtree from the subject.
  const visited = new Set<string>()
  const descendantBlock = layoutDescendantSubtree(rootId, graph, persons, 0, visited, dedup, collapsedIds, collapseInfo)

  // The descendant block anchors on the subject's couple center at x=0.
  // We'll keep that as the global origin (subject couple center at x=0, y=0).

  // 2. Sibling row at gen=0: subject's siblings (with their spouses), age-sorted.
  //    Distribute across the descendant block:
  //      - siblings older than subject → place LEFT of the descendant block
  //      - siblings younger than subject → place RIGHT
  const siblings = (graph.siblingsOf.get(rootId) ?? [])
    .filter((id) => persons[id])
    .sort((a, b) => ageOf(persons, a) - ageOf(persons, b))
  const subjectAge = ageOf(persons, rootId)

  let combined = descendantBlock

  // 1b. Subject's OTHER marriages → render each other spouse + their children
  //     as a half-block adjacent to the primary couple, on the side opposite
  //     to the primary spouse. Subject's full siblings (step 2) will then sit
  //     beyond the half-marriages.
  const subjectMarriages = graph.marriageUnits.get(rootId) ?? []
  const subjectPrimary   = graph.marriageUnit.get(rootId) ?? null
  const subjectOthers    = subjectMarriages.filter((u) => u !== subjectPrimary)
  if (subjectOthers.length > 0) {
    const primarySpouseId  = subjectPrimary?.parents.find((p) => p !== rootId)
    const primarySpousePos = primarySpouseId ? combined.positions.get(primarySpouseId) : null
    const focalPos         = combined.positions.get(rootId)
    // If primary spouse sits on the RIGHT (focal older), others go LEFT, and
    // vice versa. Default LEFT when there's no primary spouse to compare.
    const othersOnLeft = primarySpousePos && focalPos
      ? primarySpousePos.x > focalPos.x
      : true
    for (const unit of subjectOthers) {
      const otherSpouseId = unit.parents.find((p) => p !== rootId)
      if (!otherSpouseId) continue
      const halfBlock = layoutHalfMarriageBlock(otherSpouseId, unit, 0, graph, persons, visited, dedup, collapsedIds, collapseInfo)
      if (halfBlock.positions.size === 0) continue
      if (othersOnLeft) {
        const dx = combined.leftX - X_FAMILY - halfBlock.rightX
        shiftBlock(halfBlock, dx)
        combined = mergeBlocks(combined, halfBlock)
      } else {
        combined = placeRightOf(combined, halfBlock, X_FAMILY)
      }
    }
  }

  // Older siblings (left of subject)
  for (let i = siblings.length - 1; i >= 0; i--) {
    const sib = siblings[i]
    if (ageOf(persons, sib) > subjectAge) continue
    const sibBlock = layoutDescendantSubtree(sib, graph, persons, 0, visited, dedup, collapsedIds, collapseInfo)
    if (sibBlock.positions.size === 0) continue
    // Place sibBlock LEFT of combined with X_FAMILY gap.
    const dx = combined.leftX - X_FAMILY - sibBlock.rightX
    shiftBlock(sibBlock, dx)
    combined = mergeBlocks(combined, sibBlock)
  }
  // Younger siblings (right of subject)
  for (const sib of siblings) {
    if (ageOf(persons, sib) <= subjectAge) continue
    const sibBlock = layoutDescendantSubtree(sib, graph, persons, 0, visited, dedup, collapsedIds, collapseInfo)
    if (sibBlock.positions.size === 0) continue
    combined = placeRightOf(combined, sibBlock, X_FAMILY)
  }

  // 3. Ancestor side: subject's parents couple + their ancestors.
  const subjectBirth = graph.birthUnit.get(rootId)
  if (subjectBirth && subjectBirth.parents.length > 0) {
    const parentsBlock = layoutAncestorCoupleBlock(subjectBirth.parents, graph, persons, -1, visited, dedup, rootId, collapsedIds, collapseInfo)
    // The parents block is anchored on the parents-couple center at x=0.
    // We want to center it over the SUBJECT's birth-family sibling row — i.e.
    // the midpoint of subject + subject's siblings. That's the midpoint of the
    // combined block we've built so far for gen=0.
    // For now, simpler: center over the subject couple's center (x=0).
    // This means the parents couple is centered above the subject couple.
    // If subject has siblings, they extend to the side; the parents stay above
    // the subject. This matches the user's "subject is the focus" convention.
    combined = mergeBlocks(combined, parentsBlock)

    // 3b. Parents' OTHER marriages → subject's half-siblings. For each parent
    //     in the central couple, render any non-subjectBirth marriage as a
    //     half-block (other spouse at gen=-1 + their joint children at gen=0)
    //     placed adjacent to the parent on the outer side.
    for (const parentId of subjectBirth.parents) {
      const allMarriages = graph.marriageUnits.get(parentId) ?? []
      const otherUnits   = allMarriages.filter((u) => u !== subjectBirth)
      if (otherUnits.length === 0) continue
      const partnerInCouple = subjectBirth.parents.find((p) => p !== parentId)
      const parentPos  = combined.positions.get(parentId)
      const partnerPos = partnerInCouple ? combined.positions.get(partnerInCouple) : null
      const onLeft = parentPos && partnerPos
        ? parentPos.x < partnerPos.x
        : true
      for (const unit of otherUnits) {
        const otherSpouseId = unit.parents.find((p) => p !== parentId)
        if (!otherSpouseId) continue
        const halfBlock = layoutHalfMarriageBlock(otherSpouseId, unit, -1, graph, persons, visited, dedup, collapsedIds, collapseInfo)
        if (halfBlock.positions.size === 0) continue
        if (onLeft) {
          const dx = combined.leftX - X_FAMILY - halfBlock.rightX
          shiftBlock(halfBlock, dx)
          combined = mergeBlocks(combined, halfBlock)
        } else {
          combined = placeRightOf(combined, halfBlock, X_FAMILY)
        }
      }
    }

    // Add gen=-1 sibling row (aunts/uncles): siblings of each parent that are
    // NOT in the central couple. Each extra renders its full descendant
    // subtree, so subject's cousins appear at gen=0 under their aunt/uncle.
    for (const parentId of subjectBirth.parents) {
      const auntsUncles = (graph.siblingsOf.get(parentId) ?? []).filter((id) => persons[id])
      const partnerInCouple = subjectBirth.parents.find((p) => p !== parentId)
      // Decide which side this extra lives on:
      //   parent is on the LEFT of the couple → siblings extend further LEFT
      //   parent is on the RIGHT of the couple → siblings extend further RIGHT
      const parentPos = combined.positions.get(parentId)
      const partnerPos = partnerInCouple ? combined.positions.get(partnerInCouple) : null
      const onLeft = parentPos && partnerPos
        ? parentPos.x < partnerPos.x
        : true   // default left if single parent
      // Sort the extras by age (oldest first).
      auntsUncles.sort((a, b) => ageOf(persons, a) - ageOf(persons, b))
      // When extras live on the LEFT we want the oldest furthest from the parent
      // couple, so iterate youngest-first (and prepend to the left repeatedly).
      const iterOrder = onLeft ? [...auntsUncles].reverse() : auntsUncles

      for (const auId of iterOrder) {
        if (visited.has(auId)) continue
        const auBlock = layoutDescendantSubtree(auId, graph, persons, -1, visited, dedup, collapsedIds, collapseInfo)
        if (auBlock.positions.size === 0) continue
        if (onLeft) {
          const dx = combined.leftX - X_FAMILY - auBlock.rightX
          shiftBlock(auBlock, dx)
          combined = mergeBlocks(combined, auBlock)
        } else {
          combined = placeRightOf(combined, auBlock, X_FAMILY)
        }
        const sp = graph.spouseOf.get(auId)
        if (sp) visited.add(sp)
      }
    }

    // Add extras at gen <= -2 (great-aunts/uncles and deeper). Each extra is
    // rendered as a couple slot only — no descendants — to keep deep branches
    // compact and avoid pulling cousins-of-grandparents into the subject row.
    // Side is decided per-ancestor by x sign: x<0 → paternal/left, x>=0 → maternal/right.
    // Duplicate (pedigree-collapse stub) entries are excluded from this
    // collateral-sibling discovery pass — a stub is a leaf by construction,
    // and `graph.siblingsOf` is keyed by real person ids, not occurrence ids.
    const ancestorsByGen = new Map<number, string[]>()
    for (const [, pos] of combined.positions.entries()) {
      if (pos.isDuplicate) continue
      const g = Math.round(pos.y / Y_GEN)
      if (g > -2) continue
      const arr = ancestorsByGen.get(g) ?? []
      arr.push(pos.personId)
      ancestorsByGen.set(g, arr)
    }
    const ancestorGens = Array.from(ancestorsByGen.keys()).sort((a, b) => b - a)   // -2, -3, ...
    for (const g of ancestorGens) {
      const ancIds = ancestorsByGen.get(g)!
      // Process left-side ancestors first (paternal column), then right-side.
      // Within a side, iterate by x to keep placement deterministic: the
      // ancestor closer to the centre is processed first so its siblings land
      // adjacent to it, and farther-out ancestors push beyond.
      const onLeft  = ancIds.filter((id) => (combined.positions.get(id)!.x) <  0)
                            .sort((a, b) => (combined.positions.get(b)!.x) - (combined.positions.get(a)!.x))
      const onRight = ancIds.filter((id) => (combined.positions.get(id)!.x) >= 0)
                            .sort((a, b) => (combined.positions.get(a)!.x) - (combined.positions.get(b)!.x))

      for (const ancId of onLeft) {
        const sibs = (graph.siblingsOf.get(ancId) ?? []).filter((id) => persons[id])
        sibs.sort((a, b) => ageOf(persons, a) - ageOf(persons, b))
        // Place oldest furthest from focal by iterating youngest-first.
        for (const sibId of [...sibs].reverse()) {
          if (visited.has(sibId)) continue
          const slot = buildCoupleSlot(sibId, graph, persons, dedup)
          const slotBlock = slotToBlock(slot, g)
          const dx = combined.leftX - X_SIBLING - slotBlock.rightX
          shiftBlock(slotBlock, dx)
          combined = mergeBlocks(combined, slotBlock)
          visited.add(sibId)
          const sp = graph.spouseOf.get(sibId)
          if (sp) visited.add(sp)
        }
      }
      for (const ancId of onRight) {
        const sibs = (graph.siblingsOf.get(ancId) ?? []).filter((id) => persons[id])
        sibs.sort((a, b) => ageOf(persons, a) - ageOf(persons, b))
        for (const sibId of sibs) {
          if (visited.has(sibId)) continue
          const slot = buildCoupleSlot(sibId, graph, persons, dedup)
          const slotBlock = slotToBlock(slot, g)
          combined = placeRightOf(combined, slotBlock, X_SIBLING)
          visited.add(sibId)
          const sp = graph.spouseOf.get(sibId)
          if (sp) visited.add(sp)
        }
      }
    }
  }

  // 4. Build LaidNode[] + bounds.
  const nodes: LaidNode[] = []
  let minX =  Infinity, maxX = -Infinity, minY =  Infinity, maxY = -Infinity
  for (const [id, p] of combined.positions.entries()) {
    const collapse = collapseInfo.get(id) ?? NOT_COLLAPSIBLE
    nodes.push({
      id, personId: p.personId, isDuplicate: p.isDuplicate, x: p.x, y: p.y,
      hasCollapsible: collapse.hasCollapsible, isCollapsed: collapse.isCollapsed, collapseDirection: collapse.collapseDirection,
    })
    if (p.x         < minX) minX = p.x
    if (p.x + NODE_W > maxX) maxX = p.x + NODE_W
    if (p.y         < minY) minY = p.y
    if (p.y + NODE_H > maxY) maxY = p.y + NODE_H
  }
  if (!Number.isFinite(minX)) { minX = 0; maxX = NODE_W; minY = 0; maxY = NODE_H }

  // 4b. Attach pets to their owner(s) as a separate domain edge. Pets never
  // enter buildFamilyGraph and therefore can neither gain ancestors nor join
  // co-owners' genealogies.
  const petLines: PetLineGeom[] = []
  const posByPersonId = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    const existing = posByPersonId.get(n.personId)
    if (!existing || !n.isDuplicate) posByPersonId.set(n.personId, { x: n.x, y: n.y })
  }

  const petOwnerRows = new Map<string, { ownerId: string; relationId: string }[]>()
  for (const ownership of petOwnerships) {
    const arr = petOwnerRows.get(ownership.petId) ?? []
    arr.push({ ownerId: ownership.ownerId, relationId: ownership.id })
    petOwnerRows.set(ownership.petId, arr)
  }

  // Group pets by the exact set of their PRESENT owners so co-owned pets
  // (and multiple pets of the same owner) stack together under one anchor.
  const petsByOwnerGroup = new Map<string, { ownerIds: string[]; petIds: string[] }>()
  for (const [petId, ownerRows] of petOwnerRows.entries()) {
    if (!persons[petId]) continue
    const presentOwnerRows = ownerRows.filter((o) => posByPersonId.has(o.ownerId))
    if (presentOwnerRows.length === 0) continue
    const presentOwnerIds = presentOwnerRows.map((o) => o.ownerId)
    const key = [...presentOwnerIds].sort().join("|")
    const group = petsByOwnerGroup.get(key) ?? { ownerIds: presentOwnerIds, petIds: [] }
    group.petIds.push(petId)
    petsByOwnerGroup.set(key, group)
    for (const o of presentOwnerRows) {
      petLines.push({ petId, ownerId: o.ownerId, relationId: o.relationId })
    }
  }

  const ownerGroups = Array.from(petsByOwnerGroup.values())
    .sort((a, b) => [...a.ownerIds].sort().join("|").localeCompare([...b.ownerIds].sort().join("|")))
  for (const { ownerIds, petIds: unsortedPetIds } of ownerGroups) {
    const petIds = [...unsortedPetIds].sort()
    const ownerPositions = ownerIds.map((id) => posByPersonId.get(id)!)
    const anchorX = ownerPositions.reduce((sum, p) => sum + p.x + NODE_W / 2, 0) / ownerPositions.length
    const anchorY = Math.max(...ownerPositions.map((p) => p.y))
    // Use the next row and shift the whole pet group to the first free
    // horizontal slot. This avoids the old between-row placement overlapping
    // human child cards.
    const petY = anchorY + Y_GEN
    const totalWidth = petIds.length * NODE_W + (petIds.length - 1) * PET_GAP_X
    let petX = anchorX - totalWidth / 2
    const collidingNodes = nodes
      .filter((node) => node.y < petY + NODE_H && node.y + NODE_H > petY)
      .sort((a, b) => a.x - b.x)
    while (collidingNodes.some((node) => petX < node.x + NODE_W + PET_GAP_X && petX + totalWidth + PET_GAP_X > node.x)) {
      petX = Math.max(...collidingNodes.map((node) => node.x + NODE_W)) + PET_GAP_X
    }
    for (const petId of petIds) {
      nodes.push({
        id: petId, personId: petId, isDuplicate: false, x: petX, y: petY,
        hasCollapsible: false, isCollapsed: false, collapseDirection: "down",
      })
      if (petX          < minX) minX = petX
      if (petX + NODE_W  > maxX) maxX = petX + NODE_W
      if (petY           < minY) minY = petY
      if (petY + NODE_H  > maxY) maxY = petY + NODE_H
      petX += NODE_W + PET_GAP_X
    }
  }

  // 5. Edge geometry — derived from raw relations, same shape as the old layout.
  // PARENT_OF edges consult `dedup.parentEdgeOverrides` so a relation whose
  // parent occurrence was placed as a pedigree-collapse duplicate connects to
  // THAT occurrence rather than the (visually distant) primary one — see the
  // module-level comment and layoutAncestorSubtreeIndividual for why this is
  // only needed (and only populated) on the ancestor side.
  const parentLines:  ParentLineGeom[]  = []
  const coupleLines:  CoupleLineGeom[]  = []
  const siblingLines: SiblingLineGeom[] = []
  const sharedParents = (a: string, b: string): boolean => {
    const pa = graph.birthUnit.get(a)
    const pb = graph.birthUnit.get(b)
    return !!pa && pa === pb
  }
  for (const r of relations) {
    if (r.status === "REJECTED") continue
    if (r.type === "PARENT_OF") {
      const overrideNodeId = dedup.parentEdgeOverrides.get(`${r.fromId}|${r.toId}`)
      parentLines.push({ parentId: overrideNodeId ?? r.fromId, childId: r.toId, subtype: r.subtype ?? "blood", relationId: r.id })
    } else if (r.type === "SPOUSE") {
      coupleLines.push({ aId: r.fromId, bId: r.toId, subtype: r.subtype ?? "married", endDate: r.endDate, relationId: r.id })
    } else if (r.type === "SIBLING") {
      // Only emit a SIBLING line when the two people don't share a parent in
      // the tree (the parent-line T-junction would otherwise convey it).
      if (!sharedParents(r.fromId, r.toId)) {
        siblingLines.push({ aId: r.fromId, bId: r.toId, subtype: r.subtype ?? "blood", relationId: r.id })
      }
    }
  }

  return {
    nodes,
    parentLines,
    coupleLines,
    siblingLines,
    petLines,
    bounds: { minX, maxX, minY, maxY },
    generation,
  }
}

/** Layer saved drag-to-reposition offsets on top of a computed layout. A
 *  duplicate (pedigree-collapse stub) is never offset — its position is
 *  fully determined by the primary occurrence it stands in for. An override
 *  whose snapshotted `generation` no longer matches the live layout is
 *  stale (a relation change reshaped the tree since it was saved) and is
 *  ignored, rather than misplacing the node relative to its now-different
 *  family unit. */
export function applyPositionOverrides(
  nodes: LaidNode[],
  overrides: Record<string, { dx: number; dy: number; generation: number }>,
  generation: Map<string, number>,
): LaidNode[] {
  return nodes.map((n) => {
    if (n.isDuplicate) return n
    const override = overrides[n.personId]
    if (!override || override.generation !== generation.get(n.personId)) return n
    return { ...n, x: n.x + override.dx, y: n.y + override.dy }
  })
}
