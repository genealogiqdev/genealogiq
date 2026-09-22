import { describe, it, expect, vi, beforeEach } from "vitest"

const { prismaMock, PrismaKnownError } = vi.hoisted(() => {
  class PrismaKnownError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  }
  const prismaMock = {
    familyRelation: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    appUser: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    appUserGuardian: { create: vi.fn() },
    notification: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  }
  return { prismaMock, PrismaKnownError }
})

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@genealogiq/db", () => ({ Prisma: { PrismaClientKnownRequestError: PrismaKnownError } }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("@/queries/profile", () => ({ getProfileById: vi.fn() }))
vi.mock("@/lib/profile", () => ({ canManageProfile: vi.fn() }))
vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }))
vi.mock("@genealogiq/services/rate-limit", () => ({ checkRateLimit: vi.fn() }))
vi.mock("@/queries/family-tree", () => ({
  getTreeMemberIds: vi.fn(),
  countTreeMembers: vi.fn(),
  createsAncestryCycle: vi.fn(),
  hasConflictingRelationType: vi.fn(),
}))

import {
  addRelation, addGhostRelative, updateRelation, removeRelation, updateMember, acceptFamilyRequest,
} from "./family-tree.actions"
import { verifySession } from "@/lib/dal"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { notify } from "@/lib/notifications"
import { checkRateLimit } from "@genealogiq/services/rate-limit"
import {
  getTreeMemberIds, countTreeMembers, createsAncestryCycle, hasConflictingRelationType,
} from "@/queries/family-tree"
import { getMemorialFeatures } from "@/lib/subscription"

beforeEach(() => {
  vi.clearAllMocks()
  // Caller manages the tree root "A".
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "mgr" } } as never)
  vi.mocked(getProfileById).mockResolvedValue({ id: "A", guardedBy: [] } as never)
  vi.mocked(canManageProfile).mockReturnValue(true)
  vi.mocked(getTreeMemberIds).mockResolvedValue(new Set(["A"]))
  vi.mocked(getMemorialFeatures).mockResolvedValue({ treeMaxMembers: 50 } as never)
  vi.mocked(countTreeMembers).mockResolvedValue(1)
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfter: 0 })
  vi.mocked(createsAncestryCycle).mockResolvedValue(false)
  vi.mocked(hasConflictingRelationType).mockResolvedValue(false)
  // Default: no pre-existing relation between any pair (addRelation's own
  // REJECTED-revival check). Tests for that behavior override this
  // explicitly; everyone else gets a clean "nothing exists yet" baseline
  // instead of leaking whatever a DIFFERENT describe block's test last set
  // this same mock to (vi.clearAllMocks() resets call history, not
  // implementations set via mockResolvedValue).
  prismaMock.familyRelation.findUnique.mockResolvedValue(null)
})

// cuid()-shaped ids so the .cuid() schema fields parse and we reach the guard.
const ROOT = "crootaaaaaaaa"
const MEMBER = "cmemberaaaaaa"
const STRANGER1 = "cstrangeronea"
const STRANGER2 = "cstrangertwoa"
const FOREIGN_MEMO = "cforeignmemoa"
const PET = "cpetaaaaaaaaa"

function mockUsers(byId: Record<string, { id: string; role: string }>) {
  prismaMock.appUser.findUnique.mockImplementation(
    ({ where }: { where: { id: string } }) => Promise.resolve(byId[where.id] ?? null),
  )
}

describe("updateRelation — C2 IDOR guard", () => {
  it("rejects a relation whose endpoints are outside root's tree and never updates", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({ fromId: "X", toId: "Y" })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set(["A"])) // tree does NOT contain X/Y

    const res = await updateRelation("A", "rel-1", {})

    expect(res).toEqual({ ok: false, message: "familyTree.notAuthorized" })
    expect(prismaMock.familyRelation.update).not.toHaveBeenCalled()
  })

  it("updates a relation whose endpoints are inside root's tree", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({ fromId: "X", toId: "Y" })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set(["A", "X", "Y"]))
    prismaMock.familyRelation.update.mockResolvedValue({})

    const res = await updateRelation("A", "rel-1", { subtype: "married" })

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.familyRelation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rel-1" } }),
    )
  })
})

