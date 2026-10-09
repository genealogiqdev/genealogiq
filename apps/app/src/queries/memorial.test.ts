import { beforeEach, describe, expect, it, vi } from "vitest"

const { db } = vi.hoisted(() => ({ db: { appUser: { findMany: vi.fn(), count: vi.fn() } } }))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
import { countMemorialsByCreatorId, getGuardedProfilesByGuardianId, getMemorialsByCreatorId } from "./memorial"

beforeEach(() => vi.resetAllMocks())

describe("guarded profile list and separate quotas", () => {
  it("includes accepted human memorials and pets, without exposing private contact data", async () => {
    await getGuardedProfilesByGuardianId("guardian")
    expect(db.appUser.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: { in: ["APP_MEMO", "APP_PET"] }, guardedBy: { some: { guardianId: "guardian", status: "ACCEPTED" } } },
    }))
    const selection = db.appUser.findMany.mock.calls[0][0].select
    expect(selection).toMatchObject({ petSpecies: true, petBreed: true, avatarUrl: true, firstName: true })
    expect(selection).not.toHaveProperty("email")
    expect(selection).not.toHaveProperty("phone")
    expect(selection).not.toHaveProperty("notes")
  })

  it("keeps the memorial-only readers separate from pets and ghosts", async () => {
    await getMemorialsByCreatorId("guardian")
    await countMemorialsByCreatorId("guardian")
    const where = { role: "APP_MEMO", guardedBy: { some: { guardianId: "guardian", status: "ACCEPTED" } } }
    expect(db.appUser.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }))
    expect(db.appUser.count).toHaveBeenCalledWith({ where })
  })

  it("counts within the caller's transaction when reserving a memorial slot", async () => {
    const transaction = { appUser: { count: vi.fn().mockResolvedValue(2) } }
    expect(await countMemorialsByCreatorId("guardian", transaction as never)).toBe(2)
    expect(transaction.appUser.count).toHaveBeenCalledWith({ where: {
      role: "APP_MEMO", guardedBy: { some: { guardianId: "guardian", status: "ACCEPTED" } },
    } })
    expect(db.appUser.count).not.toHaveBeenCalled()
  })
})
