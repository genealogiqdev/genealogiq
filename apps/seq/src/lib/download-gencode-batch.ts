'use client'
/** Generates printable QR artwork. This does not sell or activate a code. */
export async function downloadGenCodeBatch(codes: string[], appBaseUrl: string, locale: string, help: string, filename: string) {
  const QRCode = (await import('qrcode')).default
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
  const cards = await Promise.all(codes.map(async code => `<article>${await QRCode.toString(`${appBaseUrl.replace(/\/$/, '')}/qr/${encodeURIComponent(code)}`, { type: 'svg', margin: 4, errorCorrectionLevel: 'H' })}<p>${escape(code)}</p></article>`))
  const html = `<!doctype html><html lang="${escape(locale)}"><meta charset="utf-8"><title>GenCodes</title><style>body{font-family:sans-serif}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}article{text-align:center;break-inside:avoid}svg{width:180px;height:180px}p{font-size:12px}@media print{header{display:none}}</style><header><p>${escape(help)}</p></header><main>${cards.join('')}</main></html>`
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
