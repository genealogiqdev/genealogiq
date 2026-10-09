import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@genealogiq/db"

export interface TreePerson {
  id:           string
  firstName:    string
  lastName:     string
  maidenName:   string | null
  nickname:     string | null
  gender:       string | null
  avatarUrl:    string | null
  birthDate:    Date | null
  birthPlace:   string | null
  birthCountry: string | null
  deathDate:    Date | null
  deathPlace:   string | null
  deathCountry: string | null
  /** Birth/death year, always populated regardless of redaction — the
   *  canonical source for year-only display everywhere in the UI. */
  birthYear:    number | null
  deathYear:    number | null
  /** Only populated for role="APP_PET". */
  petSpecies:   string | null
  petBreed:     string | null
  role:         string
  /** True when at least one relation touching this person is still PENDING and this person isn't the root. */
  pending:      boolean
}

export interface TreeViewer {
  /** null for an anonymous visitor. */
  id:        string | null
  /** True when the viewer manages the tree root (owner or accepted guardian). */
  canManage: boolean
}

export interface TreeRelation {
  id:        string
  type:      string
  subtype:   string | null
  fromId:    string
  toId:      string
  startDate: Date | null
  endDate:   Date | null
  status:    string
  requestedById: string | null
}

export interface TreePetOwnership {
  id:        string
  petId:     string
  ownerId:   string
  createdAt: Date
}

export interface FamilyTreeData {
  persons:       Record<string, TreePerson>
  relations:     TreeRelation[]
  petOwnerships: TreePetOwnership[]
}

const GENEALOGICAL_RELATION_TYPES = ["PARENT_OF", "SPOUSE", "SIBLING"] as const

export async function getFamilyTree(rootId: string, viewer: TreeViewer): Promise<FamilyTreeData> {
  // BFS the ACCEPTED tree only. A PENDING invite is a boundary edge: it is shown
  // (below) but never traversed THROUGH, so the invitee's own subtree is not
  // pulled in and exposed to the inviter before they accept.
  const discovered = new Set<string>([rootId])
  let frontier = [rootId]
  while (frontier.length > 0) {
    const rels = await prisma.familyRelation.findMany({
      where:  {
        type: { in: [...GENEALOGICAL_RELATION_TYPES] },
        status: "ACCEPTED",
        OR: [{ fromId: { in: frontier } }, { toId: { in: frontier } }],
      },
      select: { fromId: true, toId: true },
    })
    const next: string[] = []
    for (const r of rels) {
      if (!discovered.has(r.fromId)) { discovered.add(r.fromId); next.push(r.fromId) }
      if (!discovered.has(r.toId))   { discovered.add(r.toId);   next.push(r.toId) }
    }
    frontier = next
  }

  const ids = Array.from(discovered)

  // Every non-REJECTED relation touching an accepted member — this includes
  // boundary PENDING invites (accepted member ↔ not-yet-accepted invitee).
  const relations = await prisma.familyRelation.findMany({
    where:  {
      type: { in: [...GENEALOGICAL_RELATION_TYPES] },
      status: { not: "REJECTED" },
      OR: [{ fromId: { in: ids } }, { toId: { in: ids } }],
    },
    select: {
      id: true, type: true, subtype: true,
      fromId: true, toId: true,
      startDate: true, endDate: true,
      status: true, requestedById: true,
    },
  })

  // Render nodes = accepted members + the immediate endpoints of those relations
  // (the pending invitees). We never traversed through the invitees, so only
  // their own node renders (as pending), not their subtree.
  const personIds = new Set(ids)
  for (const r of relations) { personIds.add(r.fromId); personIds.add(r.toId) }

  // Pets are one-way attachments to already-discovered human members. Their
  // other owners are intentionally not traversed, so co-ownership cannot join
  // two unrelated family graphs or expand the authorization set.
  const petOwnerships = await prisma.petOwnership.findMany({
    where: { ownerId: { in: ids } },
    select: { id: true, petId: true, ownerId: true, createdAt: true },
    orderBy: [{ ownerId: "asc" }, { createdAt: "asc" }, { petId: "asc" }],
  })
  for (const ownership of petOwnerships) personIds.add(ownership.petId)

  const users = await prisma.appUser.findMany({
    where: { id: { in: Array.from(personIds) } },
    select: {
      id: true, firstName: true, lastName: true,
      maidenName: true, nickname: true,
      gender: true, avatarUrl: true,
      birthDate: true, birthPlace: true, birthCountry: true,
      deathDate: true, deathPlace: true, deathCountry: true,
      petSpecies: true, petBreed: true,
      role: true,
    },
  })

  // Mark people as pending when at least one relation touching them is PENDING
  // and they are not the root themselves.
  const pendingIds = new Set<string>()
  for (const r of relations) {
    if (r.status === "PENDING") {
      if (r.fromId !== rootId) pendingIds.add(r.fromId)
      if (r.toId !== rootId)   pendingIds.add(r.toId)
    }
  }

  // Living relatives (APP_USER) who aren't the viewer and aren't a tree
  // manager get their exact birth/death date+place redacted to year-only —
  // accepting a family-relation invite is consent to being linked into a
  // private-by-default family graph, not to public, unauthenticated broadcast
  // of an exact birthdate. Ghosts/memorials are never redacted — a memorial IS
  // the public-facing point of this feature. Photo stays visible either way.
  //
  // v1 scope: the redaction boundary is "manages the tree root", the same
  // granularity every other tree-mutation action already uses — not
  // per-person guardianship of the specific living relative. A future
  // per-person privacy control (opt-in/opt-out) would tighten this further.
  const redactedIds = new Set(
    users
      .filter((u) => u.role === "APP_USER" && u.id !== viewer.id && !viewer.canManage)
      .map((u) => u.id),
  )

  const persons: Record<string, TreePerson> = {}
  for (const u of users) {
    const isRedacted = redactedIds.has(u.id)
    persons[u.id] = {
      ...u,
      birthYear:    u.birthDate ? u.birthDate.getUTCFullYear() : null,
      deathYear:    u.deathDate ? u.deathDate.getUTCFullYear() : null,
      birthDate:    isRedacted ? null : u.birthDate,
      birthPlace:   isRedacted ? null : u.birthPlace,
      birthCountry: isRedacted ? null : u.birthCountry,
      deathDate:    isRedacted ? null : u.deathDate,
      deathPlace:   isRedacted ? null : u.deathPlace,
      deathCountry: isRedacted ? null : u.deathCountry,
      pending:      pendingIds.has(u.id),
    }
  }

  // A marriage date is at least as identity-correlating as a birthdate — strip
  // it too whenever either spouse is redacted, so it doesn't ride along in the
  // relations array while the person record itself is protected.
  const redactedRelations = relations.map((r) =>
    r.type === "SPOUSE" && (redactedIds.has(r.fromId) || redactedIds.has(r.toId))
      ? { ...r, startDate: null, endDate: null }
      : r,
  )

  return { persons, relations: redactedRelations, petOwnerships }
}

