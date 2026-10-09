import { beforeEach, describe, expect, it, vi } from "vitest"

const { tx, prismaMock } = vi.hoisted(() => {
  const tx = {
    appUser: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    appUserGuardian: { create: vi.fn() },
    familyRelation: { create: vi.fn() },
  }
  return { tx, prismaMock: { $transaction: vi.fn() } }
})

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/queries/tree-memorial", () => ({ getTreeMemorialScope: vi.fn() }))
vi.mock("@/lib/memorial-quota", () => ({ getMemorialCreationStatus: vi.fn() }))
vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))

import { addMemorialFromTree } from "./tree-memorial.actions"
import { verifySession } from "@/lib/dal"
import { revalidatePath } from "next/cache"
import { getTreeMemorialScope } from "@/queries/tree-memorial"
import { getMemorialCreationStatus } from "@/lib/memorial-quota"
import { getMemorialFeatures } from "@/lib/subscription"

const guardianId = "cguardian00000000000000001"
const profileId = "ctreemember000000000000001"
const otherGuardian = "cguardian00000000000000002"
const member = (role = "APP_GHOST", status = "ACCEPTED") => ({
  id: profileId, role, guardedBy: [{ guardianId, status }],
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(verifySession).mockResolvedValue({ user: { id: guardianId } } as never)
  vi.mocked(getTreeMemorialScope).mockResolvedValue({ guardedBy: { some: { guardianId, status: "ACCEPTED" } } })
  vi.mocked(getMemorialCreationStatus).mockResolvedValue({ count: 0, limit: 1, allowed: true })
  vi.mocked(getMemorialFeatures).mockResolvedValue({ code: "FREE" } as never)
  tx.appUser.findFirst.mockResolvedValue(member())
  tx.appUser.update.mockResolvedValue({ id: profileId, role: "APP_MEMO" })
  prismaMock.$transaction.mockImplementation(async (run: (db: typeof tx) => unknown) => run(tx))
})

