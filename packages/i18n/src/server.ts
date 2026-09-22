import 'server-only'

import { cookies, headers } from 'next/headers'
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  LOCALE_COOKIE_NAME,
  type SupportedLocale,
} from './config'

function localeFromAcceptLanguage(value: string | null): SupportedLocale | undefined {
  if (!value) return undefined

  const languageTags = value
    .split(',')
    .map((item) => {
      const [tag, ...parameters] = item.trim().split(';')
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='))
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1
      return { tag: tag.toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 }
    })
    .sort((left, right) => right.quality - left.quality)

  for (const { tag } of languageTags) {
    if (tag === 'pt' || tag.startsWith('pt-')) return 'pt-BR'
    if (tag === 'es' || tag.startsWith('es-')) return 'es-MX'
    if (tag === 'en' || tag.startsWith('en-')) return 'en-US'
  }

  return undefined
}

/**
 * Resolves the active locale for a request:
 *   1. The `locale` cookie (the user's explicit, persisted choice), if valid.
 *   2. Otherwise the browser's weighted `Accept-Language` preference.
 *   3. Otherwise English.
 */
export async function resolveLocale(): Promise<SupportedLocale> {
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get(LOCALE_COOKIE_NAME)?.value
  if (isSupportedLocale(fromCookie)) return fromCookie

  const headerStore = await headers()
  const acceptedLocale = localeFromAcceptLanguage(headerStore.get('accept-language'))
  if (acceptedLocale) return acceptedLocale

  return DEFAULT_LOCALE
}
