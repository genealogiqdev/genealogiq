// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { downloadBlob, downloadQrDataUrl } from "./download-file"

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:http://localhost/qr-file")
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it("hands the named Blob to a connected download link and keeps its URL alive for Safari", () => {
  const blob = new Blob(["<svg/>"], { type: "image/svg+xml" })
  vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.isConnected).toBe(true)
    expect(this.href).toBe("blob:http://localhost/qr-file")
    expect(this.download).toBe("gencode-pet.svg")
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })
  downloadBlob(blob, "gencode-pet.svg")
  expect(URL.createObjectURL).toHaveBeenCalledExactlyOnceWith(blob)
  expect(document.querySelector("a[download]")).toBeNull()
  vi.advanceTimersByTime(59_999)
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:http://localhost/qr-file")
})

it("converts the server SVG data URL into actual file bytes with the correct MIME", async () => {
  await downloadQrDataUrl("data:image/svg+xml;base64,PHN2Zy8+", "gencode-pet.svg")
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
  expect(blob.type).toBe("image/svg+xml")
  expect(await blob.text()).toBe("<svg/>")
})

it("converts PNG bytes without corrupting the binary signature", async () => {
  await downloadQrDataUrl("data:image/png;base64,iVBORw0KGgo=", "gencode-pet.png")
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
  expect(blob.type).toBe("image/png")
  expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
})

it.each(["", "https://example.com/qr.png", "data:text/html;base64,PHN2Zy8+"])("rejects invalid QR input %s without starting a download", async (input) => {
  await expect(downloadQrDataUrl(input, "qr.png")).rejects.toThrow("Invalid QR download")
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
})

it("rejects empty files", () => {
  expect(() => downloadBlob(new Blob(), "qr.svg")).toThrow("Empty download")
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})

it("cleans up the anchor and eventually releases the URL even if the browser handoff throws", () => {
  vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => { throw new Error("Blocked") })
  expect(() => downloadBlob(new Blob(["<svg/>"]), "qr.svg")).toThrow("Blocked")
  expect(document.querySelector("a[download]")).toBeNull()
  vi.advanceTimersByTime(60_000)
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
})