describe("updateMember — C3 IDOR guard (ghost branch)", () => {
  it("rejects editing a ghost that does not belong to root's tree", async () => {
    prismaMock.appUser.findUnique.mockResolvedValue({ id: "ghost-1", role: "APP_GHOST" })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set(["A"])) // ghost not reachable

    const res = await updateMember("A", "ghost-1", { firstName: "John", lastName: "Doe" })

    expect(res).toEqual({ ok: false, message: "familyTree.notAuthorized" })
    expect(prismaMock.appUser.update).not.toHaveBeenCalled()
  })

  it("updates a ghost that belongs to root's tree", async () => {
    prismaMock.appUser.findUnique.mockResolvedValue({ id: "ghost-1", role: "APP_GHOST" })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set(["A", "ghost-1"]))
    prismaMock.appUser.update.mockResolvedValue({})

    const res = await updateMember("A", "ghost-1", { firstName: "John", lastName: "Doe" })

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.appUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ghost-1" } }),
    )
  })
})

describe("addRelation — IDOR guard", () => {
  it("rejects a relation between two profiles outside root's tree (stranger↔stranger) and never creates", async () => {
    mockUsers({
      [STRANGER1]: { id: STRANGER1, role: "APP_USER" },
      [STRANGER2]: { id: STRANGER2, role: "APP_USER" },
    })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT])) // neither endpoint in the tree

    const res = await addRelation(ROOT, { fromId: STRANGER1, toId: STRANGER2, type: "SIBLING" })

    expect(res).toEqual({ ok: false, message: "familyTree.notAuthorized" })
    expect(prismaMock.familyRelation.create).not.toHaveBeenCalled()
  })

  it("rejects attaching a foreign ghost/memorial to root (no consent gate protects it)", async () => {
    mockUsers({
      [ROOT]: { id: ROOT, role: "APP_USER" },
      [FOREIGN_MEMO]: { id: FOREIGN_MEMO, role: "APP_MEMO" },
    })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT])) // memo not reachable from root

    const res = await addRelation(ROOT, { fromId: ROOT, toId: FOREIGN_MEMO, type: "PARENT_OF" })

    expect(res).toEqual({ ok: false, message: "familyTree.notAuthorized" })
    expect(prismaMock.familyRelation.create).not.toHaveBeenCalled()
  })

  it("rejects every human relationship type when one endpoint is a pet", async () => {
    mockUsers({
      [ROOT]: { id: ROOT, role: "APP_USER" },
      [PET]: { id: PET, role: "APP_PET" },
    })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT, PET]))

    const res = await addRelation(ROOT, { fromId: ROOT, toId: PET, type: "SIBLING" })

    expect(res).toEqual({ ok: false, message: "familyTree.notAuthorized" })
    expect(prismaMock.familyRelation.create).not.toHaveBeenCalled()
  })

  it("allows linking two members already in root's tree", async () => {
    mockUsers({
      [ROOT]: { id: ROOT, role: "APP_USER" },
      [MEMBER]: { id: MEMBER, role: "APP_GHOST" },
    })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT, MEMBER]))
    prismaMock.familyRelation.findFirst.mockResolvedValue({ id: "rel-existing" })
    prismaMock.familyRelation.create.mockResolvedValue({ id: "rel-new" })

    const res = await addRelation(ROOT, { fromId: ROOT, toId: MEMBER, type: "SPOUSE" })

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.familyRelation.create).toHaveBeenCalled()
  })

  it("rejects a foreign linkSpouseId (forged spouse via the link side-channel)", async () => {
    mockUsers({
      [ROOT]: { id: ROOT, role: "APP_USER" },
      [MEMBER]: { id: MEMBER, role: "APP_GHOST" },
    })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT, MEMBER])) // STRANGER1 not in tree

    const res = await addRelation(ROOT, {
      fromId: ROOT, toId: MEMBER, type: "PARENT_OF", linkSpouseId: STRANGER1,
    })

    expect(res).toEqual({ ok: false, message: "familyTree.notAuthorized" })
    expect(prismaMock.familyRelation.create).not.toHaveBeenCalled()
  })

  it("forces consent (PENDING) for an out-of-tree APP_USER even when anchored to a non-root member", async () => {
    mockUsers({
      [MEMBER]: { id: MEMBER, role: "APP_GHOST" },     // in-tree anchor (not root)
      [STRANGER1]: { id: STRANGER1, role: "APP_USER" }, // out-of-tree real user
    })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT, MEMBER]))
    prismaMock.familyRelation.findFirst.mockResolvedValue(null)
    prismaMock.familyRelation.create.mockResolvedValue({ id: "rel-new" })

    const res = await addRelation(ROOT, { fromId: MEMBER, toId: STRANGER1, type: "SIBLING" })

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.familyRelation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING" }) }),
    )
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: STRANGER1 }))
  })

  it("does not auto-create a SPOUSE link to an out-of-tree new parent (no unconsented marriage)", async () => {
    mockUsers({
      [STRANGER1]: { id: STRANGER1, role: "APP_USER" }, // new parent, out of tree
      [MEMBER]: { id: MEMBER, role: "APP_GHOST" },       // child, in tree
    })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT, MEMBER])) // linkSpouse ROOT in tree
    prismaMock.familyRelation.findFirst.mockResolvedValue(null)
    prismaMock.familyRelation.create.mockResolvedValue({ id: "rel-new" })

    const res = await addRelation(ROOT, {
      fromId: STRANGER1, toId: MEMBER, type: "PARENT_OF", linkSpouseId: ROOT,
    })

    expect(res).toEqual({ ok: true, message: undefined })
    // only the main (PENDING) PARENT_OF relation — the spouse auto-link is skipped
    expect(prismaMock.familyRelation.create).toHaveBeenCalledTimes(1)
  })
})

