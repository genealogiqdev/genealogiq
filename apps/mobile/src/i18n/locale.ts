import { create } from 'zustand'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@/config'
import { plainStorage } from '@/lib/storage'

const KEY = 'gq.locale'

/** Same mapping the web apps apply to Accept-Language. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null
  const lower = tag.toLowerCase()
  if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR'
  if (lower === 'es' || lower.startsWith('es-')) return 'es-MX'
  if (lower === 'en' || lower.startsWith('en-')) return 'en-US'
  return null
}

interface LocaleState {
  locale: Locale
  hydrate: () => Promise<void>
  setLocale: (locale: Locale) => void
}

export const useLocale = create<LocaleState>((set) => ({
  // Portuguese until the user picks another language in Account.
  locale: DEFAULT_LOCALE,
  async hydrate() {
    const stored = await plainStorage.get<string>(KEY)
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) set({ locale: stored as Locale })
  },
  setLocale(locale) {
    set({ locale })
    void plainStorage.set(KEY, locale)
  },
}))

export const currentLocale = (): Locale => useLocale.getState().locale

/** Currency each locale buys in, mirroring `currencyForLocale` on the web. */
export const CURRENCY_FOR_LOCALE: Record<Locale, 'usd' | 'brl' | 'mxn'> = {
  'en-US': 'usd',
  'pt-BR': 'brl',
  'es-MX': 'mxn',
}
