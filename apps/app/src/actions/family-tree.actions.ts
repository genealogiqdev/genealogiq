"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { done, fail, type ActionResult } from "@genealogiq/core"
import { Prisma } from "@genealogiq/db"
import { checkRateLimit } from "@genealogiq/services/rate-limit"
import { isAuthorizedMediaReference } from "@genealogiq/services/media-storage"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/dal"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { getMemorialFeatures } from "@/lib/subscription"
import { exceedsQuota } from "@/lib/quota"
import {
  countTreeMembers,
  getTreeMemberIds,
  createsAncestryCycle,
  hasConflictingRelationType,
} from "@/queries/family-tree"
import {
  getAddRelationSchema,
  getAddGhostRelativeSchema,
  getUpdateMemberSchema,
  getUpdateRelationSchema,
} from "@/schemas/family-tree.schema"
import { identityTranslator } from "@/schemas/i18n"
import { notify } from "@/lib/notifications"
import { deleteBlobs } from "@/lib/blob"

function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
}

type RelationType = "PARENT_OF" | "SPOUSE" | "SIBLING"

function normalizePair(type: RelationType, fromId: string, toId: string): [string, string] {
  if ((type === "SPOUSE" || type === "SIBLING") && fromId > toId) return [toId, fromId]
  return [fromId, toId]
}

function toDate(s: string | null | undefined): Date | null {
  return s ? new Date(s) : null
}

/**
 * Whether the caller may edit/delete a given relation by id. Membership is
 * ACCEPTED-only (getTreeMemberIds), so a pending invite's endpoint isn't a
 * member yet — but the sender must still be able to edit/withdraw the invite
 * they created, hence the second clause.
 */
function canManageRelation(
  relation: { fromId: string; toId: string; status: string; requestedById: string | null },
  memberIds: Set<string>,
  actorId: string,
): boolean {
  if (memberIds.has(relation.fromId) && memberIds.has(relation.toId)) return true
  return (
    relation.status === "PENDING" &&
    relation.requestedById === actorId &&
    (memberIds.has(relation.fromId) || memberIds.has(relation.toId))
  )
}

// ─── addRelation ─────────────────────────────────────────────────────────────

