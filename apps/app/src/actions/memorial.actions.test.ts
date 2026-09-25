import { describe, it, expect, vi, beforeEach } from "vitest"

// Prisma mock must be hoisted so it exists when the vi.mock factory runs.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    appUser: { count: vi.fn(), create: vi.fn(), delete: vi.fn() },
    appSale: { findMany: vi.fn() },
    appUserGuardian: { create: vi.fn() },
    bio: { findUnique: vi.fn() },
    galleryItem: { findMany: vi.fn() },
    tribute: { findMany: vi.fn() },
    geolocation: { findUnique: vi.fn() },
    document: { findMany: vi.fn() },
    geoPlace: { findMany: vi.fn() },
  },
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// Identity translator: the returned message IS the key.
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("@/queries/profile", () => ({ getProfileById: vi.fn(), getProfileForEdit: vi.fn() }))
vi.mock("@/lib/profile", () => ({ canManageProfile: vi.fn() }))
vi.mock("@/lib/blob", () => ({ deleteBlobs: vi.fn() }))
vi.mock("@genealogiq/services/media-storage", () => ({ isAuthorizedMediaReference: vi.fn(() => true) }))
vi.mock("@/lib/memorial-quota", () => ({ getMemorialCreationStatus: vi.fn() }))

import { createMemorial, deleteMemorial } from "./memorial.actions"
import { verifySession } from "@/lib/dal"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { deleteBlobs } from "@/lib/blob"
import { getMemorialCreationStatus } from "@/lib/memorial-quota"

// A valid create payload (passes getMemorialSchema).
const validInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  gender: "FEMALE",
  birthDate: "1815-12-10",
  deathDate: "1852-11-27",
  avatarUrl: "https://example.public.blob.vercel-storage.com/a.png",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "mgr" } } as never)
  vi.mocked(canManageProfile).mockReturnValue(true)
  // Default: plenty of room under the guardian's memorialsMax.
  vi.mocked(getMemorialCreationStatus).mockResolvedValue({ count: 0, limit: 2, allowed: true })
  // Default create-path success wiring.
  prismaMock.appUser.create.mockResolvedValue({ id: "memo-1" })
  prismaMock.appUserGuardian.create.mockResolvedValue({})
  prismaMock.document.findMany.mockResolvedValue([])
  prismaMock.geoPlace.findMany.mockResolvedValue([])
})

describe("createMemorial — quota guard", () => {
  it("fails when the guardian is at their plan's memorial limit (never writes)", async () => {
    vi.mocked(getMemorialCreationStatus).mockResolvedValue({ count: 2, limit: 2, allowed: false })
    prismaMock.appSale.findMany.mockResolvedValue([])

    const res = await createMemorial(validInput)

    expect(res).toEqual({ ok: false, message: "memorial.limitReached" })
    expect(prismaMock.appUser.create).not.toHaveBeenCalled()
    expect(prismaMock.appUserGuardian.create).not.toHaveBeenCalled()
  })

  it("allows creation with no sale slot bound (assigns no appSaleId)", async () => {
    prismaMock.appSale.findMany.mockResolvedValue([])

    const res = await createMemorial(validInput)

    expect(res.ok).toBe(true)
    expect(res.ok && res.data).toEqual({ id: "memo-1" })
    expect(prismaMock.appUser.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "APP_MEMO" }) }),
    )
    // Guardian link is created so the caller can manage the new memorial.
    expect(prismaMock.appUserGuardian.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { appUserId: "memo-1", guardianId: "mgr" } }),
    )
  })

  // The bulk-slot model is gone: a new memorial is never bound to an AppSale,
  // and the guardian's memorialsMax is the only cap. Asserting the absence
  // matters more than asserting the old binding did — without it, someone
  // reintroducing appSaleId here would silently restore the extra free QR code
  // that binding used to grant through qr-quota's hasOwnUnlock.
  it("never binds the new memorial to a sale, whatever sales the guardian holds", async () => {
    prismaMock.appSale.findMany.mockResolvedValue([
      { id: "sale-open", _count: { assignedTo: 0 } },
    ])

    const res = await createMemorial(validInput)

    expect(res.ok).toBe(true)
    const arg = prismaMock.appUser.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data).not.toHaveProperty("appSaleId")
    expect(prismaMock.appSale.findMany).not.toHaveBeenCalled()
  })
})

describe("createMemorial — input validation", () => {
  it("rejects invalid input and never touches the DB write", async () => {
    prismaMock.appSale.findMany.mockResolvedValue([])

    const res = await createMemorial({ firstName: "" }) // missing required fields

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.appUser.create).not.toHaveBeenCalled()
  })
})

describe("deleteMemorial — guards + cascade", () => {
  it("fails when the profile is not found", async () => {
    vi.mocked(getProfileById).mockResolvedValue(null as never)

    const res = await deleteMemorial("nope")

    expect(res).toEqual({ ok: false, message: "memorial.notFound" })
    expect(prismaMock.appUser.delete).not.toHaveBeenCalled()
  })

  it("fails when the profile is not a memorial (wrong role)", async () => {
    vi.mocked(getProfileById).mockResolvedValue({ id: "p", role: "APP_USER", guardedBy: [] } as never)

    const res = await deleteMemorial("p")

    expect(res).toEqual({ ok: false, message: "memorial.notFound" })
    expect(prismaMock.appUser.delete).not.toHaveBeenCalled()
  })

  it("fails when the caller cannot manage the profile (guardian guard)", async () => {
    vi.mocked(getProfileById).mockResolvedValue({ id: "p", role: "APP_MEMO", guardedBy: [] } as never)
    vi.mocked(canManageProfile).mockReturnValue(false)

    const res = await deleteMemorial("p")

    expect(res).toEqual({ ok: false, message: "memorial.notAuthorized" })
    expect(prismaMock.appUser.delete).not.toHaveBeenCalled()
    expect(vi.mocked(deleteBlobs)).not.toHaveBeenCalled()
  })

  it("deletes the memorial and its blobs on the happy path", async () => {
    vi.mocked(getProfileById).mockResolvedValue({
      id: "p",
      role: "APP_MEMO",
      guardedBy: [{ guardianId: "mgr" }],
      avatarUrl: "https://example.public.blob.vercel-storage.com/avatar.png",
    } as never)
    prismaMock.bio.findUnique.mockResolvedValue({ images: [{ url: "bio-1.png" }] })
    prismaMock.galleryItem.findMany.mockResolvedValue([{ url: "gallery-1.png", poster: "poster-1.png" }])
    prismaMock.tribute.findMany.mockResolvedValue([{ imageUrl: "tribute-1.png" }])
    prismaMock.geolocation.findUnique.mockResolvedValue({ photo1: "geo-1.png", photo2: null, photo3: null })
    prismaMock.document.findMany.mockResolvedValue([{ fileUrl: "document-1.pdf" }])
    prismaMock.geoPlace.findMany.mockResolvedValue([{ photos: ["place-1.png"] }])
    prismaMock.appUser.delete.mockResolvedValue({})

    const res = await deleteMemorial("p")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.appUser.delete).toHaveBeenCalledWith({ where: { id: "p" } })
    // Every collected blob URL is handed to deleteBlobs after the row is removed.
    const passedUrls = vi.mocked(deleteBlobs).mock.calls[0]?.[0]
    expect(passedUrls).toEqual(
      expect.arrayContaining([
        "https://example.public.blob.vercel-storage.com/avatar.png",
        "bio-1.png",
        "gallery-1.png",
        "poster-1.png",
        "tribute-1.png",
        "document-1.pdf",
        "place-1.png",
        "geo-1.png",
      ]),
    )
  })
})
