import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
  notFound: () => { throw new Error("NOT_FOUND") },
}))
vi.mock("next-intl/server", () => ({
  getLocale: async () => "pt-BR",
  getTranslations: async () => (key: string) => key,
}))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/queries/profile", () => ({ getProfileById: vi.fn() }))
vi.mock("@/queries/places", () => ({ getPlaceById: vi.fn(), ANON_PLACES_LIMIT: 12 }))
vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))
vi.mock("@/components/aurora-backdrop", () => ({ AuroraBackdrop: () => null }))
vi.mock("@/components/back-button", () => ({ BackButton: () => null }))
vi.mock("@/components/place-photo-grid", () => ({ PlacePhotoGrid: () => null }))
vi.mock("@/components/place-qr-trigger", () => ({ PlaceQrTrigger: () => null }))
vi.mock("@/components/place-qr-display", () => ({
  PlaceQrDisplay: ({ targetPath }: { targetPath: string }) => <div data-qr-target={targetPath} />,
}))
vi.mock("@/components/auth/signup-prompt", () => ({ SignupPrompt: () => null }))

import PlaceDetailPage from "./page"
import { auth } from "@/auth"
import { getProfileById } from "@/queries/profile"
import { getPlaceById } from "@/queries/places"
import { getMemorialFeatures } from "@/lib/subscription"

const place = {
  id: "place-1", userId: "memorial-1", title: "Cemitério de teste",
  categories: ["memorial_site"], qrGenerated: true,
  photos: [], description: null, lat: 0, lon: 0,
  startDate: null, endDate: null, country: null,
}

function visit(view?: string | string[]) {
  return PlaceDetailPage({
    params: Promise.resolve({ id: "memorial-1", placeId: "place-1" }),
    searchParams: Promise.resolve({ view }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(null as never)
  vi.mocked(getProfileById).mockResolvedValue({
    id: "memorial-1", role: "APP_MEMO", isPublicProfile: false,
    guardedBy: [{ guardianId: "guardian", status: "ACCEPTED" }],
  } as never)
  vi.mocked(getPlaceById).mockResolvedValue(place as never)
  vi.mocked(getMemorialFeatures).mockResolvedValue({ code: "PREMIUM" } as never)
})

describe("previously printed place GenCodes", () => {
  it.each(["memorial_site", "resting_place"])("opens the profile for an anonymous %s scan", async (category) => {
    vi.mocked(getPlaceById).mockResolvedValue({ ...place, categories: [category] } as never)

    await expect(visit()).rejects.toThrow("REDIRECT:/profile/memorial-1")

    expect(getPlaceById).toHaveBeenCalledExactlyOnceWith("memorial-1", "place-1")
    expect(getMemorialFeatures).not.toHaveBeenCalled()
  })

  it("also opens the profile when the guardian scans while signed in", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "guardian" } } as never)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ code: "FREE" } as never)

    await expect(visit()).rejects.toThrow("REDIRECT:/profile/memorial-1")
    expect(getMemorialFeatures).not.toHaveBeenCalled()
  })

  it("keeps location details and editing accessible through the in-app details link", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "guardian" } } as never)

    const html = renderToStaticMarkup(await visit("details"))

    expect(html).toContain("Cemitério de teste")
    expect(html).toContain('href="/profile/memorial-1/places/place-1/edit"')
    expect(html).toContain('data-qr-target="/profile/memorial-1"')
  })

  it("keeps other life-place codes on their location detail", async () => {
    vi.mocked(getPlaceById).mockResolvedValue({ ...place, categories: ["school"] } as never)

    const html = renderToStaticMarkup(await visit())

    expect(html).toContain('data-qr-target="/profile/memorial-1/places/place-1"')
    expect(getPlaceById).toHaveBeenLastCalledWith("memorial-1", "place-1", 12)
  })

  it("does not redirect a memorial location before its QR is generated", async () => {
    vi.mocked(getPlaceById).mockResolvedValue({ ...place, qrGenerated: false } as never)

    expect(renderToStaticMarkup(await visit())).toContain("Cemitério de teste")
  })

  it("still rejects anonymous location details beyond the preview slice", async () => {
    vi.mocked(getPlaceById).mockImplementation(async (_profile, _place, limit) => limit ? null : place as never)

    await expect(visit("details")).rejects.toThrow("REDIRECT:/profile/memorial-1/places")
    expect(getPlaceById).toHaveBeenLastCalledWith("memorial-1", "place-1", 12)
    expect(getMemorialFeatures).not.toHaveBeenCalled()
  })

  it("does not bypass the private-profile wall with a scan or a details link", async () => {
    vi.mocked(getProfileById).mockResolvedValue({ role: "APP_USER", isPublicProfile: false } as never)

    await expect(visit()).rejects.toThrow("REDIRECT:/sign-in?callbackUrl=%2Fprofile%2Fmemorial-1")
    await expect(visit("details")).rejects.toThrow("REDIRECT:/sign-in?callbackUrl=%2Fprofile%2Fmemorial-1")
    expect(getPlaceById).not.toHaveBeenCalled()
  })

  it("does not redirect missing or mismatched places to a memorial", async () => {
    vi.mocked(getPlaceById).mockResolvedValue(null)

    await expect(visit()).rejects.toThrow("REDIRECT:/profile/memorial-1/places")
    vi.mocked(auth).mockResolvedValue({ user: { id: "guardian" } } as never)
    await expect(visit()).rejects.toThrow("NOT_FOUND")
  })

  it("does not treat repeated details parameters as an internal navigation", async () => {
    await expect(visit(["details", "details"])).rejects.toThrow("REDIRECT:/profile/memorial-1")
  })
})