export async function addRelation(rootId: string, data: unknown): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(rootId)
  if (!profile || profile.role === "APP_PET" || !canManageProfile(profile, session.user.id)) {
    return fail(t("familyTree.notAuthorized"))
  }

  const limit = await checkRateLimit({ key: `family-tree:add:${session.user.id}`, maxAttempts: 60, windowSeconds: 3600 })
  if (!limit.allowed) return fail(t("familyTree.tooManyRequests"))

  const parsed = getAddRelationSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const { fromId, toId, type, subtype, startDate, endDate, linkSpouseId } = parsed.data

  if (fromId === toId) return fail(t("familyTree.cannotRelateSelf"))

  const [from, to] = await Promise.all([
    prisma.appUser.findUnique({ where: { id: fromId }, select: { id: true, role: true } }),
    prisma.appUser.findUnique({ where: { id: toId },   select: { id: true, role: true } }),
  ])
  if (!from || !to) return fail(t("familyTree.profileNotFound"))
  if (from.role === "APP_PET" || to.role === "APP_PET") {
    return fail(t("familyTree.notAuthorized"))
  }

  // IDOR guard (mirrors updateRelation/removeRelation): the relation must be
  // anchored to the caller's tree, and any endpoint outside it may only be a
  // real APP_USER — who is then consent-gated below. A ghost/memorial or a
  // stranger that isn't in root's reachable tree cannot be wired in by id.
  const treeIds = await getTreeMemberIds(rootId)
  const fromInTree = treeIds.has(fromId)
  const toInTree = treeIds.has(toId)
  if (!fromInTree && !toInTree) return fail(t("familyTree.notAuthorized"))
  const outsiderId = !fromInTree ? fromId : !toInTree ? toId : null
  const outsiderRole = !fromInTree ? from.role : !toInTree ? to.role : null
  if (outsiderId && outsiderRole !== "APP_USER") {
    return fail(t("familyTree.notAuthorized"))
  }
  // linkSpouseId forges a second (ACCEPTED) SPOUSE relation below — it must be
  // an existing member of the tree, never an arbitrary stranger by id.
  if (linkSpouseId && !treeIds.has(linkSpouseId)) return fail(t("familyTree.notAuthorized"))

  // Tier limit (only enforced when the tree would grow).
  const features = await getMemorialFeatures(rootId)
  const memberCount = await countTreeMembers(rootId)
  const relExists = await prisma.familyRelation.findFirst({
    where: { OR: [
      { fromId, toId: rootId }, { fromId: rootId, toId },
      { toId,   fromId: rootId }, { toId: rootId, fromId },
    ] },
    select: { id: true },
  })
  const involvesNew = !relExists && (fromId !== rootId && toId !== rootId)
  // Grandfathered: a tree grown under a richer plan is not frozen solid when
  // the plan lapses — it just stops growing. See lib/quota.ts.
  if (involvesNew && exceedsQuota(memberCount + 1, features.treeMaxMembers, memberCount)) {
    return fail(t("familyTree.treeLimitReached", { limit: features.treeMaxMembers }))
  }

  // Consent: an endpoint OUTSIDE the tree is a real APP_USER being invited (the
  // guard above guarantees the role) and must accept before the relation is
  // active. Gated on tree MEMBERSHIP, not on rootId — otherwise an invite
  // anchored to a non-root tree member would be silently ACCEPTED, forging a
  // relation against (and exposing the subtree of) a non-consenting stranger.
  const needsConsent = !!outsiderId && outsiderId !== session.user.id

  const [normFrom, normTo] = normalizePair(type, fromId, toId)

  // Default subtype: SPOUSE always implies "married" unless overridden;
  // PARENT_OF / SIBLING use null to mean a regular blood relation.
  const finalSubtype = subtype ?? (type === "SPOUSE" ? "married" : null)

  if (type === "PARENT_OF" && (await createsAncestryCycle(fromId, toId))) {
    return fail(t("familyTree.relationCycle"))
  }
  if (await hasConflictingRelationType(fromId, toId, type)) {
    return fail(t("familyTree.conflictingRelationType"))
  }

  const relationData = {
    subtype:       finalSubtype,
    startDate:     toDate(startDate),
    endDate:       toDate(endDate),
    status:        needsConsent ? "PENDING" : "ACCEPTED",
    requestedById: needsConsent ? session.user.id : null,
  }

  // A REJECTED relation keeps its row (rejectFamilyRequest preserves it for
  // the audit trail + linked notifications) instead of being deleted — but
  // @@unique([fromId, toId, type]) doesn't know about status, so a blind
  // create() would hit that same row's constraint on every retry, even
  // though REJECTED relations are filtered out of every read path and so
  // look, from the tree UI, like they were never sent. Revive the existing
  // row instead of inserting a new one when that's the case; a genuine
  // PENDING/ACCEPTED duplicate still fails as before.
  const existingRelation = await prisma.familyRelation.findUnique({
    where:  { fromId_toId_type: { fromId: normFrom, toId: normTo, type } },
    select: { id: true, status: true },
  })

  let createdRelationId: string
  if (existingRelation) {
    if (existingRelation.status !== "REJECTED") return fail(t("familyTree.relationExists"))
    const revived = await prisma.familyRelation.update({
      where:  { id: existingRelation.id },
      data:   relationData,
      select: { id: true },
    })
    createdRelationId = revived.id
  } else {
    try {
      const created = await prisma.familyRelation.create({
        data:   { fromId: normFrom, toId: normTo, type, ...relationData },
        select: { id: true },
      })
      createdRelationId = created.id
    } catch (e) {
      if (isUniqueConstraintError(e)) return fail(t("familyTree.relationExists"))
      throw e
    }
  }

  if (needsConsent && outsiderId) {
    await notify({
      type:             "FAMILY_REQUEST_PENDING",
      userId:           outsiderId,
      actorId:          session.user.id,
      familyRelationId: createdRelationId,
    })
  }

  // Optional spouse link: when adding a 2nd parent and the UI says they're
  // married to the existing parent, create the SPOUSE relation in one go. Only
  // when the new parent (fromId) is itself an in-tree member — otherwise it's an
  // outside APP_USER pending consent, and we must not forge an ACCEPTED marriage
  // for them; the spouse link can be added once they accept.
  if (linkSpouseId && type === "PARENT_OF" && fromInTree) {
    // The new parent is fromId (PARENT_OF: parent → child).
    const newParentId = fromId
    if (newParentId !== linkSpouseId && !(await hasConflictingRelationType(newParentId, linkSpouseId, "SPOUSE"))) {
      const [a, b] = normalizePair("SPOUSE", newParentId, linkSpouseId)
      // Same REJECTED-revival as the main relation above — an earlier,
      // unrelated SPOUSE proposal between these two that got rejected must
      // not silently block this in-tree, no-consent-needed auto-link forever.
      const existingSpouseRelation = await prisma.familyRelation.findUnique({
        where:  { fromId_toId_type: { fromId: a, toId: b, type: "SPOUSE" } },
        select: { id: true, status: true },
      })
      if (!existingSpouseRelation) {
        try {
          await prisma.familyRelation.create({
            data: { fromId: a, toId: b, type: "SPOUSE", subtype: "married", status: "ACCEPTED" },
          })
        } catch (e) {
          if (!isUniqueConstraintError(e)) throw e
        }
      } else if (existingSpouseRelation.status === "REJECTED") {
        await prisma.familyRelation.update({
          where: { id: existingSpouseRelation.id },
          data:  { status: "ACCEPTED", subtype: "married", requestedById: null },
        })
      }
      // else: already PENDING or ACCEPTED — nothing to do, matches prior behavior.
    }
  }

  revalidatePath(`/profile/${rootId}/tree`)
  return done()
}

