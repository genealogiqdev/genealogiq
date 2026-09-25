import { describe, it, expect, vi, beforeEach } from "vitest"

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    geoPlace: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
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
vi.mock("@/lib/geo-quota", () => ({ getGuardianGeoPlacesStatus: vi.fn() }))

import { savePlace, deletePlace } from "./places.actions"
import { verifySession } from "@/lib/dal"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { getMemorialFeatures } from "@/lib/subscription"
import { getCombinedMediaUsage } from "@/queries/media-usage"
import { getGuardianGeoPlacesStatus } from "@/lib/geo-quota"
import { deleteBlobs } from "@/lib/blob"

const validData = {
  title: "Home",
  description: "",
  categories: ["birth"],
  address: { country: "BR" },
  lat: -22.9,
  lon: -43.1,
  photos: [] as string[],
  startDate: null,
  endDate: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "mgr" } } as never)
  vi.mocked(getProfileById).mockResolvedValue({ id: "A", guardedBy: [] } as never)
  vi.mocked(canManageProfile).mockReturnValue(true)
  vi.mocked(getMemorialFeatures).mockResolvedValue({ geoPlacesMax: 3, mediaMaxImages: 100 } as never)
  vi.mocked(getCombinedMediaUsage).mockResolvedValue({ images: 0, videos: 0 })
  vi.mocked(getGuardianGeoPlacesStatus).mockResolvedValue({ usage: 0, limit: 3 })
  prismaMock.geoPlace.count.mockResolvedValue(0)
})

describe("savePlace — guards", () => {
  it("rejects when the profile does not exist", async () => {
    vi.mocked(getProfileById).mockResolvedValue(null as never)
    const res = await savePlace("A", null, validData)
    expect(res).toEqual({ ok: false, message: "places.notAuthorized" })
    expect(prismaMock.geoPlace.create).not.toHaveBeenCalled()
  })

  it("rejects a caller who cannot manage the profile", async () => {
    vi.mocked(canManageProfile).mockReturnValue(false)
    const res = await savePlace("A", null, validData)
    expect(res).toEqual({ ok: false, message: "places.notAuthorized" })
    expect(prismaMock.geoPlace.create).not.toHaveBeenCalled()
  })

  it("rejects invalid input before writing", async () => {
    const res = await savePlace("A", null, { ...validData, categories: ["nope"] })
    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.geoPlace.create).not.toHaveBeenCalled()
  })
})

describe("savePlace — guardian-wide geo quota (always enforced)", () => {
  it("blocks creation at/over the limit", async () => {
    vi.mocked(getGuardianGeoPlacesStatus).mockResolvedValue({ usage: 3, limit: 3 })
    const res = await savePlace("A", null, validData)
    expect(res).toEqual({ ok: false, message: "places.limitReached" })
    expect(prismaMock.geoPlace.create).not.toHaveBeenCalled()
  })

  it("allows creation under the limit", async () => {
    vi.mocked(getGuardianGeoPlacesStatus).mockResolvedValue({ usage: 2, limit: 3 })
    prismaMock.geoPlace.create.mockResolvedValue({ id: "p1" })
    const res = await savePlace("A", null, validData)
    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.geoPlace.create).toHaveBeenCalled()
    expect(getGuardianGeoPlacesStatus).toHaveBeenCalledWith("mgr")
  })

  it("counts purchased extra slots toward the limit (via getGuardianGeoPlacesStatus)", async () => {
    // usage is already at the plan's base geoPlacesMax, but 1 purchased extra
    // raised the guardian-wide limit — creation should still succeed.
    vi.mocked(getGuardianGeoPlacesStatus).mockResolvedValue({ usage: 3, limit: 4 })
    prismaMock.geoPlace.create.mockResolvedValue({ id: "p1" })
    const res = await savePlace("A", null, validData)
    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.geoPlace.create).toHaveBeenCalled()
  })
})

