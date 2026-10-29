// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { toast } from "sonner"
import QRCode from "qrcode"
import { downloadPetQrCode } from "@/actions/pet-qr.actions"
import { downloadPlaceQrCode } from "@/actions/place-qr.actions"
import { downloadBlob, downloadQrDataUrl } from "@/lib/download-file"
import { GenCodeDownloadButtons } from "./gen-code-download-buttons"
import { QrCodeClient } from "./qr-code-client"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(), toString: vi.fn() } }))
vi.mock("@/actions/pet-qr.actions", () => ({ downloadPetQrCode: vi.fn() }))
vi.mock("@/actions/place-qr.actions", () => ({ downloadPlaceQrCode: vi.fn() }))
vi.mock("@/lib/download-file", () => ({ downloadBlob: vi.fn(), downloadQrDataUrl: vi.fn() }))

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  vi.mocked(downloadPetQrCode).mockResolvedValue({ ok: true, data: { dataUrl: "data:image/png;base64,cG5n" } })
  vi.mocked(downloadPlaceQrCode).mockResolvedValue({ ok: true, data: { dataUrl: "data:image/png;base64,cG5n" } })
  vi.mocked(QRCode.toDataURL).mockResolvedValue("data:image/png;base64,cG5n" as never)
  vi.mocked(QRCode.toString).mockResolvedValue("<svg/>" as never)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const clickFormat = async (format: string) => {
  const button = [...container.querySelectorAll("button")].find((node) => node.textContent === format)!
  await act(async () => button.click())
}

it.each(["png", "svg"] as const)("hands pet %s to the shared file saver with the pet filename", async (format) => {
  const dataUrl = format === "png" ? "data:image/png;base64,cG5n" : "data:image/svg+xml;base64,PHN2Zy8+"
  vi.mocked(downloadPetQrCode).mockResolvedValue({ ok: true, data: { dataUrl } })
  await act(async () => root.render(<GenCodeDownloadButtons target={{ kind: "pet", profileId: "pet-1" }} />))
  await clickFormat(format.toUpperCase())
  expect(downloadPetQrCode).toHaveBeenCalledExactlyOnceWith("pet-1", format)
  expect(downloadPlaceQrCode).not.toHaveBeenCalled()
  expect(downloadQrDataUrl).toHaveBeenCalledExactlyOnceWith(dataUrl, `gencode-pet-1.${format}`)
  expect(toast.success).toHaveBeenCalledExactlyOnceWith(`client.${format}Downloaded`)
  expect(container.textContent).toContain("client.downloadHint")
})

it("uses the same saver for human PNGs and keeps SVG as a typed file", async () => {
  await act(async () => root.render(<QrCodeClient profileUrl="https://genealogiq.example/profile/person-1" />))
  await clickFormat("PNG")
  expect(downloadQrDataUrl).toHaveBeenCalledExactlyOnceWith("data:image/png;base64,cG5n", "qr-classic.png")
  await clickFormat("SVG")
  const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0]
  expect(blob.type).toBe("image/svg+xml")
  expect(await blob.text()).toBe("<svg/>")
  expect(filename).toBe("qr-classic.svg")
})

it("preserves place IDs and filenames when using the shared controls", async () => {
  await act(async () => root.render(<GenCodeDownloadButtons target={{ kind: "place", profileId: "person-1", placeId: "place-1" }} />))
  await clickFormat("PNG")
  expect(downloadPlaceQrCode).toHaveBeenCalledExactlyOnceWith("person-1", "place-1", "png")
  expect(downloadPetQrCode).not.toHaveBeenCalled()
  expect(downloadQrDataUrl).toHaveBeenCalledExactlyOnceWith("data:image/png;base64,cG5n", "gencode-place-1.png")
})

it("shows a permission failure without downloading or announcing success", async () => {
  vi.mocked(downloadPetQrCode).mockResolvedValue({ ok: false, message: "Premium required" })
  await act(async () => root.render(<GenCodeDownloadButtons target={{ kind: "pet", profileId: "pet-1" }} />))
  await clickFormat("PNG")
  expect(downloadQrDataUrl).not.toHaveBeenCalled()
  expect(toast.success).not.toHaveBeenCalled()
  expect(toast.error).toHaveBeenCalledExactlyOnceWith("Premium required")
  expect([...container.querySelectorAll("button")].every((button) => !button.disabled)).toBe(true)
})

it("reports a file conversion failure and allows retry without false success", async () => {
  vi.mocked(downloadQrDataUrl).mockRejectedValueOnce(new Error("Failed to fetch"))
  await act(async () => root.render(<GenCodeDownloadButtons target={{ kind: "pet", profileId: "pet-1" }} />))
  await clickFormat("PNG")
  expect(toast.error).toHaveBeenCalledExactlyOnceWith("client.downloadFailed")
  expect(toast.success).not.toHaveBeenCalled()
  await clickFormat("PNG")
  expect(toast.success).toHaveBeenCalledOnce()
})

it("keeps both formats disabled and waits for the browser handoff before success", async () => {
  let finish!: () => void
  vi.mocked(downloadQrDataUrl).mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
  await act(async () => root.render(<GenCodeDownloadButtons target={{ kind: "pet", profileId: "pet-1" }} />))
  await clickFormat("PNG")
  expect([...container.querySelectorAll("button")].every((button) => button.disabled)).toBe(true)
  expect(toast.success).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(toast.success).toHaveBeenCalledOnce()
  expect([...container.querySelectorAll("button")].every((button) => !button.disabled)).toBe(true)
})
