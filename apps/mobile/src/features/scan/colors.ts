// The categorical colours of the six note types. Charts/SVG/Skia cannot take
// theme class names, so this is the one place the feature defines raw colours.
// Each is checked (colors.test.ts) for at least 3:1 contrast against both the
// screen background and the card surface of its theme. Colour is never the
// only cue: the legend carries labels and every note names its type.
import type { ScanNodeType } from '@/api/scan'

export type TypeColors = Record<ScanNodeType, string>

export const TYPE_COLORS: { light: TypeColors; dark: TypeColors } = {
  light: {
    surname: '#6B3FA0',
    variant: '#B0358A',
    person: '#1F6FB5',
    family: '#0F766E',
    place: '#A8570A',
    event: '#B3261E',
  },
  dark: {
    surname: '#C4A1F5',
    variant: '#F28BC8',
    person: '#7DB8F2',
    family: '#5FD4C4',
    place: '#F2B05E',
    event: '#F58A80',
  },
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of `#RRGGBB`. */
export function luminance(hexColor: string): number {
  const value = hexColor.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two `#RRGGBB` colours (1–21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
