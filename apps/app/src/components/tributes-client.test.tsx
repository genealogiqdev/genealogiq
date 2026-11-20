// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { NextIntlClientProvider } from "next-intl"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import messages from "../../messages/pt-BR.json"
import { TributesClient } from "./tributes-client"
import { TributeForm } from "./tribute-form"
import { submitTribute } from "@/actions/tribute.actions"
import type { ApprovedTributeRow } from "@/queries/tribute"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/actions/tribute.actions", () => ({ submitTribute: vi.fn(), deleteTribute: vi.fn() }))
vi.mock("@/lib/image-compress", () => ({ compressImage: vi.fn() }))

const items = [
  { id: "first", text: "First memory", authorId: "author", author: { id: "author", firstName: "Ana", lastName: "Silva", avatarUrl: null } },
  { id: "second", text: "Second memory", authorId: "author", author: { id: "author", firstName: "Ana", lastName: "Silva", avatarUrl: null } },
  { id: "other", text: "Another person's memory", authorId: "other-author", author: { id: "other-author", firstName: "João", lastName: "Silva", avatarUrl: null } },
].map((row) => ({ ...row, imageUrl: null, status: "APPROVED", profileId: "memorial", createdAt: new Date("2026-05-01T12:00:00Z"), updatedAt: new Date("2026-05-01T12:00:00Z") })) as ApprovedTributeRow[]

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(submitTribute).mockResolvedValue({ ok: true })
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
async function render(content: React.ReactNode) {
  await act(async () => root.render(<NextIntlClientProvider locale="pt-BR" messages={messages} timeZone="UTC">{content}</NextIntlClientProvider>))
}

describe("tribute controls", () => {
  it("keeps Add visible after two own tributes and links each edit to its exact ID", async () => {
    await render(<TributesClient items={items} profileId="memorial" sessionUserId="author" canWrite />)
    expect(container.querySelector('a[href="/profile/memorial/tributes/edit"]')?.textContent).toBe("Adicionar homenagem")
    expect(container.querySelector('a[href="/profile/memorial/tributes/edit?tributeId=first"]')).not.toBeNull()
    expect(container.querySelector('a[href="/profile/memorial/tributes/edit?tributeId=second"]')).not.toBeNull()
    expect(container.querySelector('a[href="/profile/memorial/tributes/edit?tributeId=other"]')).toBeNull()
    expect(container.querySelectorAll("article")).toHaveLength(3)
  })
  it("keeps separate edit links for pending and rejected messages while allowing another tribute", async () => {
    await render(<TributesClient items={items} profileId="memorial" sessionUserId="author" canWrite unpublishedTributes={[
      { id: "pending", text: "Waiting memory", status: "PENDING" },
      { id: "rejected", text: "Retry memory", status: "REJECTED" },
    ]} />)
    expect(container.querySelector('a[href="/profile/memorial/tributes/edit"]')?.textContent).toBe("Adicionar homenagem")
    expect(container.querySelector('a[href="/profile/memorial/tributes/edit?tributeId=pending"]')?.textContent).toContain("Waiting memory")
    expect(container.querySelector('a[href="/profile/memorial/tributes/edit?tributeId=rejected"]')?.textContent).toContain("Retry memory")
    expect(container.textContent).toContain("Sua homenagem não foi aprovada.")
  })
  it("hides creation and editing from an anonymous viewer", async () => {
    await render(<TributesClient items={items} profileId="memorial" sessionUserId="" canWrite={false} />)
    expect(container.querySelector('a[href*="/tributes/edit"]')).toBeNull()
    expect(container.querySelectorAll("article")).toHaveLength(3)
  })
  it("submits a new form without selecting an old tribute", async () => {
    await render(<TributeForm profileId="memorial" authorName="Ana" />)
    expect(container.querySelector("textarea")?.value).toBe("")
    const submit = [...container.querySelectorAll("button")].find((button) => button.textContent === "Enviar homenagem")!
    await act(async () => submit.click())
    expect(submitTribute).toHaveBeenCalledExactlyOnceWith("memorial", { text: "", imageUrl: undefined }, undefined)
  })
  it("submits the selected ID when editing", async () => {
    await render(<TributeForm profileId="memorial" authorName="Ana" existing={{ id: "second", text: "Second memory" }} />)
    expect(container.querySelector("textarea")?.value).toBe("Second memory")
    const save = [...container.querySelectorAll("button")].find((button) => button.textContent === "Salvar")!
    await act(async () => save.click())
    expect(submitTribute).toHaveBeenCalledExactlyOnceWith("memorial", { text: "Second memory", imageUrl: undefined }, "second")
  })
})
