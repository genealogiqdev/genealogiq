import QRCode from 'qrcode'

/** Colour presets offered for printable QR codes (same six as the web apps). */
export const QR_PRESETS = [
  { key: 'classic', fg: '#0F172A', bg: '#FFFFFF' },
  { key: 'indigo', fg: '#454575', bg: '#FFFFFF' },
  { key: 'inverted', fg: '#FFFFFF', bg: '#0F172A' },
  { key: 'soft', fg: '#53657F', bg: '#F5F1EA' },
  { key: 'bronze', fg: '#7A5230', bg: '#F8F1E4' },
  { key: 'forest', fg: '#1F4032', bg: '#FFFFFF' },
] as const

export type QrPreset = (typeof QR_PRESETS)[number]

/** Quiet zone, in modules, around every exported code (web: QR_OPTIONS.margin). */
export const QR_MARGIN = 4
export const QR_PNG_SIZE = 1024

/** Module matrix at error-correction level H, the level printed plaques rely on. */
export function qrMatrix(value: string): { size: number; isDark: (row: number, column: number) => boolean } {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'H' })
  return { size: modules.size, isDark: (row, column) => modules.get(row, column) === 1 }
}

/** A standalone vector SVG of the code, for print shops. */
export function qrSvg(value: string, colors: { fg: string; bg: string } = QR_PRESETS[0], pixelSize = QR_PNG_SIZE): string {
  const matrix = qrMatrix(value)
  const total = matrix.size + QR_MARGIN * 2
  let path = ''
  for (let row = 0; row < matrix.size; row += 1) {
    let column = 0
    while (column < matrix.size) {
      if (!matrix.isDark(row, column)) {
        column += 1
        continue
      }
      let run = 1
      while (column + run < matrix.size && matrix.isDark(row, column + run)) run += 1
      path += `M${column + QR_MARGIN} ${row + QR_MARGIN}h${run}v1h-${run}z`
      column += run
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${colors.bg}"/>` +
    `<path d="${path}" fill="${colors.fg}"/>` +
    `</svg>`
  )
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string)

/** A printable A4 sheet with three codes per row, each labelled with its code. */
export function qrPrintSheetHtml(title: string, items: readonly { label: string; url: string }[]): string {
  const cells = items
    .map((item) => `<div class="cell">${qrSvg(item.url, QR_PRESETS[0], 300)}<p>${escapeHtml(item.label)}</p></div>`)
    .join('')
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>` +
    `@page{size:A4;margin:12mm}body{font-family:Helvetica,Arial,sans-serif;margin:0}` +
    `h1{font-size:14pt;margin:0 0 8mm}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}` +
    `.cell{text-align:center;break-inside:avoid;page-break-inside:avoid}.cell svg{width:100%;height:auto}` +
    `.cell p{font-size:10pt;margin:2mm 0 0;font-family:monospace;letter-spacing:.5pt}` +
    `</style></head><body><h1>${escapeHtml(title)}</h1><div class="grid">${cells}</div></body></html>`
  )
}
