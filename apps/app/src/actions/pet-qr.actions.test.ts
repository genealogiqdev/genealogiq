import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { pngMock, svgMock } = vi.hoisted(() => ({ pngMock: vi.fn(), svgMock: vi.fn() }))

vi.mock("qrcode", () => ({ default: { toDataURL: pngMock, toString: svgMock } }))
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))
vi.mock("@/queries/profile", () => ({ getProfileById: vi.fn() }))

import { downloadPetQrCode } from "./pet-qr.actions"
import { verifySession } from "@/lib/dal"
import { getMemorialFeatures } from "@/lib/subscription"
import { getProfileById } from "@/queries/profile"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("APP_URL", "https://genealogiq.example/")
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "viewer" } } as never)
  vi.mocked(getMemorialFeatures).mockResolvedValue({ code: "PREMIUM" } as never)
  vi.mocked(getProfileById).mockResolvedValue({ id: "pet-1", role: "APP_PET", guardedBy: [] } as never)
  pngMock.mockResolvedValue("data:image/png;base64,cG5n")
  svgMock.mockResolvedValue("<svg/>")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("downloadPetQrCode", () => {
  it.each([
    ["png", "data:image/png;base64,cG5n"],
    ["svg", "data:image/svg+xml;base64,PHN2Zy8+"],
  ] as const)("exports %s pointing directly to the pet without requiring a place", async (format, dataUrl) => {
    expect(await downloadPetQrCode("pet-1", format)).toEqual({ ok: true, data: { dataUrl }, message: undefined })
    expect(getMemorialFeatures).toHaveBeenCalledExactlyOnceWith("viewer")
    expect(getProfileById).toHaveBeenCalledExactlyOnceWith("pet-1")
    expect(format === "png" ? pngMock : svgMock).toHaveBeenCalledExactlyOnceWith(
      "https://genealogiq.example/profile/pet-1",
      expect.objectContaining({ errorCorrectionLevel: "H", margin: 4 }),
    )
    expect(format === "png" ? svgMock : pngMock).not.toHaveBeenCalled()
  })

  it("requires a session before looking up Premium or the pet", async () => {
    vi.mocked(verifySession).mockRejectedValueOnce(new Error("Unauthenticated"))

    await expect(downloadPetQrCode("pet-1", "svg")).rejects.toThrow("Unauthenticated")
    expect(getMemorialFeatures).not.toHaveBeenCalled()
    expect(getProfileById).not.toHaveBeenCalled()
    expect(svgMock).not.toHaveBeenCalled()
  })

  it.each(["png", "svg"] as const)("blocks %s for a FREE viewer even if the pet inherits Premium", async (format) => {
    vi.mocked(getMemorialFeatures).mockImplementation(async (id) => ({
      code: id === "viewer" ? "FREE" : "PREMIUM",
    }) as never)

    expect(await downloadPetQrCode("pet-1", format)).toEqual({ ok: false, message: "pet.premiumRequired" })
    expect(getProfileById).not.toHaveBeenCalled()
    expect(pngMock).not.toHaveBeenCalled()
    expect(svgMock).not.toHaveBeenCalled()
  })

  it("rejects a missing pet", async () => {
    vi.mocked(getProfileById).mockResolvedValue(null)

    expect(await downloadPetQrCode("missing", "svg")).toEqual({ ok: false, message: "pet.notFound" })
    expect(svgMock).not.toHaveBeenCalled()
  })

  it.each(["APP_USER", "APP_MEMO", "APP_GHOST"])("rejects %s profiles through the pet endpoint", async (role) => {
    vi.mocked(getProfileById).mockResolvedValue({ id: "other", role } as never)

    expect(await downloadPetQrCode("other", "png")).toEqual({ ok: false, message: "pet.notFound" })
    expect(pngMock).not.toHaveBeenCalled()
  })

  it("rechecks Premium when choosing a different format after expiry", async () => {
    await downloadPetQrCode("pet-1", "png")
    vi.mocked(getMemorialFeatures).mockResolvedValue({ code: "FREE" } as never)

    expect(await downloadPetQrCode("pet-1", "svg")).toEqual({ ok: false, message: "pet.premiumRequired" })
    expect(svgMock).not.toHaveBeenCalled()
    expect(pngMock).toHaveBeenCalledTimes(1)
  })

  it.each(["", undefined, null])("rejects invalid pet ID %s", async (id) => {
    expect(await downloadPetQrCode(id as string, "svg")).toEqual({ ok: false, message: "common.invalidData" })
    expect(getProfileById).not.toHaveBeenCalled()
    expect(svgMock).not.toHaveBeenCalled()
  })

  it("rejects unsupported formats", async () => {
    expect(await downloadPetQrCode("pet-1", "pdf" as "png")).toEqual({ ok: false, message: "common.invalidData" })
    expect(getMemorialFeatures).not.toHaveBeenCalled()
    expect(pngMock).not.toHaveBeenCalled()
    expect(svgMock).not.toHaveBeenCalled()
  })

  it("propagates a vector-rendering failure without returning a file", async () => {
    svgMock.mockRejectedValueOnce(new Error("SVG generation failed"))

    await expect(downloadPetQrCode("pet-1", "svg")).rejects.toThrow("SVG generation failed")
  })
})
