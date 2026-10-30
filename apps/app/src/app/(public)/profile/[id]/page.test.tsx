import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import messages from "../../../../../messages/pt-BR.json"

vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
  notFound: () => { throw new Error("NOT_FOUND") },
}))
vi.mock("next-intl/server", () => ({
  getLocale: async () => "pt-BR",
  getTranslations: async () => (key: string) => key,
}))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/queries/profile", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/queries/profile")>(),
  getProfileById: vi.fn(),
}))
vi.mock("@/queries/favorite", () => ({
  isFavoritedByUser: async () => false, getFavoriteCount: async () => 0,
  getFavoritesByUserId: async () => [],
}))
vi.mock("@/queries/geolocation", () => ({ getGeolocationForViewer: async () => null }))
vi.mock("@/queries/memorial", () => ({ getGuardedProfilesByGuardianId: async () => [] }))
vi.mock("@/queries/pet", () => ({ getPetsByOwnerId: async () => [] }))
vi.mock("@/queries/family-tree", () => ({ countTreeMembers: async () => 1 }))
vi.mock("@/queries/gallery", () => ({
  getGalleryImageUrls: async () => [], getGalleryCount: async () => 0,
  getGalleryHasVideos: async () => false,
}))
vi.mock("@/queries/places", () => ({ getPlacesForMap: async () => [] }))
vi.mock("@/queries/documents", () => ({ getDocumentsByUserId: async () => [], getDocumentsCount: async () => 0 }))
vi.mock("@/queries/tribute", () => ({ getTributeAuthors: async () => [], getTributeCountByProfileId: async () => 0 }))
vi.mock("@/queries/bio", () => ({ getBioByUserId: async () => null }))
vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))
vi.mock("@/actions/favorite.actions", () => ({ toggleFavorite: vi.fn() }))
vi.mock("@/components/auth/signup-dialog", () => ({ SignupDialog: () => null }))
vi.mock("@/components/bento-grid", () => ({ BentoGrid: () => null }))
vi.mock("@/components/card-previews", () => ({
  TreePreview: () => null, BioPreview: () => null, GalleryPreview: () => null,
  TributesPreview: () => null, FavoritesPreview: () => null, GuardianPreview: () => null,
  PlacesPreview: () => null, DocumentsPreview: () => null, PetsPreview: () => null,
}))
vi.mock("@/components/aurora-backdrop", () => ({ AuroraBackdrop: () => null }))
vi.mock("@/components/profile-view-tracker", () => ({ ProfileViewTracker: () => null }))
vi.mock("@/components/qr-scan-tracker", () => ({ QrScanTracker: () => null }))
vi.mock("@/components/gen-code-download-buttons", () => ({
  GenCodeDownloadButtons: () => <button>Pet PNG/SVG</button>,
}))

import ProfileByIdPage from "./page"
import { auth } from "@/auth"
import { getProfileById } from "@/queries/profile"
import { getMemorialFeatures } from "@/lib/subscription"

const memorial = {
  id: "memorial-1", role: "APP_MEMO", firstName: "Paulo", lastName: "Pedroso",
  isPublicProfile: false, avatarUrl: null, genCode: null,
  birthDate: null, birthPlace: null, birthState: null, birthCountry: null,
  deathDate: null, deathPlace: null, deathState: null, deathCountry: null, deathCause: null,
  guardedBy: [{ guardianId: "guardian-1", status: "ACCEPTED", guardian: { firstName: "Douglas" } }],
}

async function renderProfile() {
  const page = await ProfileByIdPage({ params: Promise.resolve({ id: "memorial-1" }) })
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="pt-BR" messages={messages} timeZone="UTC">{page}</NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: "guardian-1" } } as never)
  vi.mocked(getProfileById).mockResolvedValue(memorial as never)
  vi.mocked(getMemorialFeatures).mockResolvedValue({ code: "PREMIUM" } as never)
})

describe("memorial cover GenCode shortcut", () => {
  it("renders a QR icon and the existing export link for a Premium guardian, even without coordinates or a plaque", async () => {
    const html = await renderProfile()
    expect(html).toContain('href="/profile/memorial-1/qr-code"')
    expect(html).toContain("lucide-qr-code")
    expect(html).toContain(">GenCode</a>")
    expect(html).toContain("Douglas")
    expect(getMemorialFeatures).toHaveBeenCalledExactlyOnceWith("guardian-1")
  })

  it("uses the viewing guardian's Free plan even if another guardian is Premium", async () => {
    vi.mocked(getMemorialFeatures).mockImplementation(async (id) => ({ code: id === "guardian-1" ? "FREE" : "PREMIUM" }) as never)
    const html = await renderProfile()
    expect(html).not.toContain('/qr-code"')
    expect(getMemorialFeatures).toHaveBeenCalledExactlyOnceWith("guardian-1")
  })

  it("does not show the Premium shortcut to a Free guardian who owns a physical plaque", async () => {
    vi.mocked(getProfileById).mockResolvedValue({ ...memorial, genCode: { id: 123 } } as never)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ code: "FREE" } as never)
    expect(await renderProfile()).not.toContain('/qr-code"')
  })

  it.each([null, "visitor-1"])("hides the shortcut for viewer %s who is not an accepted guardian", async (viewerId) => {
    vi.mocked(auth).mockResolvedValue(viewerId ? { user: { id: viewerId } } as never : null as never)
    expect(await renderProfile()).not.toContain('/qr-code"')
    expect(getMemorialFeatures).not.toHaveBeenCalled()
  })

  it("removes the shortcut on a fresh render after Premium expires", async () => {
    expect(await renderProfile()).toContain('href="/profile/memorial-1/qr-code"')
    vi.mocked(getMemorialFeatures).mockResolvedValue({ code: "FREE" } as never)
    expect(await renderProfile()).not.toContain('/qr-code"')
  })

  it("keeps living profiles without a memorial shortcut", async () => {
    vi.mocked(getProfileById).mockResolvedValue({ ...memorial, role: "APP_USER" } as never)
    expect(await renderProfile()).not.toContain('/qr-code"')
    expect(getMemorialFeatures).not.toHaveBeenCalled()
  })

  it("preserves the pet's existing Premium download buttons", async () => {
    vi.mocked(getProfileById).mockResolvedValue({ ...memorial, role: "APP_PET" } as never)
    const html = await renderProfile()
    expect(html).not.toContain('/qr-code"')
    expect(html).toContain("Pet PNG/SVG")
  })
})
