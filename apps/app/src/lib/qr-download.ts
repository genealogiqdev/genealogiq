import "server-only"

import QRCode from "qrcode"

export type QrDownloadFormat = "png" | "svg"

export async function generateQrDataUrl(path: string, format: QrDownloadFormat): Promise<string> {
  const target = new URL(path, process.env.APP_URL ?? "https://genealogiq.app").href
  const options = {
    errorCorrectionLevel: "H",
    margin: 4,
    color: { dark: "#0F172A", light: "#FFFFFF" },
  } as const

  if (format === "svg") {
    const svg = await QRCode.toString(target, { ...options, type: "svg" })
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`
  }

  return QRCode.toDataURL(target, { ...options, width: 2048 })
}