// ─── addGhostRelative ────────────────────────────────────────────────────────

export async function addGhostRelative(rootId: string, data: unknown): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(rootId)
  if (!profile || profile.role === "APP_PET" || !canManageProfile(profile, session.user.id)) {
    return fail(t("familyTree.notAuthorized"))
  }

  const limit = await checkRateLimit({ key: `family-tree:add:${session.user.id}`, maxAttempts: 60, windowSeconds: 3600 })
  if (!limit.allowed) return fail(t("familyTree.tooManyRequests"))

  const parsed = getAddGhostRelativeSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(parsed.error.issues[0].message)
  if (!isAuthorizedMediaReference(
    parsed.data.avatarUrl,
    [`pending/${session.user.id}/create-ghost`],
    { allowLegacy: false },
  )) {
    return fail(t("common.invalidData"))
  }

  const {
    firstName, lastName, maidenName, nickname,
    gender, birthDate, deathDate, birthPlace, deathPlace, avatarUrl,
    anchorId, kind, subtype, startDate, endDate, linkSpouseId,
  } = parsed.data

  // IDOR guard: the anchor must belong to the caller's tree, otherwise a ghost
  // could be attached to — and auto-linked into — a stranger's profile by id.
  // linkSpouseId (an optional second SPOUSE relation below) must likewise be an
  // existing tree member, never an arbitrary stranger.
  const treeIds = await getTreeMemberIds(rootId)
  if (!treeIds.has(anchorId)) return fail(t("familyTree.notAuthorized"))
  if (linkSpouseId && !treeIds.has(linkSpouseId)) return fail(t("familyTree.notAuthorized"))

  // Tier limit (always +1 here).
  const features = await getMemorialFeatures(rootId)
  const memberCount = await countTreeMembers(rootId)
  if (exceedsQuota(memberCount + 1, features.treeMaxMembers, memberCount)) {
    return fail(t("familyTree.treeLimitReached", { limit: features.treeMaxMembers }))
  }

  let kindType: RelationType
  if (kind === "parent" || kind === "child") kindType = "PARENT_OF"
  else if (kind === "sibling")               kindType = "SIBLING"
  else                                        kindType = "SPOUSE"

  const finalSubtype = subtype ?? (kindType === "SPOUSE" ? "married" : null)

  await prisma.$transaction(async (tx) => {
    const ghost = await tx.appUser.create({
      data: {
        firstName,
        lastName,
        maidenName: maidenName ?? null,
        nickname:   nickname ?? null,
        gender:     gender ?? null,
        role:       "APP_GHOST",
        birthDate:  toDate(birthDate),
        deathDate:  toDate(deathDate),
        birthPlace: birthPlace ?? null,
        deathPlace: deathPlace ?? null,
        avatarUrl:  avatarUrl ?? null,
      },
      select: { id: true },
    })

    await tx.appUserGuardian.create({
      data: { appUserId: ghost.id, guardianId: session.user.id },
    })

    let fromId: string
    let toId:   string
    if (kind === "parent")      { fromId = ghost.id; toId = anchorId }
    else if (kind === "child")  { fromId = anchorId; toId = ghost.id }
    else                        { fromId = anchorId; toId = ghost.id }
    const [normFrom, normTo] = normalizePair(kindType, fromId, toId)

    await tx.familyRelation.create({
      data: {
        fromId:    normFrom,
        toId:      normTo,
        type:      kindType,
        subtype:   finalSubtype,
        startDate: toDate(startDate),
        endDate:   toDate(endDate),
        // Ghosts are placeholders; no consent needed.
        status:    "ACCEPTED",
      },
    })

    // Spouse link to an existing parent when adding a 2nd parent. Ghost is
    // brand new, so the only possible conflict is a genuine duplicate SPOUSE
    // row — check first rather than relying on a caught DB error: Postgres
    // aborts the whole transaction on the first failed statement, and catching
    // the JS exception doesn't un-abort it.
    if (linkSpouseId && kindType === "PARENT_OF" && kind === "parent" && linkSpouseId !== ghost.id) {
      const [a, b] = normalizePair("SPOUSE", ghost.id, linkSpouseId)
      const exists = await tx.familyRelation.findUnique({
        where:  { fromId_toId_type: { fromId: a, toId: b, type: "SPOUSE" } },
        select: { id: true },
      })
      if (!exists) {
        await tx.familyRelation.create({
          data: { fromId: a, toId: b, type: "SPOUSE", subtype: "married", status: "ACCEPTED" },
        })
      }
    }

    // Auto-link: keep the new node attached to the anchor's existing family
    // so we don't end up with orphan branches (no parents/no siblings/no co-parent).
    const createParentOf = async (parentId: string, childId: string) => {
      if (parentId === childId) return
      const [a, b] = normalizePair("PARENT_OF", parentId, childId)
      const exists = await tx.familyRelation.findUnique({
        where:  { fromId_toId_type: { fromId: a, toId: b, type: "PARENT_OF" } },
        select: { id: true },
      })
      if (!exists) {
        await tx.familyRelation.create({
          data: { fromId: a, toId: b, type: "PARENT_OF", subtype: null, status: "ACCEPTED" },
        })
      }
    }

    if (kind === "sibling") {
      // The new sibling inherits the anchor's parents. ACCEPTED only — a
      // still-PENDING (not yet consented) parent link must not be treated as
      // membership, or the invitee gets auto-linked with zero consent.
      const parentRels = await tx.familyRelation.findMany({
        where: { toId: anchorId, type: "PARENT_OF", status: "ACCEPTED" },
        select: { fromId: true },
      })
      for (const pr of parentRels) await createParentOf(pr.fromId, ghost.id)
    } else if (kind === "child") {
      // The new child inherits the anchor's active spouse as the other parent.
      const spouseRels = await tx.familyRelation.findMany({
        where: {
          type:    "SPOUSE",
          status:  "ACCEPTED",
          endDate: null,
          OR: [{ fromId: anchorId }, { toId: anchorId }],
        },
        select: { fromId: true, toId: true },
      })
      for (const sr of spouseRels) {
        const spouseId = sr.fromId === anchorId ? sr.toId : sr.fromId
        await createParentOf(spouseId, ghost.id)
      }
    } else if (kind === "parent") {
      // The new parent inherits the anchor's siblings as additional children.
      // ACCEPTED only — see the sibling branch above for why.
      const sibRels = await tx.familyRelation.findMany({
        where: {
          type:   "SIBLING",
          status: "ACCEPTED",
          OR: [{ fromId: anchorId }, { toId: anchorId }],
        },
        select: { fromId: true, toId: true },
      })
      for (const sr of sibRels) {
        const sibId = sr.fromId === anchorId ? sr.toId : sr.fromId
        await createParentOf(ghost.id, sibId)
      }
    }

    return ghost.id
  })

  revalidatePath(`/profile/${rootId}/tree`)
  return done()
}

