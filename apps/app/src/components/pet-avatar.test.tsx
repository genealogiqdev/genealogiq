// @vitest-environment happy-dom

import { act, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import messages from "../../messages/pt-BR.json"
import { PetCreateForm } from "./pet-create-form"
import { PetEditForm } from "./pet-edit-form"
import { compressImage, ImageReadError } from "@/lib/image-compress"
import { uploadMedia } from "@genealogiq/core"
import { createPet, updatePet } from "@/actions/pet.actions"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@genealogiq/core", () => ({ uploadMedia: vi.fn() }))
vi.mock("@/actions/pet.actions", () => ({ createPet: vi.fn(), updatePet: vi.fn(), deletePet: vi.fn() }))
vi.mock("@/lib/image-compress", async (original) => ({ ...await original<object>(), compressImage: vi.fn() }))
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values: Record<string, string> = {}) => {
    const text = `${namespace}.${key}`.split(".").reduce<unknown>((part, segment) => (part as Record<string, unknown>)[segment], messages) as string
    return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, value), text)
  },
}))

let container: HTMLDivElement
let root: Root
const uploadedUrl = "https://media.test/profiles/pet/bio/new.png"
const owners = [{ id: "owner", name: "Tutor" }]

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(compressImage).mockResolvedValue(new File(["png"], "portrait.png", { type: "image/png" }))
  vi.mocked(uploadMedia).mockResolvedValue({ url: uploadedUrl })
  vi.mocked(createPet).mockResolvedValue({ ok: true, data: { id: "pet" } })
  vi.mocked(updatePet).mockResolvedValue({ ok: true })
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function choose(file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  await act(async () => {
    const data = new DataTransfer()
    data.items.add(file)
    input.files = data.files
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
  return input
}

describe.each(["create", "edit"] as const)("pet %s avatar", (mode) => {
  async function render() {
    await act(async () => root.render(mode === "create"
      ? <PetCreateForm ownerId="owner" ownerOptions={owners} />
      : <PetEditForm profileId="pet" rootId="owner" ownerIds={["owner"]} ownerOptions={owners}
          initial={{ id: "pet", firstName: "Rex", avatarUrl: "https://media.test/old.png" } as ComponentProps<typeof PetEditForm>["initial"]} />))
  }
  async function save() {
    const label = mode === "create" ? "Criar perfil" : "Salvar"
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label)!
    await act(async () => button.click())
    return mode === "create" ? vi.mocked(createPet).mock.calls.at(-1)?.[0] : vi.mocked(updatePet).mock.calls.at(-1)?.[1]
  }

  it("uploads the converted SVG as PNG in the correct scope and saves the returned URL", async () => {
    await render()
    const file = new File(["svg"], "portrait.svg", { type: "image/svg+xml" })
    const input = await choose(file)
    expect(input.accept).toContain("image/svg+xml")
    expect(input.value).toBe("")
    expect(compressImage).toHaveBeenCalledWith(file, { maxDim: 512 })
    expect(uploadMedia).toHaveBeenCalledWith("bio/portrait.png", expect.objectContaining({ type: "image/png" }), {
      access: "public", handleUploadUrl: "/api/bio/upload", contentType: "image/png",
      clientPayload: mode === "create" ? '{"scope":"create-pet"}' : '{"profileId":"pet"}',
    })
    expect(await save()).toEqual(expect.objectContaining({ avatarUrl: uploadedUrl }))
  })

  it("keeps the last successful photo after a read failure and permits retrying the same file", async () => {
    await render()
    const file = new File(["png"], "portrait.png", { type: "image/png" })
    await choose(file)
    vi.mocked(compressImage).mockRejectedValueOnce(new ImageReadError())
    await choose(file)
    expect(uploadMedia).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith("Não foi possível ler esta imagem. Tente outra foto ou exporte o arquivo como JPG ou PNG.")
    expect(await save()).toEqual(expect.objectContaining({ avatarUrl: uploadedUrl }))
    await choose(file)
    expect(uploadMedia).toHaveBeenCalledTimes(2)
  })

  it("preserves the existing photo and translates an upload failure", async () => {
    await render()
    vi.mocked(uploadMedia).mockRejectedValueOnce(new Error("Internal storage failure"))
    await choose(new File(["png"], "portrait.png", { type: "image/png" }))
    expect(toast.error).toHaveBeenCalledWith("Falha ao enviar o avatar.")
    expect(await save()).toEqual(expect.objectContaining({ avatarUrl: mode === "create" ? null : "https://media.test/old.png" }))
  })

  it("rejects unsupported files before decoding or uploading", async () => {
    await render()
    await choose(new File(["heic"], "portrait.heic", { type: "image/heic" }))
    expect(toast.error).toHaveBeenCalledWith("Arquivo não suportado. Use JPG, PNG, WebP, GIF, SVG.")
    expect(compressImage).not.toHaveBeenCalled()
    expect(uploadMedia).not.toHaveBeenCalled()
  })
})