describe("savePlace — combined image pool quota", () => {
  it("rejects a new place's photos when the combined pool is already full from Bio/Gallery", async () => {
    vi.mocked(getMemorialFeatures).mockResolvedValue({ geoPlacesMax: 3, mediaMaxImages: 2 } as never)
    vi.mocked(getCombinedMediaUsage).mockResolvedValue({ images: 2, videos: 0 })
    const res = await savePlace("A", null, {
      ...validData,
      photos: ["https://qa.public.blob.vercel-storage.com/a.jpg"],
    })
    expect(res).toEqual({ ok: false, message: "places.imageLimit" })
    expect(prismaMock.geoPlace.create).not.toHaveBeenCalled()
  })

  it("rejects adding photos to an existing place when it would exceed the combined pool", async () => {
    vi.mocked(getMemorialFeatures).mockResolvedValue({ geoPlacesMax: 3, mediaMaxImages: 2 } as never)
    // This place already has 1 photo (part of the combined total of 2); adding
    // 2 more would bring the total to 3, over the limit of 2.
    prismaMock.geoPlace.findFirst.mockResolvedValue({
      photos: ["https://qa.public.blob.vercel-storage.com/keep.jpg"],
    })
    vi.mocked(getCombinedMediaUsage).mockResolvedValue({ images: 2, videos: 0 })
    const res = await savePlace("A", "p1", {
      ...validData,
      photos: [
        "https://qa.public.blob.vercel-storage.com/keep.jpg",
        "https://qa.public.blob.vercel-storage.com/new1.jpg",
        "https://qa.public.blob.vercel-storage.com/new2.jpg",
      ],
    })
    expect(res).toEqual({ ok: false, message: "places.imageLimit" })
    expect(prismaMock.geoPlace.update).not.toHaveBeenCalled()
  })
})

describe("savePlace — create/update happy paths", () => {
  it("creates a place with order equal to the current count", async () => {
    prismaMock.geoPlace.count.mockResolvedValue(2)
    prismaMock.geoPlace.create.mockResolvedValue({ id: "p1" })
    const res = await savePlace("A", null, validData)
    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.geoPlace.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "A", order: 2 }) }),
    )
  })

  it("fails to update a place that does not belong to the profile", async () => {
    prismaMock.geoPlace.findFirst.mockResolvedValue(null)
    const res = await savePlace("A", "missing", validData)
    expect(res).toEqual({ ok: false, message: "places.notFound" })
    expect(prismaMock.geoPlace.update).not.toHaveBeenCalled()
  })

  it("updates an existing place and prunes stale photo blobs", async () => {
    prismaMock.geoPlace.findFirst.mockResolvedValue({
      photos: [
        "https://qa.public.blob.vercel-storage.com/keep.jpg",
        "https://qa.public.blob.vercel-storage.com/stale.jpg",
      ],
    })
    prismaMock.geoPlace.update.mockResolvedValue({ id: "p1" })
    const res = await savePlace("A", "p1", {
      ...validData,
      photos: ["https://qa.public.blob.vercel-storage.com/keep.jpg"],
    })
    expect(res).toEqual({ ok: true, message: undefined })
    expect(deleteBlobs).toHaveBeenCalledWith(["https://qa.public.blob.vercel-storage.com/stale.jpg"])
    expect(prismaMock.geoPlace.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" } }),
    )
  })
})

describe("deletePlace", () => {
  it("rejects a caller who cannot manage the profile", async () => {
    vi.mocked(canManageProfile).mockReturnValue(false)
    const res = await deletePlace("A", "p1")
    expect(res).toEqual({ ok: false, message: "places.notAuthorized" })
    expect(prismaMock.geoPlace.delete).not.toHaveBeenCalled()
  })

  it("deletes the place and its blobs on the happy path", async () => {
    prismaMock.geoPlace.findFirst.mockResolvedValue({
      photos: ["https://qa.public.blob.vercel-storage.com/x.jpg"],
    })
    prismaMock.geoPlace.delete.mockResolvedValue({})
    const res = await deletePlace("A", "p1")
    expect(res).toEqual({ ok: true, message: undefined })
    expect(deleteBlobs).toHaveBeenCalledWith(["https://qa.public.blob.vercel-storage.com/x.jpg"])
    expect(prismaMock.geoPlace.delete).toHaveBeenCalledWith({ where: { id: "p1" } })
  })
})