describe("addGhostRelative — IDOR guard", () => {
  it("rejects anchoring a ghost to a profile outside root's tree and never opens the transaction", async () => {
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT])) // anchor not reachable from root

    const res = await addGhostRelative(ROOT, {
      firstName: "Jane", lastName: "Doe", anchorId: FOREIGN_MEMO, kind: "parent",
    })

    expect(res).toEqual({ ok: false, message: "familyTree.notAuthorized" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("allows anchoring a ghost to a member of root's tree", async () => {
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT])) // anchor = ROOT, in tree
    const tx = {
      appUser: { create: vi.fn().mockResolvedValue({ id: "ghost-new" }) },
      appUserGuardian: { create: vi.fn() },
      familyRelation: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    }
    prismaMock.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx))

    const res = await addGhostRelative(ROOT, {
      firstName: "Jane", lastName: "Doe", anchorId: ROOT, kind: "parent",
    })

    expect(res).toEqual({ ok: true, message: undefined })
    expect(tx.appUser.create).toHaveBeenCalled()
    expect(tx.familyRelation.create).toHaveBeenCalled()
  })
})

describe("removeRelation — pending-invite management (ACCEPTED-only membership)", () => {
  it("lets the sender withdraw their own PENDING invite though the invitee isn't an accepted member", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({
      fromId: "A", toId: STRANGER1, status: "PENDING", requestedById: "mgr",
    })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set(["A"])) // STRANGER1 not an accepted member
    prismaMock.familyRelation.delete.mockResolvedValue({})

    const res = await removeRelation("A", "rel-1")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.familyRelation.delete).toHaveBeenCalledWith({ where: { id: "rel-1" } })
  })

  it("rejects deleting a PENDING invite the caller did not send", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({
      fromId: "A", toId: STRANGER1, status: "PENDING", requestedById: "someone-else",
    })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set(["A"]))

    const res = await removeRelation("A", "rel-1")

    expect(res).toEqual({ ok: false, message: "familyTree.notAuthorized" })
    expect(prismaMock.familyRelation.delete).not.toHaveBeenCalled()
  })
})

