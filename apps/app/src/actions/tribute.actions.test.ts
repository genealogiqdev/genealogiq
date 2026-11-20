import { describe, it, expect, vi, beforeEach } from "vitest"

// Prisma mock must be hoisted so it exists when the vi.mock factory runs.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    tribute: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), delete: vi.fn() },
    appUserGuardian: { findMany: vi.fn() },
    notification: { updateMany: vi.fn() },
  },
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("@/queries/profile", () => ({ getProfileById: vi.fn() }))
vi.mock("@/lib/profile", () => ({ canManageProfile: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ notify: vi.fn(), markNotificationsRead: vi.fn() }))
vi.mock("@/lib/blob", () => ({ deleteBlobs: vi.fn() }))
vi.mock("@genealogiq/services/media-storage", () => ({ isAuthorizedMediaReference: vi.fn(() => true) }))

import { approveTribute, submitTribute, deleteTribute } from "./tribute.actions"
import { verifySession } from "@/lib/dal"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { deleteBlobs } from "@/lib/blob"
import { notify } from "@/lib/notifications"
import { isAuthorizedMediaReference } from "@genealogiq/services/media-storage"

beforeEach(() => {
  vi.clearAllMocks()
  // Default: a logged-in user who manages profile "A".
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "mgr" } } as never)
  vi.mocked(getProfileById).mockResolvedValue({ id: "A", guardedBy: [] } as never)
  vi.mocked(canManageProfile).mockReturnValue(true)
  prismaMock.appUserGuardian.findMany.mockResolvedValue([{ guardianId: "guardian-1" }])
  prismaMock.tribute.count.mockResolvedValue(0)
  vi.mocked(isAuthorizedMediaReference).mockReturnValue(true)
})

describe("submitTribute — separate memories on one profile", () => {
  it("creates two separate pending tributes instead of replacing the first", async () => {
    prismaMock.tribute.create.mockResolvedValueOnce({ id: "first" }).mockResolvedValueOnce({ id: "second" })

    expect(await submitTribute("A", { text: "First memory" })).toEqual({ ok: true, message: undefined })
    expect(await submitTribute("A", { text: "Second memory" })).toEqual({ ok: true, message: undefined })

    expect(prismaMock.tribute.create.mock.calls).toEqual([
      [{ data: { authorId: "mgr", profileId: "A", text: "First memory", imageUrl: null, status: "PENDING" } }],
      [{ data: { authorId: "mgr", profileId: "A", text: "Second memory", imageUrl: null, status: "PENDING" } }],
    ])
    expect(prismaMock.tribute.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.tribute.update).not.toHaveBeenCalled()
    expect(deleteBlobs).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ tributeId: "first", userId: "guardian-1" }))
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ tributeId: "second", userId: "guardian-1" }))
  })

  it("edits only the selected tribute and asks for fresh approval", async () => {
    prismaMock.tribute.findFirst.mockResolvedValue({ id: "first", imageUrl: null })
    prismaMock.tribute.update.mockResolvedValue({ id: "first" })
    await submitTribute("A", { text: "Changed memory" }, "first")
    expect(prismaMock.tribute.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { id: "first", authorId: "mgr", profileId: "A" }, select: { id: true, imageUrl: true },
    })
    expect(prismaMock.tribute.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "first", authorId: "mgr", profileId: "A" },
      data: { text: "Changed memory", imageUrl: null, status: "PENDING" },
    })
    expect(prismaMock.tribute.create).not.toHaveBeenCalled()
  })

  it.each(["another-author", "another-profile", "missing", ""])("rejects an unowned or stale edit ID: %s", async (id) => {
    prismaMock.tribute.findFirst.mockResolvedValue(null)
    expect(await submitTribute("A", { text: "Forbidden change" }, id)).toEqual({ ok: false, message: "tribute.notAuthorized" })
    expect(prismaMock.tribute.findFirst).toHaveBeenCalledWith({
      where: { id, authorId: "mgr", profileId: "A" }, select: { id: true, imageUrl: true },
    })
    expect(prismaMock.tribute.create).not.toHaveBeenCalled()
    expect(prismaMock.tribute.update).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    expect(deleteBlobs).not.toHaveBeenCalled()
  })

  it("keeps the self-tribute boundary", async () => {
    expect(await submitTribute("mgr", { text: "Self" })).toEqual({ ok: false, message: "tribute.cannotTributeSelf" })
    expect(prismaMock.tribute.create).not.toHaveBeenCalled()
  })

  it("rejects empty content and an image outside the authorized prefix", async () => {
    expect(await submitTribute("A", { text: "  " })).toEqual({ ok: false, message: "common.invalidData" })
    vi.mocked(isAuthorizedMediaReference).mockReturnValue(false)
    const imageUrl = "https://test.public.blob.vercel-storage.com/profiles/B/tributes/other/image.png"
    expect(await submitTribute("A", { text: "Memory", imageUrl })).toEqual({ ok: false, message: "common.invalidData" })
    expect(isAuthorizedMediaReference).toHaveBeenCalledWith(imageUrl, ["profiles/A/tributes/mgr"], { allowLegacy: false })
    expect(prismaMock.tribute.create).not.toHaveBeenCalled()
    expect(prismaMock.tribute.update).not.toHaveBeenCalled()
  })

  it.each([0, 1])("removes an image reference but keeps shared bytes when reference count is %s", async (references) => {
    prismaMock.tribute.findFirst.mockResolvedValue({ id: "first", imageUrl: "https://example.com/memory.png" })
    prismaMock.tribute.update.mockResolvedValue({ id: "first" })
    prismaMock.tribute.count.mockResolvedValue(references)
    await submitTribute("A", { text: "Keep the words" }, "first")
    expect(prismaMock.tribute.update).toHaveBeenCalledWith(expect.objectContaining({ data: { text: "Keep the words", imageUrl: null, status: "PENDING" } }))
    if (references) expect(deleteBlobs).not.toHaveBeenCalled()
    else expect(deleteBlobs).toHaveBeenCalledExactlyOnceWith(["https://example.com/memory.png"])
  })
})

