import { describe, it, expect, vi, beforeEach } from "vitest"

// Prisma mock must be hoisted so it exists when the vi.mock factory runs.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    geolocation: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("@/queries/profile", () => ({ getProfileById: vi.fn() }))
vi.mock("@/lib/profile", () => ({ canManageProfile: vi.fn() }))
vi.mock("@/lib/blob", () => ({ deleteBlobs: vi.fn() }))
vi.mock("@genealogiq/services/media-storage", () => ({ isAuthorizedMediaReference: vi.fn(() => true) }))
vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))
// NOTE: the Zod schema (@/schemas/geolocation) and identityTranslator are NOT mocked —
// the real validation runs so we can exercise the notes-max / invalidData branch.

import { saveGeolocation, deleteGeolocation } from "./geolocation.actions"
import { verifySession } from "@/lib/dal"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { deleteBlobs } from "@/lib/blob"
import { getMemorialFeatures } from "@/lib/subscription"

const validInput = {
  placeName: "Cemetery of Rest",
  address: { city: "Rio", country: "BR" },
  section: "Block 4",
  lat: -22.95,
  lon: -43.18,
  notes: "By the old oak tree.",
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: a logged-in user who manages profile "A".
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "mgr" } } as never)
  vi.mocked(getProfileById).mockResolvedValue({ id: "A", guardedBy: [] } as never)
  vi.mocked(canManageProfile).mockReturnValue(true)
  vi.mocked(getMemorialFeatures).mockResolvedValue({ geolocationFullAccess: true } as never)
  prismaMock.geolocation.findUnique.mockResolvedValue(null)
  prismaMock.geolocation.upsert.mockResolvedValue({})
  prismaMock.geolocation.deleteMany.mockResolvedValue({})
})

describe("saveGeolocation — authorization guard", () => {
  it("rejects when the caller cannot manage the profile and never touches the DB", async () => {
    vi.mocked(canManageProfile).mockReturnValue(false)

    const res = await saveGeolocation("A", validInput)

    expect(res).toEqual({ ok: false, message: "geolocation.notAuthorized" })
    expect(prismaMock.geolocation.upsert).not.toHaveBeenCalled()
  })

  it("rejects when the profile does not exist", async () => {
    vi.mocked(getProfileById).mockResolvedValue(null as never)

    const res = await saveGeolocation("A", validInput)

    expect(res).toEqual({ ok: false, message: "geolocation.notAuthorized" })
    expect(prismaMock.geolocation.upsert).not.toHaveBeenCalled()
  })
})

describe("saveGeolocation — input validation", () => {
  it("rejects invalid input before touching the DB (missing placeName)", async () => {
    const res = await saveGeolocation("A", { ...validInput, placeName: "" })

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.geolocation.upsert).not.toHaveBeenCalled()
  })

  it("rejects when notes exceed the 500-char max", async () => {
    const res = await saveGeolocation("A", { ...validInput, notes: "x".repeat(501) })

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.geolocation.upsert).not.toHaveBeenCalled()
  })
})

describe("saveGeolocation — success path", () => {
  it("upserts and returns ok on the happy path", async () => {
    const res = await saveGeolocation("A", validInput)

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.geolocation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "A" } }),
    )
  })

  // Coordinates used to be blanked to 0/0 for any tier without
  // geolocationFullAccess. Precise location is free now, so they must survive
  // the round trip unchanged — this is the inverse of the test it replaced.
  it("stores the submitted coordinates as-is, for every tier", async () => {
    const res = await saveGeolocation("A", validInput)

    expect(res.ok).toBe(true)
    const arg = prismaMock.geolocation.upsert.mock.calls[0][0]
    expect(arg.create).toMatchObject({ lat: validInput.lat, lon: validInput.lon })
    expect(arg.update).toMatchObject({ lat: validInput.lat, lon: validInput.lon })
  })

  it("deletes orphaned photo blobs that are no longer referenced", async () => {
    prismaMock.geolocation.findUnique.mockResolvedValue({
      photo1: "https://qa.public.blob.vercel-storage.com/old-1.jpg",
      photo2: "https://qa.public.blob.vercel-storage.com/keep-2.jpg",
      photo3: null,
    })

    await saveGeolocation("A", {
      ...validInput,
      photo1: null,
      photo2: "https://qa.public.blob.vercel-storage.com/keep-2.jpg",
    })

    // old-1 is dropped; keep-2 is still referenced so it stays.
    expect(deleteBlobs).toHaveBeenCalledWith(["https://qa.public.blob.vercel-storage.com/old-1.jpg"])
  })
})

describe("deleteGeolocation — authorization guard", () => {
  it("rejects when the caller cannot manage the profile and never deletes", async () => {
    vi.mocked(canManageProfile).mockReturnValue(false)

    const res = await deleteGeolocation("A")

    expect(res).toEqual({ ok: false, message: "geolocation.notAuthorized" })
    expect(prismaMock.geolocation.deleteMany).not.toHaveBeenCalled()
  })

  it("deletes the geolocation and returns ok on the happy path", async () => {
    prismaMock.geolocation.findUnique.mockResolvedValue({
      photo1: "https://qa.public.blob.vercel-storage.com/p1.jpg",
      photo2: null,
      photo3: null,
    })

    const res = await deleteGeolocation("A")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(deleteBlobs).toHaveBeenCalledWith(["https://qa.public.blob.vercel-storage.com/p1.jpg", null, null])
    expect(prismaMock.geolocation.deleteMany).toHaveBeenCalledWith({ where: { userId: "A" } })
  })
})