describe("addRelation — cycle, conflicting-type & rate-limit guards", () => {
  beforeEach(() => {
    mockUsers({
      [ROOT]: { id: ROOT, role: "APP_USER" },
      [MEMBER]: { id: MEMBER, role: "APP_GHOST" },
    })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT, MEMBER]))
    prismaMock.familyRelation.findFirst.mockResolvedValue({ id: "rel-existing" })
    prismaMock.familyRelation.create.mockResolvedValue({ id: "rel-new" })
  })

  it("rejects a PARENT_OF relation that would create an ancestry cycle", async () => {
    vi.mocked(createsAncestryCycle).mockResolvedValue(true)

    const res = await addRelation(ROOT, { fromId: ROOT, toId: MEMBER, type: "PARENT_OF" })

    expect(res).toEqual({ ok: false, message: "familyTree.relationCycle" })
    expect(prismaMock.familyRelation.create).not.toHaveBeenCalled()
  })

  it("does not check for cycles on non-PARENT_OF relation types", async () => {
    const res = await addRelation(ROOT, { fromId: ROOT, toId: MEMBER, type: "SIBLING" })

    expect(res.ok).toBe(true)
    expect(createsAncestryCycle).not.toHaveBeenCalled()
  })

  it("rejects when the pair already has a different relation type", async () => {
    vi.mocked(hasConflictingRelationType).mockResolvedValue(true)

    const res = await addRelation(ROOT, { fromId: ROOT, toId: MEMBER, type: "SPOUSE" })

    expect(res).toEqual({ ok: false, message: "familyTree.conflictingRelationType" })
    expect(prismaMock.familyRelation.create).not.toHaveBeenCalled()
  })

  it("rejects when the rate limit is exceeded, before touching the DB", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfter: 30 })

    const res = await addRelation(ROOT, { fromId: ROOT, toId: MEMBER, type: "SIBLING" })

    expect(res).toEqual({ ok: false, message: "familyTree.tooManyRequests" })
    expect(prismaMock.familyRelation.create).not.toHaveBeenCalled()
  })

  it("reports a friendly message on a genuine unique-constraint violation", async () => {
    prismaMock.familyRelation.create.mockRejectedValue(new PrismaKnownError("Unique constraint failed", "P2002"))

    const res = await addRelation(ROOT, { fromId: ROOT, toId: MEMBER, type: "SIBLING" })

    expect(res).toEqual({ ok: false, message: "familyTree.relationExists" })
  })

  it("rethrows a non-unique-constraint error instead of masking it", async () => {
    prismaMock.familyRelation.create.mockRejectedValue(new Error("connection reset"))

    await expect(addRelation(ROOT, { fromId: ROOT, toId: MEMBER, type: "SIBLING" }))
      .rejects.toThrow("connection reset")
  })
})

