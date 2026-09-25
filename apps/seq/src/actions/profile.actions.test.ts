import { describe, it, expect, vi, beforeEach } from "vitest"

const { prismaMock, deleteUnreferencedMediaUrls } = vi.hoisted(() => ({
  prismaMock: { user: { findUnique: vi.fn(), update: vi.fn() } },
  deleteUnreferencedMediaUrls: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// Identity translator: getTranslations(ns) returns (key) => key, so an asserted
// localized message is exactly the i18n KEY the action passed.
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("@genealogiq/services/media-storage", () => ({
  deleteUnreferencedMediaUrls,
  isAuthorizedMediaReference: vi.fn(() => true),
}))

import { updateProfile, updateAvatar } from "./profile.actions"
import { verifySession } from "@/lib/dal"
import { revalidatePath } from "next/cache"
import type { ProfileFormValues } from "@/schemas/profile.schema"

const validInput: ProfileFormValues = {
  firstName: "Ada",
  lastName: "Lovelace",
  nationalId: null,
  birthDate: "1990-01-01",
  phoneCountryCode: "55",
  phone: "11999998888",
  address: {
    zip: "01310100",
    street: "Av Paulista",
    number: "1000",
    complement: null,
    neighborhood: "Bela Vista",
    city: "Sao Paulo",
    state: "SP",
    country: "BR",
  },
}

const SESSION_USER_ID = "session-user-1"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifySession).mockResolvedValue({ user: { id: SESSION_USER_ID } } as never)
})

describe("updateProfile — ActionResult shape + self-scope", () => {
  it("rejects invalid input with fail(common.invalidData) before touching the DB", async () => {
    // firstName below the 2-char minimum, phoneCountryCode empty.
    const bad = { ...validInput, firstName: "A", phoneCountryCode: "" }

    const res = await updateProfile(bad as ProfileFormValues)

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("returns done(profile.updated) on the success path", async () => {
    prismaMock.user.update.mockResolvedValue({ id: SESSION_USER_ID })

    const res = await updateProfile(validInput)

    expect(res).toEqual({ ok: true, message: "profile.updated" })
    expect(revalidatePath).toHaveBeenCalledWith("/profile")
  })

  it("clamps the update to the session user id, ignoring any caller-supplied scope", async () => {
    prismaMock.user.update.mockResolvedValue({ id: SESSION_USER_ID })

    await updateProfile(validInput)

    expect(prismaMock.user.update).toHaveBeenCalledTimes(1)
    const arg = prismaMock.user.update.mock.calls[0][0]
    // Scope is the session user, never anything from the input payload.
    expect(arg.where).toEqual({ id: SESSION_USER_ID })
    // Only self-editable fields are written; no role/email/isActive/tenantId.
    expect(arg.data.firstName).toBe("Ada")
    expect(arg.data).not.toHaveProperty("role")
    expect(arg.data).not.toHaveProperty("email")
    expect(arg.data).not.toHaveProperty("isActive")
    expect(arg.data).not.toHaveProperty("tenantId")
    expect(arg.data).not.toHaveProperty("id")
  })

  it("upserts the address when address data is present", async () => {
    prismaMock.user.update.mockResolvedValue({ id: SESSION_USER_ID })

    await updateProfile(validInput)

    const arg = prismaMock.user.update.mock.calls[0][0]
    expect(arg.data.address).toEqual({
      upsert: { create: expect.objectContaining({ city: "Sao Paulo" }), update: expect.any(Object) },
    })
  })

  it("omits the address write when address has no meaningful data", async () => {
    prismaMock.user.update.mockResolvedValue({ id: SESSION_USER_ID })
    const noAddress: ProfileFormValues = {
      ...validInput,
      address: {
        zip: null,
        street: null,
        number: null,
        complement: null,
        neighborhood: null,
        city: null,
        state: null,
        country: null,
      },
    }

    await updateProfile(noAddress)

    const arg = prismaMock.user.update.mock.calls[0][0]
    expect(arg.data.address).toBeUndefined()
  })
})

describe("updateAvatar — url validation + self-scope", () => {
  const validUrl =
    "https://abc123.public.blob.vercel-storage.com/avatars/ada.png"

  it.each([
    ["http (not https)", "http://abc123.public.blob.vercel-storage.com/x.png"],
    ["wrong host", "https://evil.com/x.png"],
    ["lookalike host without the blob suffix", "https://abc123.vercel-storage.com/x.png"],
    ["empty string", ""],
  ])("rejects a %s url with fail(profile.invalidAvatarUrl) before touching the DB", async (_label, url) => {
    const res = await updateAvatar(url)

    expect(res).toEqual({ ok: false, message: "profile.invalidAvatarUrl" })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("returns done(profile.avatarUpdated) and scopes the write to the session user on a valid url", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      avatarUrl: "https://old.public.blob.vercel-storage.com/avatar.png",
    })
    prismaMock.user.update.mockResolvedValue({ id: SESSION_USER_ID })

    const res = await updateAvatar(validUrl)

    expect(res).toEqual({ ok: true, message: "profile.avatarUpdated" })
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION_USER_ID },
        data: { avatarUrl: validUrl },
      }),
    )
    expect(revalidatePath).toHaveBeenCalledWith("/profile")
    expect(deleteUnreferencedMediaUrls).toHaveBeenCalledWith([
      "https://old.public.blob.vercel-storage.com/avatar.png",
    ])
  })
})
