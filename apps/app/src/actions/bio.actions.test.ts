import { describe, it, expect, vi, beforeEach } from "vitest"

// Prisma mock must be hoisted so it exists when the vi.mock factory runs.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    bio: { upsert: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
    bioImage: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// Identity translator: the returned "message" is the translation KEY.
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("@/queries/profile", () => ({ getProfileById: vi.fn() }))
vi.mock("@/lib/profile", () => ({ canManageProfile: vi.fn() }))
vi.mock("@/lib/blob", () => ({ deleteBlobs: vi.fn() }))
vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))
vi.mock("@/queries/media-usage", () => ({ getCombinedMediaUsage: vi.fn() }))
vi.mock("@genealogiq/services/media-storage", () => ({ isAuthorizedMediaReference: vi.fn(() => true) }))

import { saveBio, deleteBio } from "./bio.actions"
import { verifySession } from "@/lib/dal"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { getMemorialFeatures } from "@/lib/subscription"
import { getCombinedMediaUsage } from "@/queries/media-usage"
import { deleteBlobs } from "@/lib/blob"

const validImage = (url: string, order = 0) => ({
  url,
  aspect: "square" as const,
  order,
})

beforeEach(() => {
  vi.clearAllMocks()
  // Default: a logged-in user who manages profile "A" with generous quota.
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "mgr" } } as never)
  vi.mocked(getProfileById).mockResolvedValue({ id: "A", guardedBy: [] } as never)
  vi.mocked(canManageProfile).mockReturnValue(true)
  vi.mocked(getMemorialFeatures).mockResolvedValue({ bioMaxChars: 10000, mediaMaxImages: 10 } as never)
  vi.mocked(getCombinedMediaUsage).mockResolvedValue({ images: 0, videos: 0 })
  prismaMock.bioImage.count.mockResolvedValue(0)
  prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock))
})

describe("saveBio — ownership + validation guards", () => {
  it("fails when the profile does not exist (never touches the DB)", async () => {
    vi.mocked(getProfileById).mockResolvedValue(null as never)

    const res = await saveBio("A", { text: "hi", images: [] })

    expect(res).toEqual({ ok: false, message: "bio.profileNotFound" })
    expect(prismaMock.bio.upsert).not.toHaveBeenCalled()
  })

  it("rejects a caller who cannot manage the profile (never touches the DB)", async () => {
    vi.mocked(canManageProfile).mockReturnValue(false)

    const res = await saveBio("A", { text: "hi", images: [] })

    expect(res).toEqual({ ok: false, message: "bio.notAuthorized" })
    expect(prismaMock.bio.upsert).not.toHaveBeenCalled()
  })

  it("rejects invalid input before writing (bad image url fails zod)", async () => {
    const res = await saveBio("A", { text: "hi", images: [{ url: "not-a-url", order: 0 }] })

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.bio.upsert).not.toHaveBeenCalled()
  })

  it("enforces the bio character quota with the localized limit message", async () => {
    vi.mocked(getMemorialFeatures).mockResolvedValue({ bioMaxChars: 5, mediaMaxImages: 10 } as never)

    const res = await saveBio("A", { text: "way too long", images: [] })

    expect(res).toEqual({ ok: false, message: "bio.charLimit" })
    expect(prismaMock.bio.upsert).not.toHaveBeenCalled()
  })

  it("enforces the image-count quota with the localized limit message", async () => {
    vi.mocked(getMemorialFeatures).mockResolvedValue({ bioMaxChars: 10000, mediaMaxImages: 1 } as never)

    const res = await saveBio("A", {
      text: "ok",
      images: [
        validImage("https://qa.public.blob.vercel-storage.com/a.jpg", 0),
        validImage("https://qa.public.blob.vercel-storage.com/b.jpg", 1),
      ],
    })

    expect(res).toEqual({ ok: false, message: "bio.imageLimit" })
    expect(prismaMock.bio.upsert).not.toHaveBeenCalled()
  })

  it("rejects a new bio image when the combined pool is full from Gallery/Places, even with room in bio's own count", async () => {
    // mediaMaxImages is 10, but 10 are already used elsewhere (Gallery/Places)
    // and this bio currently has 0 of its own — adding 1 would exceed the pool.
    vi.mocked(getMemorialFeatures).mockResolvedValue({ bioMaxChars: 10000, mediaMaxImages: 10 } as never)
    vi.mocked(getCombinedMediaUsage).mockResolvedValue({ images: 10, videos: 0 })
    prismaMock.bioImage.count.mockResolvedValue(0)

    const res = await saveBio("A", {
      text: "ok",
      images: [validImage("https://qa.public.blob.vercel-storage.com/a.jpg", 0)],
    })

    expect(res).toEqual({ ok: false, message: "bio.imageLimit" })
    expect(prismaMock.bio.upsert).not.toHaveBeenCalled()
  })

  it("upserts the bio and replaces images on the happy path, pruning stale blobs", async () => {
    prismaMock.bio.upsert.mockResolvedValue({ id: "bio-1" })
    // The old image "stale.jpg" is no longer in the new set -> must be deleted.
    prismaMock.bioImage.findMany.mockResolvedValue([
      { url: "https://qa.public.blob.vercel-storage.com/keep.jpg" },
      { url: "https://qa.public.blob.vercel-storage.com/stale.jpg" },
    ])
    prismaMock.bioImage.deleteMany.mockResolvedValue({})
    prismaMock.bioImage.createMany.mockResolvedValue({})

    const res = await saveBio("A", {
      quote: "be kind",
      text: "a life well lived",
      images: [validImage("https://qa.public.blob.vercel-storage.com/keep.jpg", 0)],
    })

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.bio.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "A" } }),
    )
    expect(deleteBlobs).toHaveBeenCalledWith(["https://qa.public.blob.vercel-storage.com/stale.jpg"])
    expect(prismaMock.bioImage.createMany).toHaveBeenCalled()
  })
})

describe("deleteBio — ownership guard", () => {
  it("rejects a caller who cannot manage the profile (never deletes)", async () => {
    vi.mocked(canManageProfile).mockReturnValue(false)

    const res = await deleteBio("A")

    expect(res).toEqual({ ok: false, message: "bio.notAuthorized" })
    expect(prismaMock.bio.deleteMany).not.toHaveBeenCalled()
  })

  it("deletes the bio and its blobs on the happy path", async () => {
    prismaMock.bio.findUnique.mockResolvedValue({
      id: "bio-1",
      images: [{ url: "https://qa.public.blob.vercel-storage.com/x.jpg" }],
    })
    prismaMock.bio.deleteMany.mockResolvedValue({})

    const res = await deleteBio("A")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(deleteBlobs).toHaveBeenCalledWith(["https://qa.public.blob.vercel-storage.com/x.jpg"])
    expect(prismaMock.bio.deleteMany).toHaveBeenCalledWith({ where: { userId: "A" } })
  })
})