describe("addRelation — revives a REJECTED relation instead of failing on retry", () => {
  beforeEach(() => {
    mockUsers({
      [ROOT]: { id: ROOT, role: "APP_USER" },
      [MEMBER]: { id: MEMBER, role: "APP_GHOST" },
    })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT, MEMBER]))
    prismaMock.familyRelation.findFirst.mockResolvedValue({ id: "rel-existing" })
  })

  it("updates the existing REJECTED row instead of inserting a new one", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({ id: "rel-old", status: "REJECTED" })
    prismaMock.familyRelation.update.mockResolvedValue({ id: "rel-old" })

    const res = await addRelation(ROOT, { fromId: ROOT, toId: MEMBER, type: "SIBLING" })

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.familyRelation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rel-old" }, data: expect.objectContaining({ status: "ACCEPTED" }) }),
    )
    expect(prismaMock.familyRelation.create).not.toHaveBeenCalled()
  })

  it("still fails with relationExists when the existing row is PENDING (genuine duplicate)", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({ id: "rel-old", status: "PENDING" })

    const res = await addRelation(ROOT, { fromId: ROOT, toId: MEMBER, type: "SIBLING" })

    expect(res).toEqual({ ok: false, message: "familyTree.relationExists" })
    expect(prismaMock.familyRelation.update).not.toHaveBeenCalled()
    expect(prismaMock.familyRelation.create).not.toHaveBeenCalled()
  })

  it("still fails with relationExists when the existing row is ACCEPTED (genuine duplicate)", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({ id: "rel-old", status: "ACCEPTED" })

    const res = await addRelation(ROOT, { fromId: ROOT, toId: MEMBER, type: "SIBLING" })

    expect(res).toEqual({ ok: false, message: "familyTree.relationExists" })
    expect(prismaMock.familyRelation.update).not.toHaveBeenCalled()
  })

  it("revives with the NEW request's data — e.g. a fresh requestedById and PENDING status for a re-sent invite", async () => {
    mockUsers({
      [MEMBER]: { id: MEMBER, role: "APP_GHOST" },
      [STRANGER1]: { id: STRANGER1, role: "APP_USER" },
    })
    prismaMock.familyRelation.findFirst.mockResolvedValue(null)
    prismaMock.familyRelation.findUnique.mockResolvedValue({ id: "rel-old", status: "REJECTED" })
    prismaMock.familyRelation.update.mockResolvedValue({ id: "rel-old" })

    const res = await addRelation(ROOT, { fromId: MEMBER, toId: STRANGER1, type: "SIBLING" })

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.familyRelation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rel-old" },
        data:  expect.objectContaining({ status: "PENDING", requestedById: "mgr" }),
      }),
    )
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: STRANGER1, familyRelationId: "rel-old" }))
  })

  it("also revives a REJECTED row in the linkSpouseId auto-link side-channel", async () => {
    const NEW_PARENT = "cnewparentaaa"
    mockUsers({
      [NEW_PARENT]: { id: NEW_PARENT, role: "APP_GHOST" },
      [MEMBER]:     { id: MEMBER,     role: "APP_GHOST" },
    })
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT, NEW_PARENT, MEMBER]))
    // 1st findUnique = the main PARENT_OF relation's own revival check (nothing
    // existing yet); 2nd = the linkSpouseId SPOUSE-pair check (existing REJECTED row).
    prismaMock.familyRelation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "spouse-rel-old", status: "REJECTED" })
    prismaMock.familyRelation.create.mockResolvedValue({ id: "rel-new" })
    prismaMock.familyRelation.update.mockResolvedValue({ id: "spouse-rel-old" })

    const res = await addRelation(ROOT, {
      fromId: NEW_PARENT, toId: MEMBER, type: "PARENT_OF", linkSpouseId: ROOT,
    })

    expect(res).toEqual({ ok: true, message: undefined })
    // Main relation still goes through create(); only the spousal side-channel revives.
    expect(prismaMock.familyRelation.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.familyRelation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "spouse-rel-old" },
        data:  expect.objectContaining({ status: "ACCEPTED", subtype: "married" }),
      }),
    )
  })
})