describe("deleteTribute — separate tribute images", () => {
  it.each([0, 1])("deletes only the selected tribute and checks remaining image references: %s", async (references) => {
    prismaMock.tribute.findUnique.mockResolvedValue({ id: "first", authorId: "mgr", profileId: "A", imageUrl: "https://example.com/memory.png", profile: null })
    prismaMock.tribute.count.mockResolvedValue(references)
    expect(await deleteTribute("first")).toEqual({ ok: true, message: undefined })
    expect(prismaMock.tribute.delete).toHaveBeenCalledExactlyOnceWith({ where: { id: "first" } })
    if (references) expect(deleteBlobs).not.toHaveBeenCalled()
    else expect(deleteBlobs).toHaveBeenCalledExactlyOnceWith(["https://example.com/memory.png"])
  })
})

describe("approveTribute — C1 IDOR guard", () => {
  it("rejects a tribute that belongs to a DIFFERENT profile and never updates it", async () => {
    // Caller manages profile "A" but the tribute actually belongs to "B".
    prismaMock.tribute.findUnique.mockResolvedValue({ profileId: "B" })

    const res = await approveTribute("tribute-1", "A")

    expect(res).toEqual({ ok: false, message: "tribute.notAuthorized" })
    expect(prismaMock.tribute.update).not.toHaveBeenCalled()
  })

  it("approves a tribute that belongs to the managed profile", async () => {
    prismaMock.tribute.findUnique.mockResolvedValue({ profileId: "A" })
    prismaMock.tribute.update.mockResolvedValue({ authorId: "author-1" })
    prismaMock.notification.updateMany.mockResolvedValue({})

    const res = await approveTribute("tribute-1", "A")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.tribute.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tribute-1" }, data: { status: "APPROVED" } }),
    )
  })

  it("rejects when the caller cannot manage the profile (never reads the tribute)", async () => {
    vi.mocked(canManageProfile).mockReturnValue(false)

    const res = await approveTribute("tribute-1", "A")

    expect(res).toEqual({ ok: false, message: "tribute.notAuthorized" })
    expect(prismaMock.tribute.findUnique).not.toHaveBeenCalled()
  })
})
