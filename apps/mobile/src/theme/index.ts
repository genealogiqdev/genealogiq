import { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { Uniwind } from 'uniwind'
import { create } from 'zustand'
import type { SystemId } from '@/config'
import { plainStorage } from '@/lib/storage'
import palettes from '../theme-colors.json'

export type SchemePreference = 'system' | 'light' | 'dark'

const KEY = 'gq.scheme'

interface ThemeState {
  preference: SchemePreference
  hydrate: () => Promise<void>
  setPreference: (preference: SchemePreference) => void
}

export const useThemePreference = create<ThemeState>((set) => ({
  preference: 'system',
  async hydrate() {
    const stored = await plainStorage.get<SchemePreference>(KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') set({ preference: stored })
  },
  setPreference(preference) {
    set({ preference })
    void plainStorage.set(KEY, preference)
  },
}))

export function useIsDark(): boolean {
  const device = useColorScheme()
  const preference = useThemePreference((state) => state.preference)
  return preference === 'system' ? device === 'dark' : preference === 'dark'
}

type ThemeName = keyof typeof palettes

export interface Palette {
  bg: string
  fg: string
  surface: string
  s2: string
  s3: string
  muted: string
  default: string
  dfg: string
  accent: string
  afg: string
  danger: string
  border: string
  sep: string
  field: string
  seg: string
  success: string
  warning: string
}

/** Each system has its own brand theme; the three never mix on one screen. */
export function themeName(system: SystemId, dark: boolean): ThemeName {
  return `${system}-${dark ? 'dark' : 'light'}` as ThemeName
}

/** Keeps the Tailwind theme in step with the system on screen and the light/dark choice. */
export function useApplyTheme(system: SystemId): void {
  const dark = useIsDark()
  useEffect(() => {
    Uniwind.setTheme(themeName(system, dark) as never)
  }, [system, dark])
}

/** Raw colours for APIs that cannot take class names (navigation, charts, SVG, icons). */
export function usePalette(system: SystemId): Palette {
  const dark = useIsDark()
  return palettes[themeName(system, dark)] as Palette
}

/** Sequoia sets headings in Spectral; the other two systems use Inter throughout. */
export function headingFont(system: SystemId): string {
  return system === 'seq' ? 'Spectral_600SemiBold' : 'Inter_700Bold'
}

/** Gradient behind the Genealogiq brand surfaces (web: --gradient-brand). */
export const BRAND_GRADIENT: Record<SystemId, readonly [string, string]> = {
  app: ['#616198', '#8096AB'],
  seq: ['#2C4769', '#4F72A0'],
  bms: ['#171717', '#404040'],
}
