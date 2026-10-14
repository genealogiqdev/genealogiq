// @vitest-environment happy-dom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import QRCode from "qrcode"
import { PlaceQrDisplay } from "./place-qr-display"

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn() } }))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/components/gen-code-download-buttons", () => ({ GenCodeDownloadButtons: () => null }))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.mocked(QRCode.toDataURL).mockResolvedValue("data:image/png;base64,cG5n" as never)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it("displays the profile QR selected by the server instead of rebuilding a location URL", async () => {
  await act(async () => root.render(
    <PlaceQrDisplay profileId="memorial-1" placeId="place-1" targetPath="/profile/memorial-1" canDownload={false} />,
  ))

  expect(QRCode.toDataURL).toHaveBeenCalledExactlyOnceWith("http://localhost:3000/profile/memorial-1", {
    errorCorrectionLevel: "H", margin: 2, width: 512,
    color: { dark: "#0F172A", light: "#FFFFFF" },
  })
  expect(container.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,cG5n")
})
