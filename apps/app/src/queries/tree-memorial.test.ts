import { beforeEach, describe, expect, it, vi } from "vitest"

const { db } = vi.hoisted(() => ({ db: {
  appUser: { findMany: vi.fn() }, familyRelation: { findMany: vi.fn() },
} }))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
import { getTreeMemorialCandidates, getTreeMemorialScope } from "./tree-memorial"

beforeEach(() => {
  vi.resetAllMocks()
  db.familyRelation.findMany.mockResolvedValue([])
  db.appUser.findMany.mockResolvedValue([])
})

describe("tree memorial selection scope", () => {
  it("traverses only accepted human relations and includes pets through owners without traversing co-owners", async () => {
    db.familyRelation.findMany.mockResolvedValueOnce([{ fromId: "actor", toId: "relative" }])
    await getTreeMemorialCandidates("actor")
    expect(db.familyRelation.findMany).toHaveBeenNthCalledWith(1, {
      where: { type: { in: ["PARENT_OF", "SPOUSE", "SIBLING"] }, status: "ACCEPTED", OR: [{ fromId: { in: ["actor"] } }, { toId: { in: ["actor"] } }] },
      select: { fromId: true, toId: true },
    })
    expect(db.familyRelation.findMany).toHaveBeenCalledTimes(2)
    expect(db.appUser.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: { not: "actor" },
      guardedBy: { some: { guardianId: "actor", status: "ACCEPTED" } },
      OR: [
        { id: { in: ["actor", "relative"] }, role: { in: ["APP_GHOST", "APP_MEMO"] } },
        { role: "APP_PET", petOwnerships: { some: { ownerId: { in: ["actor", "relative"] } } } },
      ],
    } }))
  })

  it("uses the transaction for tree authorization, not an earlier page's list", async () => {
    const tx = { familyRelation: { findMany: vi.fn().mockResolvedValue([]) } }
    const scope = await getTreeMemorialScope("actor", tx as never)
    expect(scope).toMatchObject({
      id: { not: "actor" }, guardedBy: { some: { guardianId: "actor", status: "ACCEPTED" } },
    })
    expect(tx.familyRelation.findMany).toHaveBeenCalledTimes(1)
    expect(db.familyRelation.findMany).not.toHaveBeenCalled()
  })
})
