import { describe, it, expect, vi, beforeEach } from "vitest"

// Prisma mock must be hoisted so it exists when the vi.mock factory runs.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    tribute: { findUnique: vi.fn(), update: vi.fn() },
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

import { approveTribute } from "./tribute.actions"
import { verifySession } from "@/lib/dal"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"

beforeEach(() => {
  vi.clearAllMocks()
  // Default: a logged-in user who manages profile "A".
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "mgr" } } as never)
  vi.mocked(getProfileById).mockResolvedValue({ id: "A", guardedBy: [] } as never)
  vi.mocked(canManageProfile).mockReturnValue(true)
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