describe("addMemorialFromTree", () => {
  it("requires a session before any tree read or mutation", async () => {
    vi.mocked(verifySession).mockRejectedValue(new Error("NEXT_REDIRECT"))
    await expect(addMemorialFromTree({ profileId })).rejects.toThrow("NEXT_REDIRECT")
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it.each([{}, { profileId: "" }, { profileId: "not-an-id" }, { profileId: 4 }])("rejects malformed input %j", async (data) => {
    expect(await addMemorialFromTree(data)).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("never turns the signed-in account into a memorial", async () => {
    expect(await addMemorialFromTree({ profileId: guardianId })).toEqual({ ok: false, message: "treeMemorial.unavailable" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("updates only the role of the existing tree member and preserves its ID", async () => {
    const result = await addMemorialFromTree({ profileId, guardianId: otherGuardian, role: "APP_USER" })
    expect(result).toMatchObject({ ok: true, data: { id: profileId, alreadyAdded: false } })
    expect(getTreeMemorialScope).toHaveBeenCalledWith(guardianId, tx)
    expect(tx.appUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ guardedBy: { some: { guardianId, status: "ACCEPTED" } } }, { id: profileId }] },
    }))
    expect(getMemorialCreationStatus).toHaveBeenCalledWith(guardianId, tx)
    expect(tx.appUser.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: profileId, role: "APP_GHOST" }, data: { role: "APP_MEMO" },
    })
    expect(tx.appUser.create).not.toHaveBeenCalled()
    expect(tx.appUserGuardian.create).not.toHaveBeenCalled()
    expect(tx.familyRelation.create).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" })
    expect(revalidatePath).toHaveBeenCalledWith("/home")
    expect(revalidatePath).toHaveBeenCalledWith("/profile/[id]/memorialized", "page")
    expect(revalidatePath).toHaveBeenCalledWith("/profile/[id]/tree", "page")
  })

  it.each([null, member("APP_USER"), member("APP_GHOST", "PENDING"), member("APP_GHOST", "REJECTED"),
    { ...member(), guardedBy: [{ guardianId: otherGuardian, status: "ACCEPTED" }] },
  ])("rejects an unavailable or unauthorized profile without writes", async (profile) => {
    tx.appUser.findFirst.mockResolvedValue(profile)
    expect(await addMemorialFromTree({ profileId })).toEqual({ ok: false, message: "treeMemorial.unavailable" })
    expect(tx.appUser.update).not.toHaveBeenCalled()
    expect(getMemorialCreationStatus).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("returns current quota information for the upgrade dialog, without converting the profile", async () => {
    vi.mocked(getMemorialCreationStatus).mockResolvedValue({ count: 1, limit: 1, allowed: false })
    expect(await addMemorialFromTree({ profileId })).toEqual({
      ok: false, message: "memorial.limitReached", quota: { limit: 1, tier: "FREE" },
    })
    expect(tx.appUser.update).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("checks other accepted guardians because promotion changes their counts too", async () => {
    tx.appUser.findFirst.mockResolvedValue({ ...member(), guardedBy: [
      { guardianId, status: "ACCEPTED" }, { guardianId: otherGuardian, status: "ACCEPTED" },
    ] })
    vi.mocked(getMemorialCreationStatus)
      .mockResolvedValueOnce({ count: 0, limit: 2, allowed: true })
      .mockResolvedValueOnce({ count: 1, limit: 1, allowed: false })
    expect(await addMemorialFromTree({ profileId })).toEqual({ ok: false, message: "treeMemorial.coGuardianLimit" })
    expect(getMemorialCreationStatus).toHaveBeenNthCalledWith(2, otherGuardian, tx)
    expect(tx.appUser.update).not.toHaveBeenCalled()
  })

  it.each(["APP_MEMO", "APP_PET"])("opens an existing %s without a second quota charge, even after downgrade", async (role) => {
    tx.appUser.findFirst.mockResolvedValue(member(role))
    vi.mocked(getMemorialCreationStatus).mockResolvedValue({ count: 5, limit: 0, allowed: false })
    expect(await addMemorialFromTree({ profileId })).toMatchObject({ ok: true, data: { id: profileId, alreadyAdded: true } })
    expect(getMemorialCreationStatus).not.toHaveBeenCalled()
    expect(tx.appUser.update).not.toHaveBeenCalled()
    expect(tx.appUser.create).not.toHaveBeenCalled()
  })

  it("rechecks capacity after a serialization conflict for the last slot", async () => {
    tx.appUser.update.mockRejectedValueOnce({ code: "P2034" })
    vi.mocked(getMemorialCreationStatus)
      .mockResolvedValueOnce({ count: 0, limit: 1, allowed: true })
      .mockResolvedValueOnce({ count: 1, limit: 1, allowed: false })
    expect(await addMemorialFromTree({ profileId })).toMatchObject({ ok: false, quota: { limit: 1, tier: "FREE" } })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2)
    expect(tx.appUser.update).toHaveBeenCalledTimes(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("treats a simultaneous promotion of the same ID as already added on retry", async () => {
    tx.appUser.update.mockRejectedValueOnce({ code: "P2034" })
    tx.appUser.findFirst.mockResolvedValueOnce(member()).mockResolvedValueOnce(member("APP_MEMO"))
    expect(await addMemorialFromTree({ profileId })).toMatchObject({ ok: true, data: { id: profileId, alreadyAdded: true } })
    expect(tx.appUser.update).toHaveBeenCalledTimes(1)
  })

  it("bounds transaction retries and returns a retryable error", async () => {
    prismaMock.$transaction.mockRejectedValue({ code: "P2034" })
    expect(await addMemorialFromTree({ profileId })).toEqual({ ok: false, message: "treeMemorial.retry" })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(3)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("does not report database failures as successful additions", async () => {
    tx.appUser.update.mockRejectedValue(new Error("database offline"))
    await expect(addMemorialFromTree({ profileId })).rejects.toThrow("database offline")
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
