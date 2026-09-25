import { describe, it, expect, vi, beforeEach } from "vitest"

// Prisma mock must be hoisted so it exists when the vi.mock factory runs.
const { prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    appUser: { create: vi.fn(), update: vi.fn() },
    appUserGuardian: { create: vi.fn() },
    petOwnership: { createMany: vi.fn(), deleteMany: vi.fn() },
  }
  const prismaMock = {
    appUser: { findMany: vi.fn(), count: vi.fn(), update: vi.fn(), delete: vi.fn() },
    petOwnership: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    bio: { findUnique: vi.fn() },
    galleryItem: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
    geoPlace: { findMany: vi.fn() },
    geolocation: { findUnique: vi.fn() },
    tribute: { findMany: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof txMock) => unknown) => cb(txMock)),
  }
  return { prismaMock, txMock }
})

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// Identity translator: the returned message IS the key.
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("@/queries/profile", () => ({ getProfileById: vi.fn(), getProfileForEdit: vi.fn() }))
vi.mock("@/lib/profile", () => ({ canManageProfile: vi.fn() }))
vi.mock("@/lib/blob", () => ({ deleteBlobs: vi.fn() }))
vi.mock("@/lib/pet-quota", () => ({ getPetCreationStatus: vi.fn() }))
vi.mock("@/queries/family-tree", () => ({ getTreeMemberIds: vi.fn() }))
vi.mock("@genealogiq/services/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfter: 0 })),
}))
vi.mock("@genealogiq/services/media-storage", () => ({ isAuthorizedMediaReference: vi.fn(() => true) }))

import { attachPet, createPet, deletePet, detachPetFromTree, updatePet } from "./pet.actions"
import { verifySession } from "@/lib/dal"
import { getProfileById, getProfileForEdit } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { deleteBlobs } from "@/lib/blob"
import { getPetCreationStatus } from "@/lib/pet-quota"
import { getTreeMemberIds } from "@/queries/family-tree"

// ownerIds go through z.string().cuid(), so fixtures need cuid-shaped ids.
const OWNER_1 = "clowner1000000000000000001"
const OWNER_2 = "clowner2000000000000000002"
const STRANGER = "clstranger00000000000000003"

const validInput = {
  firstName: "Rex",
  species: "Dog",
  breed: "Golden Retriever",
  gender: "MALE",
  birthDate: "2020-01-01",
  deathDate: null,
  avatarUrl: null,
  ownerIds: [OWNER_1],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifySession).mockResolvedValue({ user: { id: OWNER_1 } } as never)
  vi.mocked(canManageProfile).mockReturnValue(true)
  vi.mocked(getPetCreationStatus).mockResolvedValue({ count: 0, limit: 2, allowed: true })
  prismaMock.tribute.findMany.mockResolvedValue([])
  vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([OWNER_1, OWNER_2]))
  vi.mocked(getProfileById).mockResolvedValue({ id: OWNER_1, role: "APP_USER", guardedBy: [] } as never)
  prismaMock.appUser.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
    Promise.resolve(where.id.in.map((id) => ({ id }))),
  )
  prismaMock.appUser.count.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
    Promise.resolve(where.id.in.length),
  )
  prismaMock.petOwnership.findMany.mockResolvedValue([])
  prismaMock.petOwnership.upsert.mockResolvedValue({})
  prismaMock.petOwnership.deleteMany.mockResolvedValue({ count: 0 })
  txMock.appUser.create.mockResolvedValue({ id: "pet-1" })
  txMock.appUser.update.mockResolvedValue({})
  txMock.appUserGuardian.create.mockResolvedValue({})
  txMock.petOwnership.createMany.mockResolvedValue({ count: 1 })
  txMock.petOwnership.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.geolocation.findUnique.mockResolvedValue(null)
})

describe("createPet — quota guard", () => {
  it("fails when the guardian is at their plan's pet limit (never writes)", async () => {
    vi.mocked(getPetCreationStatus).mockResolvedValue({ count: 2, limit: 2, allowed: false })

    const res = await createPet(validInput)

    expect(res).toEqual({ ok: false, message: "pet.limitReached" })
    expect(txMock.appUser.create).not.toHaveBeenCalled()
  })
})

