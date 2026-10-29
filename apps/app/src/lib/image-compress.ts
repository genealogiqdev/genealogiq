"use client"

interface CompressOptions {
  /** Max dimension on either axis (the smaller of width/height after fit-inside). */
  maxDim: number
  /** JPEG/WebP quality 0..1; ignored for PNG. Defaults to 0.85. */
  quality?: number
}

export class ImageReadError extends Error {
  constructor() {
    super("Could not read image")
    this.name = "ImageReadError"
  }
}

// Desktop file pickers can omit MIME metadata. Preserve the actual supported
// format instead of uploading an empty content type or flattening PNG/GIF.
function normalizeImageType(file: File): File {
  if (file.type && file.type !== "application/octet-stream") return file
  const types: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
  }
  const type = types[file.name.split(".").pop()?.toLowerCase() ?? ""]
  return type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file
}

/**
 * Client-side image compression via Canvas.
 *
 * - PNG/SVG → encoded as PNG (preserves transparency; never uploads raw SVG)
 * - GIF → passed through untouched (animated GIFs would lose their animation)
 * - Other browser-decodable formats → encoded as JPEG at `quality`
 *
 * Small JPEG/WebP and GIF files keep their bytes. PNG/SVG always use Canvas.
 */
export async function compressImage(file: File, options: CompressOptions): Promise<File> {
  const { maxDim, quality = 0.85 } = options
  file = normalizeImageType(file)

  if (file.type === "image/gif") return file

  const url = URL.createObjectURL(file)
  try {
    // A desktop/PWA may fail to resolve a local object URL. Retry from file
    // bytes before rejecting a readable image; this still performs decoding.
    const img = await loadImage(url).catch(async () => loadImage(await readDataUrl(file)))
    const { width, height } = img
    if (!width || !height) throw new ImageReadError()
    const outputType = file.type === "image/png" || file.type === "image/svg+xml" ? "image/png" : "image/jpeg"

    if (width <= maxDim && height <= maxDim && outputType !== "image/png") {
      // Already small enough and not a PNG we'd want to re-encode for size.
      return file
    }

    const scale = Math.min(1, maxDim / Math.max(width, height))
    const targetWidth  = Math.max(1, Math.round(width  * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement("canvas")
    canvas.width  = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new ImageReadError()

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

    const blob = await canvasToBlob(canvas, outputType, quality)
    if (!blob) throw new ImageReadError()

    const dot = file.name.lastIndexOf(".")
    const baseName = dot >= 0 ? file.name.slice(0, dot) : file.name
    const ext = outputType === "image/png" ? "png" : "jpg"

    return new File([blob], `${baseName}.${ext}`, {
      type:         outputType,
      lastModified: file.lastModified,
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new ImageReadError())
    img.src     = url
  })
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new ImageReadError())
    reader.onerror = reader.onabort = () => reject(new ImageReadError())
    reader.readAsDataURL(file)
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}
