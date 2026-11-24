import { describe, expect, it } from 'vitest'
import { QR_MARGIN, QR_PRESETS, qrMatrix, qrPrintSheetHtml, qrSvg } from './qr'

describe('QR export', () => {
  it('offers the six print presets of the web apps, classic first', () => {
    expect(QR_PRESETS.map((preset) => preset.key)).toEqual(['classic', 'indigo', 'inverted', 'soft', 'bronze', 'forest'])
    expect(QR_PRESETS[0]).toEqual({ key: 'classic', fg: '#0F172A', bg: '#FFFFFF' })
  })

  it('encodes at error-correction level H: a 31-character URL needs a version 4 symbol (33 modules)', () => {
    // Version 3-H holds 24 bytes, version 4-H holds 34, so 31 bytes land on version 4 = 17 + 4 * 4 modules.
    const matrix = qrMatrix('https://genealogiq.com.br/qr/AB')
    expect('https://genealogiq.com.br/qr/AB').toHaveLength(31)
    expect(matrix.size).toBe(33)
    // The three finder patterns put a dark module in three corners and never in the fourth.
    expect(matrix.isDark(0, 0)).toBe(true)
    expect(matrix.isDark(0, 32)).toBe(true)
    expect(matrix.isDark(32, 0)).toBe(true)
  })

  it('draws the SVG with a four-module quiet zone and the chosen colours', () => {
    const svg = qrSvg('https://genealogiq.com.br/qr/AB', { fg: '#7A5230', bg: '#F8F1E4' }, 512)
    expect(QR_MARGIN).toBe(4)
    expect(svg).toContain('viewBox="0 0 41 41"')
    expect(svg).toContain('width="512" height="512"')
    expect(svg).toContain('<rect width="41" height="41" fill="#F8F1E4"/>')
    expect(svg).toContain('fill="#7A5230"')
    // The top-left finder pattern starts with a run of seven dark modules at the quiet-zone offset.
    expect(svg).toContain('M4 4h7v1h-7z')
  })

  it('escapes labels on the print sheet and prints one cell per code', () => {
    const html = qrPrintSheetHtml('Lote <1> & "A"', [
      { label: 'ABCD-1234', url: 'https://genealogiq.com.br/qr/ABCD1234' },
      { label: '<script>x</script>', url: 'https://genealogiq.com.br/qr/EFGH5678' },
    ])
    expect(html).toContain('<h1>Lote &lt;1&gt; &amp; &quot;A&quot;</h1>')
    expect(html).toContain('<p>ABCD-1234</p>')
    expect(html).toContain('<p>&lt;script&gt;x&lt;/script&gt;</p>')
    expect(html).not.toContain('<script>')
    expect(html.match(/class="cell"/g)).toHaveLength(2)
    expect(html).toContain('grid-template-columns:repeat(3,1fr)')
  })
})