describe("createPet — owner IDOR guard", () => {
  it("fails when a proposed owner isn't a member of the caller's own tree", async () => {
    vi.mocked(getTreeMemberIds).mockResolvedValue(new Set([OWNER_1]))

    const res = await createPet({ ...validInput, ownerIds: [OWNER_1, STRANGER] })

    expect(res).toEqual({ ok: false, message: "pet.ownerNotInTree" })
    expect(txMock.appUser.create).not.toHaveBeenCalled()
  })

  it("rejects a pet as another pet's owner even when it is in the tree payload", async () => {
    prismaMock.appUser.findMany.mockResolvedValue([])

    const res = await createPet({ ...validInput, ownerIds: [OWNER_2] })

    expect(res).toEqual({ ok: false, message: "pet.ownerNotInTree" })
    expect(txMock.appUser.create).not.toHaveBeenCalled()
  })
})

describe("createPet — input validation", () => {
  it("rejects invalid input and never touches the DB write", async () => {
    const res = await createPet({ firstName: "" })

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(txMock.appUser.create).not.toHaveBeenCalled()
  })

  it("rejects when ownerIds is empty", async () => {
    const res = await createPet({ ...validInput, ownerIds: [] })

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(txMock.appUser.create).not.toHaveBeenCalled()
  })
})

describe("createPet — happy path", () => {
  it("creates the pet, a guardian row for the caller, and an ownership per owner", async () => {
    const res = await createPet({ ...validInput, ownerIds: [OWNER_1, OWNER_2] })

    expect(res.ok).toBe(true)
    expect(res.ok && res.data).toEqual({ id: "pet-1" })
    expect(txMock.appUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "APP_PET", firstName: "Rex", lastName: "", petSpecies: "Dog", petBreed: "Golden Retriever" }),
      }),
    )
    expect(txMock.appUserGuardian.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { appUserId: "pet-1", guardianId: OWNER_1 } }),
    )
    expect(txMock.petOwnership.createMany).toHaveBeenCalledWith({
      data: [
        { petId: "pet-1", ownerId: OWNER_1 },
        { petId: "pet-1", ownerId: OWNER_2 },
      ],
    })
  })

  it("dedupes repeated owner ids", async () => {
    await createPet({ ...validInput, ownerIds: [OWNER_1, OWNER_1] })

    expect(txMock.petOwnership.createMany).toHaveBeenCalledWith({
      data: [{ petId: "pet-1", ownerId: OWNER_1 }],
    })
  })
})

describe("updatePet — guards", () => {
  it("fails when the profile is not found", async () => {
    vi.mocked(getProfileForEdit).mockResolvedValue(null as never)

    const res = await updatePet("nope", validInput)

    expect(res).toEqual({ ok: false, message: "pet.notFound" })
    expect(prismaMock.appUser.update).not.toHaveBeenCalled()
  })

  it("fails when the profile is not a pet (wrong role)", async () => {
    vi.mocked(getProfileForEdit).mockResolvedValue({ id: "p", role: "APP_MEMO", guardedBy: [] } as never)

    const res = await updatePet("p", validInput)

    expect(res).toEqual({ ok: false, message: "pet.notFound" })
    expect(prismaMock.appUser.update).not.toHaveBeenCalled()
  })

  it("fails when the caller cannot manage the profile", async () => {
    vi.mocked(getProfileForEdit).mockResolvedValue({ id: "p", role: "APP_PET", guardedBy: [] } as never)
    vi.mocked(canManageProfile).mockReturnValue(false)

    const res = await updatePet("p", validInput)

    expect(res).toEqual({ ok: false, message: "pet.notAuthorized" })
    expect(prismaMock.appUser.update).not.toHaveBeenCalled()
  })

  it("updates identity fields on the happy path", async () => {
    vi.mocked(getProfileForEdit).mockResolvedValue({
      id: "p", role: "APP_PET", guardedBy: [{ guardianId: "owner-1" }], avatarUrl: null,
    } as never)

    const res = await updatePet("p", {
      firstName: "Rex",
      species: "Dog",
      breed: null,
      gender: null,
      birthDate: null,
      deathDate: null,
      avatarUrl: null,
      ownerIds: [OWNER_1],
    })

    expect(res).toEqual({ ok: true, message: undefined })
    expect(txMock.appUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p" }, data: expect.objectContaining({ firstName: "Rex", petSpecies: "Dog" }) }),
    )
  })
})

