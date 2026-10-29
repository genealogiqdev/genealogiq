/** Hand a file to the browser. This cannot confirm that the user saved it. */
export function downloadBlob(blob: Blob, filename: string) {
  if (!blob.size) throw new Error("Empty download")

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  try {
    link.click()
  } finally {
    link.remove()
    // Safari may consume the URL after click() returns. Keep it alive long
    // enough for that handoff, then release the temporary file bytes.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

export async function downloadQrDataUrl(dataUrl: string, filename: string) {
  if (!/^data:image\/(?:png|svg\+xml);base64,/.test(dataUrl)) {
    throw new Error("Invalid QR download")
  }
  const response = await fetch(dataUrl)
  if (!response.ok) throw new Error("Could not read QR download")
  downloadBlob(await response.blob(), filename)
}