// ─── updateMember ────────────────────────────────────────────────────────────

export async function updateMember(rootId: string, memberId: string, data: unknown): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const rootProfile = await getProfileById(rootId)
  if (!rootProfile || !canManageProfile(rootProfile, session.user.id)) return fail(t("familyTree.notAuthorized"))

  const member = await prisma.appUser.findUnique({
    where:  { id: memberId },
    select: { id: true, role: true, avatarUrl: true },
  })
  if (!member) return fail(t("familyTree.memberNotFound"))

  if (member.role === "APP_GHOST") {
    // Ghosts have no owner, so authorize by tree membership: the ghost must be
    // reachable from rootId (which the caller manages). Without this, a manager
    // of one tree could overwrite a ghost belonging to another user's tree (IDOR).
    const memberIds = await getTreeMemberIds(rootId)
    if (!memberIds.has(memberId)) return fail(t("familyTree.notAuthorized"))
  } else {
    // Real members (own/guardian) are authorized via canManageProfile.
    const target = await getProfileById(memberId)
    if (!target || !canManageProfile(target, session.user.id)) return fail(t("familyTree.notAuthorized"))
  }

  const parsed = getUpdateMemberSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(parsed.error.issues[0].message)
  if (
    parsed.data.avatarUrl !== member.avatarUrl &&
    !isAuthorizedMediaReference(
      parsed.data.avatarUrl,
      [`profiles/${memberId}/bio`],
      { allowLegacy: false },
    )
  ) {
    return fail(t("common.invalidData"))
  }

  const d = parsed.data
  await prisma.appUser.update({
    where: { id: memberId },
    data: {
      firstName:  d.firstName,
      lastName:   d.lastName,
      maidenName: d.maidenName ?? null,
      nickname:   d.nickname ?? null,
      gender:     d.gender ?? null,
      birthDate:  toDate(d.birthDate),
      deathDate:  toDate(d.deathDate),
      birthPlace: d.birthPlace ?? null,
      deathPlace: d.deathPlace ?? null,
      avatarUrl:  d.avatarUrl ?? null,
    },
  })
  if (member.avatarUrl && member.avatarUrl !== (d.avatarUrl ?? null)) {
    await deleteBlobs([member.avatarUrl])
  }

  revalidatePath(`/profile/${rootId}/tree`)
  revalidatePath(`/profile/${memberId}`)
  return done()
}

