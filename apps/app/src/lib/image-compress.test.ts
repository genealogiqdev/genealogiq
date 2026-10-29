// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { compressImage, ImageReadError } from "./image-compress"
import { isAllowedImage, isAllowedPetAvatar } from "./upload-validation"

let width: number
let height: number
let failingSources: (src: string) => boolean
let sources: string[]
const drawImage = vi.fn()

beforeEach(() => {
  width = 1200
  height = 800
  sources = []
  failingSources = () => false
  vi.stubGlobal("Image", class {
    width = width
    height = height
    onload?: () => void
    onerror?: () => void
    set src(value: string) {
      sources.push(value)
      queueMicrotask(() => failingSources(value) ? this.onerror?.() : this.onload?.())
    }
  })
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-photo")
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback, type) {
    callback(new Blob(["encoded-image"], { type }))
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); drawImage.mockClear() })

describe("desktop image preparation", () => {
  it("retries file bytes when a local object URL cannot load", async () => {
    failingSources = (src) => src.startsWith("blob:")
    const output = await compressImage(new File(["photo-bytes"], "pet.jpg", { type: "image/jpeg" }), { maxDim: 512 })
    expect(sources).toEqual(["blob:local-photo", "data:image/jpeg;base64,cGhvdG8tYnl0ZXM="])
    expect(output.name).toBe("pet.jpg")
    expect(output.type).toBe("image/jpeg")
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 512, 341)
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:local-photo")
  })

  it("rejects unreadable bytes after both decoders fail and releases the URL", async () => {
    failingSources = () => true
    await expect(compressImage(new File(["broken"], "pet.png", { type: "image/png" }), { maxDim: 512 })).rejects.toBeInstanceOf(ImageReadError)
    expect(sources).toHaveLength(2)
    expect(drawImage).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-photo")
  })

  it("rasterizes even a small SVG as PNG instead of forwarding SVG to storage", async () => {
    width = height = 64
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>'], "pet.svg", { type: "image/svg+xml" })
    const output = await compressImage(file, { maxDim: 512 })
    expect(output).not.toBe(file)
    expect(output.name).toBe("pet.png")
    expect(output.type).toBe("image/png")
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png", 0.85)
  })

  it("rejects a failed SVG rasterization rather than uploading the raw file", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(null))
    await expect(compressImage(new File(["svg"], "pet.svg", { type: "image/svg+xml" }), { maxDim: 512 })).rejects.toBeInstanceOf(ImageReadError)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-photo")
  })

  it.each(["", "application/octet-stream"])("retains PNG transparency with desktop MIME %j", async (type) => {
    const output = await compressImage(new File(["png"], "PET.PNG", { type }), { maxDim: 512 })
    expect(output.name).toBe("PET.png")
    expect(output.type).toBe("image/png")
  })

  it("keeps animation and supplies GIF MIME when desktop metadata is empty", async () => {
    const output = await compressImage(new File(["animated-gif"], "PET.GIF"), { maxDim: 512 })
    expect(output.type).toBe("image/gif")
    expect(await output.text()).toBe("animated-gif")
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it("keeps a small JPEG unchanged", async () => {
    width = height = 128
    const file = new File(["jpeg"], "pet.jpg", { type: "image/jpeg" })
    expect(await compressImage(file, { maxDim: 512 })).toBe(file)
    expect(drawImage).not.toHaveBeenCalled()
  })

  it("keeps a narrow image at least one pixel wide", async () => {
    width = 1
    height = 4000
    await compressImage(new File(["png"], "pet.png", { type: "image/png" }), { maxDim: 512 })
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1, 512)
  })

  it("allows SVG only in the pet portrait path and rejects unsupported files", () => {
    const svg = new File(["svg"], "PET.SVG")
    expect(isAllowedPetAvatar(svg)).toBe(true)
    expect(isAllowedImage(svg)).toBe(false)
    expect(isAllowedPetAvatar(new File(["heic"], "pet.heic", { type: "image/heic" }))).toBe(false)
    expect(isAllowedPetAvatar(new File(["pdf"], "pet.pdf", { type: "application/pdf" }))).toBe(false)
  })
})
