import { describe, it, expect, vi, beforeEach } from "vitest"

// Prisma mock must be hoisted so it exists when the vi.mock factory runs.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    galleryItem: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("@/queries/profile", () => ({ getProfileById: vi.fn() }))
vi.mock("@/lib/profile", () => ({ canManageProfile: vi.fn() }))
vi.mock("@/lib/blob", () => ({ deleteBlobs: vi.fn() }))
vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))
vi.mock("@/queries/media-usage", () => ({ getCombinedMediaUsage: vi.fn() }))
vi.mock("@genealogiq/services/media-storage", () => ({ isAuthorizedMediaReference: vi.fn(() => true) }))

import { saveGallery, deleteGallery } from "./gallery.actions"
import { verifySession } from "@/lib/dal"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { deleteBlobs } from "@/lib/blob"
import { getMemorialFeatures } from "@/lib/subscription"
import { getCombinedMediaUsage } from "@/queries/media-usage"

// A valid image item that satisfies mediaItemSchema (url must be a real URL).
const img = (n: number) => ({
  id: `i${n}`,
  kind: "image" as const,
  url: `https://qa.public.blob.vercel-storage.com/img-${n}.jpg`,
  order: n,
})
const vid = (n: number) => ({
  id: `v${n}`,
  kind: "video" as const,
  url: `https://qa.public.blob.vercel-storage.com/vid-${n}.mp4`,
  order: n,
})

beforeEach(() => {
  vi.clearAllMocks()
  // Default: a logged-in user who manages profile "A" with generous quota.
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "mgr" } } as never)
  vi.mocked(getProfileById).mockResolvedValue({ id: "A", guardedBy: [] } as never)
  vi.mocked(canManageProfile).mockReturnValue(true)
  vi.mocked(getMemorialFeatures).mockResolvedValue({
    mediaMaxImages: 10,
    mediaMaxVideos: 3,
  } as never)
  vi.mocked(getCombinedMediaUsage).mockResolvedValue({ images: 0, videos: 0 })
  prismaMock.galleryItem.findMany.mockResolvedValue([])
  prismaMock.galleryItem.deleteMany.mockResolvedValue({})
  prismaMock.galleryItem.createMany.mockResolvedValue({})
  prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock))
  prismaMock.galleryItem.count.mockResolvedValue(0)
})

describe("saveGallery — ownership guard", () => {
  it("rejects when the profile does not exist (never touches the DB)", async () => {
    vi.mocked(getProfileById).mockResolvedValue(null as never)

    const res = await saveGallery("A", { items: [img(0)] })

    expect(res).toEqual({ ok: false, message: "gallery.notAuthorized" })
    expect(prismaMock.galleryItem.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.galleryItem.createMany).not.toHaveBeenCalled()
  })

  it("rejects when the caller cannot manage the profile (never touches the DB)", async () => {
    vi.mocked(canManageProfile).mockReturnValue(false)

    const res = await saveGallery("A", { items: [img(0)] })

    expect(res).toEqual({ ok: false, message: "gallery.notAuthorized" })
    expect(getMemorialFeatures).not.toHaveBeenCalled()
    expect(prismaMock.galleryItem.deleteMany).not.toHaveBeenCalled()
  })
})

describe("saveGallery — input validation", () => {
  it("rejects malformed input before quota check or any DB write", async () => {
    // `url` is not a valid URL → mediaItemSchema fails.
    const res = await saveGallery("A", { items: [{ kind: "image", url: "not-a-url", order: 0 }] })

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(getMemorialFeatures).not.toHaveBeenCalled()
    expect(prismaMock.galleryItem.createMany).not.toHaveBeenCalled()
  })
})

