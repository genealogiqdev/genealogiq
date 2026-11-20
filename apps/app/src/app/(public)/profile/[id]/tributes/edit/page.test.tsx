import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND") },
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
}))
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/lib/dal", () => ({ verifySession: async () => ({ user: { id: "author", name: "Ana" } }) }))
vi.mock("@/queries/profile", () => ({ getProfileById: vi.fn() }))
vi.mock("@/queries/tribute", () => ({ getMyTributeForProfile: vi.fn() }))
vi.mock("@/components/aurora-backdrop", () => ({ AuroraBackdrop: () => null }))
vi.mock("@/components/back-button", () => ({ BackButton: () => null }))
vi.mock("@/components/tribute-form", () => ({
  TributeForm: ({ existing }: { existing: { id: string; text: string } | null }) => <div data-tribute-id={existing?.id ?? "new"}>{existing?.text ?? "Empty new form"}</div>,
}))
import Page from "./page"
import { getMyTributeForProfile } from "@/queries/tribute"
import { getProfileById } from "@/queries/profile"
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getProfileById).mockResolvedValue({ id: "memorial" } as never)
  vi.mocked(getMyTributeForProfile).mockResolvedValue({ id: "second", text: "Second memory", imageUrl: null } as never)
})
const render = async (tributeId?: string | string[], id = "memorial") => renderToStaticMarkup(await Page({
  params: Promise.resolve({ id }), searchParams: Promise.resolve({ tributeId }),
}))
describe("new tribute or explicit edit route", () => {
  it("opens an empty new form without loading the author's prior tribute", async () => {
    expect(await render()).toContain('data-tribute-id="new"')
    expect(getMyTributeForProfile).not.toHaveBeenCalled()
  })
  it("opens only the selected tribute when an edit ID is provided", async () => {
    const html = await render("second")
    expect(html).toContain('data-tribute-id="second"')
    expect(html).toContain("Second memory")
    expect(getMyTributeForProfile).toHaveBeenCalledExactlyOnceWith("author", "memorial", "second")
  })
  it("rejects a missing or unowned edit instead of silently creating a new tribute", async () => {
    vi.mocked(getMyTributeForProfile).mockResolvedValue(null)
    await expect(render("forged")).rejects.toThrow("NOT_FOUND")
  })
  it.each(["", ["first", "second"]])("rejects an invalid edit selector: %s", async (selector) => {
    await expect(render(selector)).rejects.toThrow("NOT_FOUND")
    expect(getMyTributeForProfile).not.toHaveBeenCalled()
  })
  it("preserves the own-profile write boundary", async () => {
    await expect(render(undefined, "author")).rejects.toThrow("REDIRECT:/profile/author/tributes")
    expect(getMyTributeForProfile).not.toHaveBeenCalled()
  })
})