describe("addGhostRelative — auto-link inherits ACCEPTED relations only", () => {
  it("looks up the anchor's parents by ACCEPTED status when adding a sibling", async () => {
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT]))
    const findManyMock = vi.fn().mockResolvedValue([])
    const tx = {
      appUser: { create: vi.fn().mockResolvedValue({ id: "ghost-new" }) },
      appUserGuardian: { create: vi.fn() },
      familyRelation: { create: vi.fn(), findUnique: vi.fn().mockResolvedValue(null), findMany: findManyMock },
    }
    prismaMock.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx))

    const res = await addGhostRelative(ROOT, { firstName: "Jane", lastName: "Doe", anchorId: ROOT, kind: "sibling" })

    expect(res.ok).toBe(true)
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "ACCEPTED" }) }),
    )
  })

  it("looks up the anchor's siblings by ACCEPTED status when adding a parent", async () => {
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT]))
    const findManyMock = vi.fn().mockResolvedValue([])
    const tx = {
      appUser: { create: vi.fn().mockResolvedValue({ id: "ghost-new" }) },
      appUserGuardian: { create: vi.fn() },
      familyRelation: { create: vi.fn(), findUnique: vi.fn().mockResolvedValue(null), findMany: findManyMock },
    }
    prismaMock.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx))

    const res = await addGhostRelative(ROOT, { firstName: "Jane", lastName: "Doe", anchorId: ROOT, kind: "parent" })

    expect(res.ok).toBe(true)
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "ACCEPTED" }) }),
    )
  })

  it("rejects when the rate limit is exceeded, before opening the transaction", async () => {
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([ROOT]))
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfter: 30 })

    const res = await addGhostRelative(ROOT, { firstName: "Jane", lastName: "Doe", anchorId: ROOT, kind: "parent" })

    expect(res).toEqual({ ok: false, message: "familyTree.tooManyRequests" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})

