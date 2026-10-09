// @vitest-environment happy-dom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import messages from "../../messages/pt-BR.json"
import { TreeMemorialPicker } from "./tree-memorial-picker"
import { HomeMemorials } from "./home-memorials"
import { GuardianPreview } from "./card-previews"
import { addMemorialFromTree } from "@/actions/tree-memorial.actions"
import type { TreeMemorialCandidate } from "@/queries/tree-memorial"

const { router, toast } = vi.hoisted(() => ({
  router: { push: vi.fn(), refresh: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock("@/actions/tree-memorial.actions", () => ({ addMemorialFromTree: vi.fn() }))
vi.mock("@/actions/extra-units.actions", () => ({ createExtraUnitCheckoutSession: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/profile/guardian/memorialized/from-tree" }))
vi.mock("sonner", () => ({ toast }))
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("next-intl", () => ({
  useLocale: () => "pt-BR",
  useTranslations: (namespace: string) => (key: string, values: Record<string, string | number> = {}) => {
    const text = `${namespace}.${key}`.split(".").reduce<unknown>((part, segment) => (part as Record<string, unknown>)[segment], messages) as string
    return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), text)
  },
}))

let container: HTMLDivElement
let root: Root
const candidates: TreeMemorialCandidate[] = [
  { id: "cmaria00000000000000000001", firstName: "Maria", lastName: "Silva", avatarUrl: null, role: "APP_GHOST", birthDate: new Date("1930-01-01"), deathDate: new Date("2020-01-01"), petSpecies: null },
  { id: "cbanze00000000000000000001", firstName: "Banzé", lastName: "", avatarUrl: null, role: "APP_PET", birthDate: null, deathDate: null, petSpecies: "Cachorro" },
  { id: "chelena000000000000000001", firstName: "Helena", lastName: "Silva", avatarUrl: null, role: "APP_MEMO", birthDate: null, deathDate: null, petSpecies: null },
]

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(addMemorialFromTree).mockResolvedValue({ ok: true, data: { id: candidates[0].id, alreadyAdded: false } })
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function render(profiles = candidates) {
  await act(async () => root.render(<TreeMemorialPicker profiles={profiles} guardianId="guardian" />))
}
function button(label: string, scope: ParentNode = document) {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent === label)
  expect(found, `button: ${label}`).toBeDefined()
  return found!
}
async function click(label: string) {
  await act(async () => button(label).click())
}
async function search(value: string) {
  const input = container.querySelector<HTMLInputElement>("input")!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

describe("selecting a tree profile", () => {
  it("shows an existing pet with a profile link and no add/duplicate action", async () => {
    await render()
    await click("Pets")
    expect(container.querySelectorAll("li")).toHaveLength(1)
    expect(container.textContent).toContain("Banzé")
    expect(container.textContent).toContain("Já está sob sua guarda")
    expect(container.querySelector('a[href="/profile/cbanze00000000000000000001"]')).not.toBeNull()
    expect(container.textContent).not.toContain("Adicionar como memorial")
    expect(addMemorialFromTree).not.toHaveBeenCalled()
  })

  it("finds accented names with an unaccented search and handles no matches", async () => {
    await render()
    await search("banze")
    expect(container.querySelectorAll("li")).toHaveLength(1)
    expect(container.textContent).toContain("Banzé")
    await search("missing")
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Nenhum membro encontrado para essa busca.")
  })

  it("explains the public memorial change before submitting the existing ID", async () => {
    await render()
    await click("Adicionar como memorial")
    const dialog = document.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain("Adicionar Maria Silva como memorial?")
    expect(dialog.textContent).toContain("memorial público")
    expect(addMemorialFromTree).not.toHaveBeenCalled()
    await click("Adicionar memorial")
    expect(addMemorialFromTree).toHaveBeenCalledExactlyOnceWith({ profileId: "cmaria00000000000000000001" })
    expect(router.push).toHaveBeenCalledWith("/profile/guardian/memorialized")
    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith("Memorial adicionado aos perfis sob sua guarda.")
  })

  it("lets the user cancel without changing anything", async () => {
    await render()
    await click("Adicionar como memorial")
    await click("Cancelar")
    expect(addMemorialFromTree).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it("shows the real upgrade dialog when the server reports a newly reached cap", async () => {
    vi.mocked(addMemorialFromTree).mockResolvedValue({
      ok: false, message: "Limite atingido", quota: { limit: 1, tier: "FREE" },
    })
    await render()
    await click("Adicionar como memorial")
    await click("Adicionar memorial")
    const dialog = document.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain("Limite de memoriais atingido")
    expect(dialog.textContent).toContain("Seu plano permite até 1 memoriais.")
    expect(dialog.querySelector('a[href="/subscriptions"]')).not.toBeNull()
    expect(router.push).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("keeps a failed request retryable without navigating or reporting success", async () => {
    vi.mocked(addMemorialFromTree).mockRejectedValueOnce(new Error("offline"))
    await render()
    await click("Adicionar como memorial")
    await click("Adicionar memorial")
    expect(toast.error).toHaveBeenCalledWith("Não foi possível adicionar o memorial. Tente novamente.")
    expect(router.push).not.toHaveBeenCalled()
    expect(button("Adicionar memorial").disabled).toBe(false)
    await click("Adicionar memorial")
    expect(addMemorialFromTree).toHaveBeenCalledTimes(2)
    expect(router.push).toHaveBeenCalledWith("/profile/guardian/memorialized")
  })

  it("handles an empty tree with a link to add members", async () => {
    await render([])
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Nenhum membro disponível")
    expect(container.querySelector('a[href="/profile/guardian/tree"]')).not.toBeNull()
    expect(addMemorialFromTree).not.toHaveBeenCalled()
  })

  it("refreshes the home preview when a pet becomes part of the returned guarded list", async () => {
    await act(async () => root.render(<HomeMemorials items={[]} />))
    const pet = { ...candidates[1], birthPlace: null, birthCountry: null, deathPlace: null, deathCountry: null, petBreed: null }
    await act(async () => root.render(<HomeMemorials items={[pet]} />))
    expect(container.textContent).toContain("Banzé")
    expect(container.textContent).toContain("Cachorro")
    expect(container.textContent).toContain("Pet")
    expect(container.textContent).not.toContain("undefined")
    expect(container.querySelectorAll('a[href="/profile/cbanze00000000000000000001"]')).toHaveLength(1)
  })

  it("renders a pet's initial and name in the profile's guarded preview", async () => {
    const pet = { ...candidates[1], birthPlace: null, birthCountry: null, deathPlace: null, deathCountry: null, petBreed: null }
    await act(async () => root.render(await GuardianPreview({ memorials: [pet] })))
    expect(container.textContent).toBe("BBanzé")
    expect(container.textContent).not.toContain("UNDEFINED")
  })
})
