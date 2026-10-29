// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextIntlClientProvider } from "next-intl"
import messages from "../../../../messages/pt-BR.json"
import { AddRelativeDialog } from "./add-relative-dialog"
import { addRelation, addGhostRelative } from "@/actions/family-tree.actions"

vi.mock("@/actions/family-tree.actions", () => ({ addRelation: vi.fn(), addGhostRelative: vi.fn() }))
vi.mock("@/actions/pet.actions", () => ({ attachPet: vi.fn(), createPet: vi.fn() }))
vi.mock("@/components/limit-reached-dialog", () => ({ LimitReachedDialog: () => null }))
vi.mock("./tree-portrait-picker", () => ({ TreePortraitPicker: () => null }))

const memorial = { id: "cmariaaaaaaaa", firstName: "Maria", lastName: "Silva", role: "APP_MEMO", gender: null, avatarUrl: null, deathDate: null, petSpecies: null, petBreed: null }
let root: Root
let container: HTMLDivElement
let fetchMock: ReturnType<typeof vi.fn>
const onClose = vi.fn()
const onSuccess = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [memorial] })
  vi.stubGlobal("fetch", fetchMock)
  vi.mocked(addRelation).mockResolvedValue({ ok: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function render(initialKind: "parent" | "pet" = "parent") {
  await act(async () => root.render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <AddRelativeDialog open onClose={onClose} onSuccess={onSuccess} rootId="crootaaaaaaaa" anchorId="crootaaaaaaaa" initialKind={initialKind} memberCount={1} memberLimit={32} petCount={0} petLimit={5} petAtLimit={false} tier="PREMIUM" />
    </NextIntlClientProvider>,
  ))
}
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((el) => el.textContent === text)
  expect(found, text).toBeDefined()
  return found!
}
async function click(text: string) { await act(async () => button(text).click()) }
async function flush() { await act(async () => { await vi.advanceTimersByTimeAsync(310) }) }

describe("adding a memorial under my care", () => {
  it("lists memorials immediately, selects an existing ID and adds it as a parent", async () => {
    await render()
    expect(button("Adicionar").disabled).toBe(true)
    await click("Perfis sob minha guarda")
    await flush()
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/search?q=&mode=guarded-relative")
    expect(document.body.textContent).toContain("Maria Silva")
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((el) => el.textContent?.includes("Maria Silva"))!.click())
    await click("Adicionar")
    expect(addRelation).toHaveBeenCalledExactlyOnceWith("crootaaaaaaaa", {
      fromId: "cmariaaaaaaaa", toId: "crootaaaaaaaa", type: "PARENT_OF",
      subtype: null, startDate: null, endDate: null, linkSpouseId: null,
    })
    expect(addGhostRelative).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it("shows an empty state without enabling add", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] })
    await render()
    await click("Perfis sob minha guarda")
    await flush()
    expect(document.querySelector('[role="status"]')?.textContent).toBe("Nenhum memorial encontrado sob sua guarda.")
    expect(button("Adicionar").disabled).toBe(true)
  })

  it("handles an HTTP permission failure as an error instead of a results array", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Unauthorized" }) })
    await render()
    await click("Perfis sob minha guarda")
    await flush()
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Não foi possível buscar os perfis. Tente novamente.")
    expect(button("Adicionar").disabled).toBe(true)
  })

  it("discards a late guarded response after returning to global search", async () => {
    let resolve!: (value: unknown) => void
    fetchMock.mockReturnValue(new Promise((done) => { resolve = done }))
    await render()
    await click("Perfis sob minha guarda")
    await flush()
    await click("Genealogiq")
    await act(async () => resolve({ ok: true, json: async () => [memorial] }))
    expect(document.body.textContent).not.toContain("Maria Silva")
    expect(button("Adicionar").disabled).toBe(true)
  })

  it("clears the selected memorial when changing the search source", async () => {
    await render()
    await click("Perfis sob minha guarda")
    await flush()
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((el) => el.textContent?.includes("Maria Silva"))!.click())
    expect(button("Adicionar").disabled).toBe(false)
    await click("Genealogiq")
    expect(button("Adicionar").disabled).toBe(true)
  })

  it("keeps human memorial selection out of the pet flow", async () => {
    await render("pet")
    expect(document.body.textContent).not.toContain("Perfis sob minha guarda")
  })
})