/**
 * The set of profiles genuinely in root's tree — used as the AUTHORIZATION /
 * membership gate. Traverses ACCEPTED edges ONLY: a PENDING invite must not pull
 * the invitee (or their subtree) in, otherwise a manager could (a) read a
 * stranger's relation graph by inviting them, and (b) self-anchor a PENDING edge
 * and then forge an auto-ACCEPTED second relation to that stranger.
 */
export async function getTreeMemberIds(
  rootId: string,
  db: Pick<Prisma.TransactionClient, "familyRelation"> = prisma,
): Promise<Set<string>> {
  const discovered = new Set<string>([rootId])
  let frontier = [rootId]
  while (frontier.length > 0) {
    const rels = await db.familyRelation.findMany({
      where:  {
        type: { in: [...GENEALOGICAL_RELATION_TYPES] },
        status: "ACCEPTED",
        OR: [{ fromId: { in: frontier } }, { toId: { in: frontier } }],
      },
      select: { fromId: true, toId: true },
    })
    const next: string[] = []
    for (const r of rels) {
      if (!discovered.has(r.fromId)) { discovered.add(r.fromId); next.push(r.fromId) }
      if (!discovered.has(r.toId))   { discovered.add(r.toId);   next.push(r.toId) }
    }
    frontier = next
  }
  return discovered
}

// Excludes APP_PET — pets consume their own separate `petsMax` quota, not
// `treeMaxMembers`.
export async function countTreeMembers(rootId: string): Promise<number> {
  const ids = await getTreeMemberIds(rootId)
  return prisma.appUser.count({
    where: { id: { in: Array.from(ids) }, role: { not: "APP_PET" } },
  })
}

/**
 * True when adding `candidateParentId` as a NEW parent of `candidateChildId`
 * would close an ancestry cycle — i.e. `candidateParentId` is already
 * reachable as a descendant of `candidateChildId` via existing ACCEPTED
 * PARENT_OF edges (fromId=parent → toId=child).
 */
export async function createsAncestryCycle(candidateParentId: string, candidateChildId: string): Promise<boolean> {
  if (candidateParentId === candidateChildId) return true
  const discovered = new Set<string>([candidateChildId])
  let frontier = [candidateChildId]
  while (frontier.length > 0) {
    const rels = await prisma.familyRelation.findMany({
      where:  { type: "PARENT_OF", status: "ACCEPTED", fromId: { in: frontier } },
      select: { toId: true },
    })
    const next: string[] = []
    for (const r of rels) {
      if (r.toId === candidateParentId) return true
      if (!discovered.has(r.toId)) { discovered.add(r.toId); next.push(r.toId) }
    }
    frontier = next
  }
  return false
}

/**
 * True when a non-REJECTED relation of a DIFFERENT type already exists
 * between these two people (e.g. blocks adding SPOUSE when they're already
 * SIBLING). Order-independent.
 */
export async function hasConflictingRelationType(idA: string, idB: string, type: string): Promise<boolean> {
  const existing = await prisma.familyRelation.findFirst({
    where: {
      type:   { not: type },
      status: { not: "REJECTED" },
      OR: [{ fromId: idA, toId: idB }, { fromId: idB, toId: idA }],
    },
    select: { id: true },
  })
  return !!existing
}