describe("saveGallery — max-count quota", () => {
  it("rejects when image count exceeds mediaMaxImages (no DB write)", async () => {
    vi.mocked(getMemorialFeatures).mockResolvedValue({
      mediaMaxImages: 2,
      mediaMaxVideos: 3,
    } as never)

    const res = await saveGallery("A", { items: [img(0), img(1), img(2)] })

    expect(res).toEqual({ ok: false, message: "gallery.imageLimit" })
    expect(prismaMock.galleryItem.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.galleryItem.createMany).not.toHaveBeenCalled()
  })

  it("rejects when video count exceeds mediaMaxVideos (no DB write)", async () => {
    vi.mocked(getMemorialFeatures).mockResolvedValue({
      mediaMaxImages: 10,
      mediaMaxVideos: 1,
    } as never)

    const res = await saveGallery("A", { items: [vid(0), vid(1)] })

    expect(res).toEqual({ ok: false, message: "gallery.videoLimit" })
    expect(prismaMock.galleryItem.createMany).not.toHaveBeenCalled()
  })

  it("rejects a new image when the combined pool is full from Bio/Places, even with room in gallery's own count", async () => {
    vi.mocked(getMemorialFeatures).mockResolvedValue({ mediaMaxImages: 10, mediaMaxVideos: 3 } as never)
    vi.mocked(getCombinedMediaUsage).mockResolvedValue({ images: 10, videos: 0 })
    prismaMock.galleryItem.count.mockResolvedValue(0)

    const res = await saveGallery("A", { items: [img(0)] })

    expect(res).toEqual({ ok: false, message: "gallery.imageLimit" })
    expect(prismaMock.galleryItem.createMany).not.toHaveBeenCalled()
  })
})

describe("saveGallery — reorder/replace happy path", () => {
  it("deletes orphaned blobs, replaces rows in order, and returns done()", async () => {
    // Existing rows: one stays (img-0), one is removed (old).
    prismaMock.galleryItem.findMany.mockResolvedValue([
      { url: "https://qa.public.blob.vercel-storage.com/img-0.jpg", poster: null },
      { url: "https://qa.public.blob.vercel-storage.com/old.jpg", poster: "https://qa.public.blob.vercel-storage.com/old-poster.jpg" },
    ])

    // Reordered set: img(1) first, img(0) second.
    const res = await saveGallery("A", { items: [img(1), img(0)] })

    expect(res).toEqual({ ok: true, message: undefined })
    // Only the blob no longer referenced is deleted.
    expect(deleteBlobs).toHaveBeenCalledWith([
      "https://qa.public.blob.vercel-storage.com/old.jpg",
      "https://qa.public.blob.vercel-storage.com/old-poster.jpg",
    ])
    expect(prismaMock.galleryItem.deleteMany).toHaveBeenCalledWith({ where: { userId: "A" } })
    // `order` is re-derived from array index, proving the reorder is persisted.
    const createArg = prismaMock.galleryItem.createMany.mock.calls[0][0]
    expect(createArg.data).toEqual([
      expect.objectContaining({ order: 0, userId: "A" }),
      expect.objectContaining({ order: 1, userId: "A" }),
    ])
    // The client-supplied id is NOT persisted — the DB generates the cuid.
    expect(createArg.data[0]).not.toHaveProperty("id")
  })

  it("clears the gallery (empty items) without calling createMany", async () => {
    prismaMock.galleryItem.findMany.mockResolvedValue([
      { url: "https://qa.public.blob.vercel-storage.com/img-0.jpg" },
    ])

    const res = await saveGallery("A", { items: [] })

    expect(res).toEqual({ ok: true, message: undefined })
    expect(deleteBlobs).toHaveBeenCalledWith(["https://qa.public.blob.vercel-storage.com/img-0.jpg"])
    expect(prismaMock.galleryItem.deleteMany).toHaveBeenCalledWith({ where: { userId: "A" } })
    expect(prismaMock.galleryItem.createMany).not.toHaveBeenCalled()
  })
})

describe("deleteGallery — ownership guard", () => {
  it("rejects when the caller cannot manage the profile (never touches the DB)", async () => {
    vi.mocked(canManageProfile).mockReturnValue(false)

    const res = await deleteGallery("A")

    expect(res).toEqual({ ok: false, message: "gallery.notAuthorized" })
    expect(prismaMock.galleryItem.deleteMany).not.toHaveBeenCalled()
    expect(deleteBlobs).not.toHaveBeenCalled()
  })

  it("removes all blobs and rows then returns done()", async () => {
    prismaMock.galleryItem.findMany.mockResolvedValue([
      { url: "https://qa.public.blob.vercel-storage.com/img-0.jpg" },
      { url: "https://qa.public.blob.vercel-storage.com/img-1.jpg" },
    ])

    const res = await deleteGallery("A")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(deleteBlobs).toHaveBeenCalledWith([
      "https://qa.public.blob.vercel-storage.com/img-0.jpg",
      "https://qa.public.blob.vercel-storage.com/img-1.jpg",
    ])
    expect(prismaMock.galleryItem.deleteMany).toHaveBeenCalledWith({ where: { userId: "A" } })
  })
})