// ─── updateRelation ──────────────────────────────────────────────────────────

export async function updateRelation(rootId: string, relationId: string, data: unknown): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(rootId)
  if (!profile || !canManageProfile(profile, session.user.id)) return fail(t("familyTree.notAuthorized"))

  const parsed = getUpdateRelationSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  // The relation must belong to rootId's ACCEPTED tree (or be a pending invite
  // the caller sent). Without this, any manager could edit arbitrary relations
  // by id (IDOR).
  const relation = await prisma.familyRelation.findUnique({
    where:  { id: relationId },
    select: { fromId: true, toId: true, status: true, requestedById: true },
  })
  if (!relation) return fail(t("familyTree.relationNotFound"))
  const memberIds = await getTreeMemberIds(rootId)
  if (!canManageRelation(relation, memberIds, session.user.id)) {
    return fail(t("familyTree.notAuthorized"))
  }

  const { subtype, startDate, endDate } = parsed.data

  await prisma.familyRelation.update({
    where: { id: relationId },
    data:  { subtype: subtype ?? null, startDate: toDate(startDate), endDate: toDate(endDate) },
  })

  revalidatePath(`/profile/${rootId}/tree`)
  return done()
}

// ─── removeRelation ──────────────────────────────────────────────────────────

export async function removeRelation(rootId: string, relationId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(rootId)
  if (!profile || !canManageProfile(profile, session.user.id)) return fail(t("familyTree.notAuthorized"))

  // The relation must belong to rootId's ACCEPTED tree (or be a pending invite
  // the caller sent) — see updateRelation. Prevents deleting arbitrary relations
  // from other users' trees by id (IDOR).
  const relation = await prisma.familyRelation.findUnique({
    where:  { id: relationId },
    select: { fromId: true, toId: true, status: true, requestedById: true },
  })
  if (!relation) return fail(t("familyTree.relationNotFound"))
  const memberIds = await getTreeMemberIds(rootId)
  if (!canManageRelation(relation, memberIds, session.user.id)) {
    return fail(t("familyTree.notAuthorized"))
  }

  await prisma.familyRelation.delete({ where: { id: relationId } })
  revalidatePath(`/profile/${rootId}/tree`)
  return done()
}