describe("acceptFamilyRequest", () => {
  it("fails when the relation is not found", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue(null)

    const res = await acceptFamilyRequest("rel-1")

    expect(res).toEqual({ ok: false, message: "familyTree.requestNotFound" })
  })

  it("fails when the relation is not PENDING", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({
      id: "rel-1", type: "SPOUSE", status: "ACCEPTED", fromId: "A", toId: "mgr", requestedById: "A",
    })

    const res = await acceptFamilyRequest("rel-1")

    expect(res).toEqual({ ok: false, message: "familyTree.requestAlreadyDecided" })
  })

  it("fails when the caller is not a party to the relation", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({
      id: "rel-1", type: "SPOUSE", status: "PENDING", fromId: "A", toId: "B", requestedById: "A",
    })

    const res = await acceptFamilyRequest("rel-1")

    expect(res).toEqual({ ok: false, message: "familyTree.notAuthorized" })
  })

  it("fails when the caller is the original requester", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({
      id: "rel-1", type: "SPOUSE", status: "PENDING", fromId: "mgr", toId: "B", requestedById: "mgr",
    })

    const res = await acceptFamilyRequest("rel-1")

    expect(res).toEqual({ ok: false, message: "familyTree.notAuthorized" })
  })

  it("rejects a PARENT_OF acceptance that would create an ancestry cycle", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({
      id: "rel-1", type: "PARENT_OF", status: "PENDING", fromId: "B", toId: "mgr", requestedById: "B",
    })
    vi.mocked(createsAncestryCycle).mockResolvedValue(true)

    const res = await acceptFamilyRequest("rel-1")

    expect(res).toEqual({ ok: false, message: "familyTree.relationCycle" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("accepts a non-SIBLING request: flips status, transforms the notification, and notifies only after commit", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({
      id: "rel-1", type: "SPOUSE", status: "PENDING", fromId: "B", toId: "mgr", requestedById: "B",
    })
    const callOrder: string[] = []
    const tx = {
      familyRelation: { update: vi.fn(async () => { callOrder.push("tx.update") }), findMany: vi.fn() },
      notification: { updateMany: vi.fn(async () => { callOrder.push("tx.notification") }) },
      appUser: { findUnique: vi.fn() },
      appUserGuardian: { upsert: vi.fn() },
    }
    prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => {
      callOrder.push("tx.start")
      await cb(tx)
      callOrder.push("tx.commit")
    })
    vi.mocked(notify).mockImplementation(async () => { callOrder.push("notify") })

    const res = await acceptFamilyRequest("rel-1")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(tx.familyRelation.update).toHaveBeenCalledWith({ where: { id: "rel-1" }, data: { status: "ACCEPTED" } })
    expect(tx.notification.updateMany).toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "FAMILY_REQUEST_ACCEPTED", userId: "B" }),
    )
    // notify() must fire only after the transaction has committed — never mid-transaction.
    expect(callOrder).toEqual(["tx.start", "tx.update", "tx.notification", "tx.commit", "notify"])
  })

  it("SIBLING bonus: looks up the inviter's parents by ACCEPTED status only", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({
      id: "rel-1", type: "SIBLING", status: "PENDING", fromId: "B", toId: "mgr", requestedById: "B",
    })
    const findManyMock = vi.fn().mockResolvedValue([])
    const tx = {
      familyRelation: { update: vi.fn(), findMany: findManyMock },
      notification: { updateMany: vi.fn() },
      appUser: { findUnique: vi.fn() },
      appUserGuardian: { upsert: vi.fn() },
    }
    prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))

    await acceptFamilyRequest("rel-1")

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: "PARENT_OF", toId: "B", status: "ACCEPTED" }) }),
    )
  })

  it("SIBLING bonus: files a PENDING co-guardian request for a qualifying ghost/memorial parent and notifies its accepted guardians", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({
      id: "rel-1", type: "SIBLING", status: "PENDING", fromId: "B", toId: "mgr", requestedById: "B",
    })
    const tx = {
      familyRelation: { update: vi.fn(), findMany: vi.fn().mockResolvedValue([{ fromId: "parent-1" }]) },
      notification: { updateMany: vi.fn() },
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: "parent-1", role: "APP_GHOST",
          guardedBy: [{ guardianId: "existing-guardian", status: "ACCEPTED" }],
        }),
      },
      appUserGuardian: { upsert: vi.fn().mockResolvedValue({ id: "gship-new" }) },
    }
    prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))

    const res = await acceptFamilyRequest("rel-1")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(tx.appUserGuardian.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { appUserId_guardianId: { appUserId: "parent-1", guardianId: "mgr" } },
        create: expect.objectContaining({
          appUserId: "parent-1", guardianId: "mgr", status: "PENDING", requestedById: "mgr",
        }),
      }),
    )
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "GUARDIAN_REQUEST_PENDING", userId: "existing-guardian", appUserGuardianId: "gship-new",
      }),
    )
  })

  it("SIBLING bonus: skips a parent the accepter already guards, regardless of status", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({
      id: "rel-1", type: "SIBLING", status: "PENDING", fromId: "B", toId: "mgr", requestedById: "B",
    })
    const tx = {
      familyRelation: { update: vi.fn(), findMany: vi.fn().mockResolvedValue([{ fromId: "parent-1" }]) },
      notification: { updateMany: vi.fn() },
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: "parent-1", role: "APP_GHOST",
          guardedBy: [{ guardianId: "mgr", status: "PENDING" }],
        }),
      },
      appUserGuardian: { upsert: vi.fn() },
    }
    prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))

    const res = await acceptFamilyRequest("rel-1")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(tx.appUserGuardian.upsert).not.toHaveBeenCalled()
  })

  it("SIBLING bonus: skips a shared parent who is a real living APP_USER", async () => {
    prismaMock.familyRelation.findUnique.mockResolvedValue({
      id: "rel-1", type: "SIBLING", status: "PENDING", fromId: "B", toId: "mgr", requestedById: "B",
    })
    const tx = {
      familyRelation: { update: vi.fn(), findMany: vi.fn().mockResolvedValue([{ fromId: "parent-1" }]) },
      notification: { updateMany: vi.fn() },
      appUser: { findUnique: vi.fn().mockResolvedValue({ id: "parent-1", role: "APP_USER", guardedBy: [] }) },
      appUserGuardian: { upsert: vi.fn() },
    }
    prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))

    const res = await acceptFamilyRequest("rel-1")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(tx.appUserGuardian.upsert).not.toHaveBeenCalled()
  })
})
