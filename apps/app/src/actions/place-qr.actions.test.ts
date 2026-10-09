import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { qrMock } = vi.hoisted(() => ({ qrMock: vi.fn() }))

vi.mock("qrcode", () => ({ default: { toDataURL: qrMock } }))
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))
vi.mock("@/queries/places", () => ({ getPlaceById: vi.fn() }))

import { downloadPlaceQrCode } from "./place-qr.actions"
import { verifySession } from "@/lib/dal"
import { getMemorialFeatures } from "@/lib/subscription"
import { getPlaceById } from "@/queries/places"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("APP_URL", "https://genealogiq.example/")
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "viewer" } } as never)
  vi.mocked(getMemorialFeatures).mockResolvedValue({ code: "PREMIUM" } as never)
  vi.mocked(getPlaceById).mockResolvedValue({ id: "place-1", userId: "memorial-1", qrGenerated: true } as never)
  qrMock.mockResolvedValue("data:image/png;base64,cG5n")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("downloadPlaceQrCode", () => {
  it("returns a printable PNG linking to the place for the Premium viewer", async () => {
    const result = await downloadPlaceQrCode("memorial-1", "place-1")

    expect(result).toEqual({ ok: true, data: { dataUrl: "data:image/png;base64,cG5n" }, message: undefined })
    expect(getMemorialFeatures).toHaveBeenCalledExactlyOnceWith("viewer")
    expect(getPlaceById).toHaveBeenCalledExactlyOnceWith("memorial-1", "place-1")
    expect(qrMock).toHaveBeenCalledExactlyOnceWith("https://genealogiq.example/profile/memorial-1/places/place-1", {
      errorCorrectionLevel: "H",
      margin: 4,
      width: 2048,
      color: { dark: "#0F172A", light: "#FFFFFF" },
    })
  })

  it("requires a session before reading entitlement or generating an image", async () => {
    vi.mocked(verifySession).mockRejectedValueOnce(new Error("Unauthenticated"))

    await expect(downloadPlaceQrCode("memorial-1", "place-1")).rejects.toThrow("Unauthenticated")
    expect(getMemorialFeatures).not.toHaveBeenCalled()
    expect(getPlaceById).not.toHaveBeenCalled()
    expect(qrMock).not.toHaveBeenCalled()
  })

  it.each(["FREE", "GEN2026"])("rejects a %s viewer even when the target profile has Premium", async (code) => {
    vi.mocked(getMemorialFeatures).mockImplementation(async (id) => ({
      code: id === "viewer" ? code : "PREMIUM",
    }) as never)

    expect(await downloadPlaceQrCode("memorial-1", "place-1")).toEqual({
      ok: false, message: "places.premiumRequired",
    })
    expect(getPlaceById).not.toHaveBeenCalled()
    expect(qrMock).not.toHaveBeenCalled()
  })

  it("rechecks entitlement on each request when Premium expires after opening the page", async () => {
    await downloadPlaceQrCode("memorial-1", "place-1")
    vi.mocked(getMemorialFeatures).mockResolvedValue({ code: "FREE" } as never)

    expect(await downloadPlaceQrCode("memorial-1", "place-1")).toEqual({
      ok: false, message: "places.premiumRequired",
    })
    expect(qrMock).toHaveBeenCalledTimes(1)
  })

  it("rejects missing places or a place outside the requested profile", async () => {
    vi.mocked(getPlaceById).mockResolvedValue(null)

    expect(await downloadPlaceQrCode("other-profile", "place-1")).toEqual({
      ok: false, message: "places.notFound",
    })
    expect(getPlaceById).toHaveBeenCalledExactlyOnceWith("other-profile", "place-1")
    expect(qrMock).not.toHaveBeenCalled()
  })

  it("does not generate a download before the place QR has been generated", async () => {
    vi.mocked(getPlaceById).mockResolvedValue({ qrGenerated: false } as never)

    expect(await downloadPlaceQrCode("memorial-1", "place-1")).toEqual({
      ok: false, message: "places.notFound",
    })
    expect(qrMock).not.toHaveBeenCalled()
  })

  it.each([
    ["", "place-1"],
    [undefined, "place-1"],
    [null, "place-1"],
    ["memorial-1", ""],
    ["memorial-1", undefined],
    ["memorial-1", null],
  ])("rejects invalid IDs (%s, %s) before querying", async (profileId, placeId) => {
    expect(await downloadPlaceQrCode(profileId as string, placeId as string)).toEqual({
      ok: false, message: "common.invalidData",
    })
    expect(getMemorialFeatures).not.toHaveBeenCalled()
    expect(getPlaceById).not.toHaveBeenCalled()
    expect(qrMock).not.toHaveBeenCalled()
  })

  it("propagates an image-generation failure without returning a download", async () => {
    qrMock.mockRejectedValueOnce(new Error("PNG generation failed"))

    await expect(downloadPlaceQrCode("memorial-1", "place-1")).rejects.toThrow("PNG generation failed")
  })
})