// ─── removeMember — ghost: delete; real: detach from this tree ───────────────

export async function removeMember(rootId: string, memberId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(rootId)
  if (!profile || !canManageProfile(profile, session.user.id)) return fail(t("familyTree.notAuthorized"))

  if (memberId === rootId) return fail(t("familyTree.cannotRemoveRoot"))

  const member = await prisma.appUser.findUnique({
    where:  { id: memberId },
    select: { id: true, role: true, avatarUrl: true },
  })
  if (!member) return fail(t("familyTree.memberNotFound"))

  if (member.role === "APP_GHOST") {
    // Ghosts only live inside one tree — full delete. Authorize by tree
    // membership first: the ghost must be reachable from rootId, otherwise a
    // manager of one tree could delete a ghost from another tree (IDOR).
    const memberIds = await getTreeMemberIds(rootId)
    if (!memberIds.has(memberId)) return fail(t("familyTree.notAuthorized"))
    await prisma.appUser.delete({ where: { id: memberId } })
    await deleteBlobs([member.avatarUrl])
  } else {
    // Real users / memorials keep their profile. Disconnect them from THIS
    // tree by deleting every relation between this member and any current
    // member of the root's reachable set.
    const memberIds = await getTreeMemberIds(rootId)
    const treeOthers = Array.from(memberIds).filter((id) => id !== memberId)
    await prisma.familyRelation.deleteMany({
      where: {
        OR: [
          { fromId: memberId, toId:   { in: treeOthers } },
          { toId:   memberId, fromId: { in: treeOthers } },
        ],
      },
    })
  }

  revalidatePath(`/profile/${rootId}/tree`)
  return done()
}

// ─── acceptFamilyRequest / rejectFamilyRequest ───────────────────────────────

