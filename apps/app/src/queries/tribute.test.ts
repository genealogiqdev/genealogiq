import { beforeEach, describe, expect, it, vi } from "vitest"
const { tribute } = vi.hoisted(() => ({ tribute: { findFirst: vi.fn(), findMany: vi.fn() } }))
vi.mock("@/lib/prisma", () => ({ prisma: { tribute } }))
import { getMyTributeForProfile, getMyUnpublishedTributesForProfile, getApprovedTributesByProfileId } from "./tribute"
beforeEach(() => vi.clearAllMocks())

describe("tribute reads", () => {
  it("scopes an edit ID to both its author and its target profile", async () => {
    tribute.findFirst.mockResolvedValue(null)
    expect(await getMyTributeForProfile("author", "memorial", "selected")).toBeNull()
    expect(tribute.findFirst).toHaveBeenCalledExactlyOnceWith({ where: { id: "selected", authorId: "author", profileId: "memorial" } })
  })
  it("returns all unpublished tributes only for their author and profile", async () => {
    const rows = [{ id: "first", text: "First", status: "PENDING" }, { id: "second", text: "Second", status: "REJECTED" }]
    tribute.findMany.mockResolvedValue(rows)
    expect(await getMyUnpublishedTributesForProfile("author", "memorial")).toEqual(rows)
    expect(tribute.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { authorId: "author", profileId: "memorial", status: { in: ["PENDING", "REJECTED"] } },
      select: { id: true, text: true, status: true }, orderBy: { createdAt: "desc" },
    })
  })
  it("keeps pending and rejected content out of the public read", async () => {
    await getApprovedTributesByProfileId("memorial", 16)
    expect(tribute.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { profileId: "memorial", status: "APPROVED" },
      include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" }, take: 16,
    })
  })
})
