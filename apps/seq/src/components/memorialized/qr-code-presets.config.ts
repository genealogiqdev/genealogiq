export const QR_PRESETS = [
  { key: 'classic',  fg: '#0F172A', bg: '#FFFFFF' },
  { key: 'indigo',   fg: '#454575', bg: '#FFFFFF' },
  { key: 'inverted', fg: '#FFFFFF', bg: '#0F172A' },
  { key: 'soft',     fg: '#53657F', bg: '#F5F1EA' },
  { key: 'bronze',   fg: '#7A5230', bg: '#F8F1E4' },
  { key: 'forest',   fg: '#1F4032', bg: '#FFFFFF' },
] as const

export type QrPreset = typeof QR_PRESETS[number]
export const QR_OPTIONS = { errorCorrectionLevel: 'H', margin: 4 } as const
export const QR_PNG_WIDTH = 1024
