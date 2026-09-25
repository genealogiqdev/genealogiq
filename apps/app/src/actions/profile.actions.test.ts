import { describe, it, expect, vi, beforeEach } from "vitest"

// Prisma mock must be hoisted so it exists when the vi.mock factory runs.
const { prismaMock, isAuthorizedMediaReference } = vi.hoisted(() => ({
  prismaMock: {
    appUser: { findUnique: vi.fn(), update: vi.fn() },
    address: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
  isAuthorizedMediaReference: vi.fn(() => true),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// Identity translator: the returned "message" is the translation KEY.
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("@/lib/blob", () => ({ deleteBlobs: vi.fn() }))
vi.mock("@genealogiq/services/media-storage", () => ({ isAuthorizedMediaReference }))

import { updateProfile } from "./profile.actions"
import { verifySession } from "@/lib/dal"
import { deleteBlobs } from "@/lib/blob"

// Minimal payload that passes getProfileEditSchema for a living profile: name,
// gender and birth date/city/state/country are all required now; address object
// must be present (its sub-fields are all nullish); isPublicProfile is required
// (the form always submits it via the privacy Switch's controlled value).
const validInput = (overrides: Record<string, unknown> = {}) => ({
  firstName: "Ada",
  lastName: "Lovelace",
  gender: "FEMALE",
  birthDate: "1815-12-10",
  birthPlace: "London",
  birthState: "England",
  birthCountry: "GB",
  address: {},
  isPublicProfile: true,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  isAuthorizedMediaReference.mockReturnValue(true)
  // Self-scoped: the only identity that matters is the live session user.
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "self" } } as never)
  prismaMock.appUser.findUnique.mockResolvedValue({ avatarUrl: null, addressId: null })
  prismaMock.appUser.update.mockResolvedValue({})
})

describe("updateProfile — input validation", () => {
  it("rejects invalid input before touching the DB (missing firstName fails zod)", async () => {
    const res = await updateProfile(validInput({ firstName: "" }))

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.appUser.update).not.toHaveBeenCalled()
    expect(prismaMock.appUser.findUnique).not.toHaveBeenCalled()
  })

  it("rejects when the newly-required fields are missing (gender / birth)", async () => {
    const res = await updateProfile({ firstName: "Ada", lastName: "Lovelace" })

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.appUser.update).not.toHaveBeenCalled()
  })

  it("rejects a non-object payload before touching the DB", async () => {
    const res = await updateProfile(null)

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.appUser.update).not.toHaveBeenCalled()
  })

  it("rejects an invalid avatar url (not a URL) before touching the DB", async () => {
    const res = await updateProfile(validInput({ avatarUrl: "not-a-url" }))

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.appUser.update).not.toHaveBeenCalled()
  })

  it("rejects a well-formed but off-site avatar url (host pin, not just URL shape)", async () => {
    const res = await updateProfile(validInput({ avatarUrl: "https://evil.example.com/pixel.png" }))

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.appUser.update).not.toHaveBeenCalled()
  })
})

describe("updateProfile — self-scoping (living users)", () => {
  it("writes to the SESSION user id, never an id smuggled in via the payload", async () => {
    // Even if the client forges an `id`, the action ignores it (not in the schema)
    // and scopes the update to session.user.id.
    const res = await updateProfile(validInput({ id: "victim", userId: "victim" }))

    expect(res).toEqual({ ok: true, message: undefined })
    expect(prismaMock.appUser.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.appUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "self" } }),
    )
    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "self" } }),
    )
  })

  it("never persists death fields for a living user (they are stripped from the write)", async () => {
    const res = await updateProfile(
      validInput({
        deathDate: "2020-01-01",
        deathPlace: "Nowhere",
        deathState: "NA",
        deathCountry: "NA",
        deathCause: "redacted",
      }),
    )

    expect(res.ok).toBe(true)
    const data = prismaMock.appUser.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty("deathDate")
    expect(data).not.toHaveProperty("deathPlace")
    expect(data).not.toHaveProperty("deathState")
    expect(data).not.toHaveProperty("deathCountry")
    expect(data).not.toHaveProperty("deathCause")
  })

  it("leaves the removed National ID column untouched on save", async () => {
    // nationalId is no longer in the form/schema; existing data must be preserved,
    // so the write must not mention it at all.
    const res = await updateProfile(validInput({ nationalId: "999" }))

    expect(res.ok).toBe(true)
    const data = prismaMock.appUser.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty("nationalId")
  })

  it("persists phone and address for a living profile", async () => {
    prismaMock.address.create.mockResolvedValue({ id: "addr-1" })

    const res = await updateProfile(
      validInput({ phone: "555", phoneCountryCode: "1", address: { city: "Springfield" } }),
    )

    expect(res.ok).toBe(true)
    expect(prismaMock.address.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ city: "Springfield" }) }),
    )
    const data = prismaMock.appUser.update.mock.calls[0][0].data
    expect(data).toMatchObject({ phone: "555", phoneCountryCode: "1", addressId: "addr-1" })
  })
})

describe("updateProfile — avatar blob pruning", () => {
  it("deletes the stale avatar blob when the avatar changes", async () => {
    prismaMock.appUser.findUnique.mockResolvedValue({
      avatarUrl: "https://qa.public.blob.vercel-storage.com/old.jpg",
    })

    const res = await updateProfile(validInput({ avatarUrl: "https://qa.public.blob.vercel-storage.com/new.jpg" }))

    expect(res.ok).toBe(true)
    expect(deleteBlobs).toHaveBeenCalledWith(["https://qa.public.blob.vercel-storage.com/old.jpg"])
  })

  it("does not delete the blob when the avatar is unchanged", async () => {
    prismaMock.appUser.findUnique.mockResolvedValue({
      avatarUrl: "https://qa.public.blob.vercel-storage.com/same.jpg",
    })

    const res = await updateProfile(validInput({ avatarUrl: "https://qa.public.blob.vercel-storage.com/same.jpg" }))

    expect(res.ok).toBe(true)
    expect(deleteBlobs).not.toHaveBeenCalled()
  })
})