describe("pet ownership actions", () => {
  it("attaches a managed pet to a human member without consuming creation quota", async () => {
    vi.mocked(getProfileById)
      .mockResolvedValueOnce({ id: "pet-1", role: "APP_PET", guardedBy: [{ guardianId: OWNER_1 }] } as never)
      .mockResolvedValueOnce({ id: OWNER_1, role: "APP_USER", guardedBy: [] } as never)

    const res = await attachPet(OWNER_1, "pet-1", OWNER_2)

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.petOwnership.upsert).toHaveBeenCalledWith({
      where: { petId_ownerId: { petId: "pet-1", ownerId: OWNER_2 } },
      create: { petId: "pet-1", ownerId: OWNER_2 },
      update: {},
    })
    expect(getPetCreationStatus).not.toHaveBeenCalled()
  })

  it("does not detach the final owner from a pet", async () => {
    prismaMock.petOwnership.findMany.mockResolvedValue([{ id: "own-1", ownerId: OWNER_1 }])

    const res = await detachPetFromTree(OWNER_1, "pet-1")

    expect(res).toEqual({ ok: false, message: "pet.ownerRequired" })
    expect(prismaMock.petOwnership.deleteMany).not.toHaveBeenCalled()
  })
})

describe("deletePet — guards + cascade", () => {
  it("fails when the profile is not a pet (wrong role)", async () => {
    vi.mocked(getProfileById).mockResolvedValue({ id: "p", role: "APP_USER", guardedBy: [] } as never)

    const res = await deletePet("p")

    expect(res).toEqual({ ok: false, message: "pet.notFound" })
    expect(prismaMock.appUser.delete).not.toHaveBeenCalled()
  })

  it("fails when the caller cannot manage the profile", async () => {
    vi.mocked(getProfileById).mockResolvedValue({ id: "p", role: "APP_PET", guardedBy: [] } as never)
    vi.mocked(canManageProfile).mockReturnValue(false)

    const res = await deletePet("p")

    expect(res).toEqual({ ok: false, message: "pet.notAuthorized" })
    expect(prismaMock.appUser.delete).not.toHaveBeenCalled()
    expect(vi.mocked(deleteBlobs)).not.toHaveBeenCalled()
  })

  it("deletes the pet and its blobs on the happy path", async () => {
    vi.mocked(getProfileById).mockResolvedValue({
      id: "p", role: "APP_PET", guardedBy: [{ guardianId: "owner-1" }],
      avatarUrl: "https://example.public.blob.vercel-storage.com/avatar.png",
    } as never)
    prismaMock.bio.findUnique.mockResolvedValue({ images: [{ url: "bio-1.png" }] })
    prismaMock.galleryItem.findMany.mockResolvedValue([{ url: "gallery-1.png", poster: "poster-1.png" }])
    prismaMock.document.findMany.mockResolvedValue([{ fileUrl: "doc-1.pdf" }])
    prismaMock.geoPlace.findMany.mockResolvedValue([{ photos: ["place-1.png"] }])
    prismaMock.geolocation.findUnique.mockResolvedValue({ photo1: "rest-1.png", photo2: null, photo3: null })
    prismaMock.petOwnership.findMany.mockResolvedValue([{ ownerId: OWNER_1 }])
    prismaMock.tribute.findMany.mockResolvedValue([{ imageUrl: "tribute-1.png" }])
    prismaMock.appUser.delete.mockResolvedValue({})

    const res = await deletePet("p")

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.appUser.delete).toHaveBeenCalledWith({ where: { id: "p" } })
    const passedUrls = vi.mocked(deleteBlobs).mock.calls[0]?.[0]
    expect(passedUrls).toEqual(
      expect.arrayContaining([
        "https://example.public.blob.vercel-storage.com/avatar.png",
        "bio-1.png",
        "gallery-1.png",
        "poster-1.png",
        "doc-1.pdf",
        "place-1.png",
        "rest-1.png",
        "tribute-1.png",
      ]),
    )
  })
})