export async function acceptFamilyRequest(relationId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const relation = await prisma.familyRelation.findUnique({
    where:  { id: relationId },
    select: { id: true, type: true, fromId: true, toId: true, status: true, requestedById: true },
  })
  if (!relation) return fail(t("familyTree.requestNotFound"))
  if (relation.status !== "PENDING") return fail(t("familyTree.requestAlreadyDecided"))

  const isTarget = relation.fromId === session.user.id || relation.toId === session.user.id
  if (!isTarget || relation.requestedById === session.user.id) return fail(t("familyTree.notAuthorized"))

  if (relation.type === "PARENT_OF" && (await createsAncestryCycle(relation.fromId, relation.toId))) {
    return fail(t("familyTree.relationCycle"))
  }

  // notify() writes through the global prisma client (not `tx`) and schedules a
  // push side-effect — collect what to send here, fire only after the
  // transaction below has durably committed.
  type PendingNotify =
    | { kind: "FAMILY_REQUEST_ACCEPTED"; userId: string }
    | { kind: "GUARDIAN_REQUEST_PENDING"; userId: string; appUserGuardianId: string }
  const toNotify: PendingNotify[] = []

  await prisma.$transaction(async (tx) => {
    await tx.familyRelation.update({
      where: { id: relationId },
      data:  { status: "ACCEPTED" },
    })

    // Transform the accepter's own PENDING notification into ACCEPTED in-place so
    // it persists in their Recent Activity ("You joined <requester>'s family tree").
    await tx.notification.updateMany({
      where: { familyRelationId: relationId, userId: session.user.id, type: "FAMILY_REQUEST_PENDING" },
      data:  { type: "FAMILY_REQUEST_ACCEPTED", readAt: new Date() },
    })

    if (relation.requestedById) {
      toNotify.push({ kind: "FAMILY_REQUEST_ACCEPTED", userId: relation.requestedById })
    }

    // Bonus: when accepting a SIBLING invitation, the accepter automatically
    // files a PENDING co-guardianship request for each ghost/memorial parent of
    // the inviter — those are the shared parents the accepter now also "owns".
    // The inviter (current guardian) gets a notification and approves/declines.
    if (relation.type === "SIBLING" && relation.requestedById) {
      const inviterId  = relation.requestedById
      const accepterId = session.user.id

      // ACCEPTED only — a still-PENDING parent link must not be treated as
      // membership (mirrors the same fix in addGhostRelative).
      const parentRels = await tx.familyRelation.findMany({
        where: { type: "PARENT_OF", toId: inviterId, status: "ACCEPTED" },
        select: { fromId: true },
      })

      for (const pr of parentRels) {
        const parent = await tx.appUser.findUnique({
          where:  { id: pr.fromId },
          select: {
            id: true, role: true,
            guardedBy: { select: { guardianId: true, status: true } },
          },
        })
        if (!parent) continue
        if (parent.role !== "APP_GHOST" && parent.role !== "APP_MEMO") continue
        if (parent.guardedBy.some((g) => g.guardianId === accepterId)) continue

        // upsert (not create): two accepts racing to the same shared parent
        // could otherwise both pass the check above and collide on the unique
        // constraint INSIDE this transaction — upsert is atomic against that.
        const guardianship = await tx.appUserGuardian.upsert({
          where:  { appUserId_guardianId: { appUserId: parent.id, guardianId: accepterId } },
          create: { appUserId: parent.id, guardianId: accepterId, status: "PENDING", requestedById: accepterId },
          update: {},
          select: { id: true },
        })

        const recipients = parent.guardedBy
          .filter((g) => g.status === "ACCEPTED")
          .map((g) => g.guardianId)
        for (const uid of recipients) {
          toNotify.push({ kind: "GUARDIAN_REQUEST_PENDING", userId: uid, appUserGuardianId: guardianship.id })
        }
      }
    }
  })

  for (const n of toNotify) {
    if (n.kind === "FAMILY_REQUEST_ACCEPTED") {
      await notify({ type: "FAMILY_REQUEST_ACCEPTED", userId: n.userId, actorId: session.user.id, familyRelationId: relationId })
    } else {
      await notify({ type: "GUARDIAN_REQUEST_PENDING", userId: n.userId, actorId: session.user.id, appUserGuardianId: n.appUserGuardianId })
    }
  }

  revalidatePath("/family-requests")
  revalidatePath("/messages")
  return done()
}

export async function rejectFamilyRequest(relationId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const relation = await prisma.familyRelation.findUnique({
    where:  { id: relationId },
    select: { id: true, fromId: true, toId: true, status: true, requestedById: true },
  })
  if (!relation) return fail(t("familyTree.requestNotFound"))
  if (relation.status !== "PENDING") return fail(t("familyTree.requestAlreadyDecided"))

  const isTarget = relation.fromId === session.user.id || relation.toId === session.user.id
  if (!isTarget || relation.requestedById === session.user.id) return fail(t("familyTree.notAuthorized"))

  // Keep the row but mark it REJECTED so we preserve the audit trail and the
  // notifications linked to it (tree queries filter REJECTED out).
  await prisma.familyRelation.update({
    where: { id: relationId },
    data:  { status: "REJECTED" },
  })

  // Transform the rejecter's own PENDING notification into REJECTED in-place so
  // it persists in their Recent Activity ("You declined <requester>'s invitation").
  await prisma.notification.updateMany({
    where: { familyRelationId: relationId, userId: session.user.id, type: "FAMILY_REQUEST_PENDING" },
    data:  { type: "FAMILY_REQUEST_REJECTED", readAt: new Date() },
  })

  if (relation.requestedById) {
    await notify({
      type:             "FAMILY_REQUEST_REJECTED",
      userId:           relation.requestedById,
      actorId:          session.user.id,
      familyRelationId: relationId,
    })
  }

  revalidatePath("/family-requests")
  return done()
}
