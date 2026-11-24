import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { IntlProvider, useTranslations } from 'use-intl'
import type { Locale, SystemId } from '@/config'
import { useSession } from '@/auth/session'
import { ApiError } from '@/api/client'
import { useLocale } from './locale'

// The web apps' catalogues are the single source of translations: the mobile
// app bundles them as-is so wording never drifts between web and mobile.
import appEn from '../../../app/messages/en-US.json'
import appPt from '../../../app/messages/pt-BR.json'
import appEs from '../../../app/messages/es-MX.json'
import bmsEn from '../../../bms/messages/en-US.json'
import bmsPt from '../../../bms/messages/pt-BR.json'
import bmsEs from '../../../bms/messages/es-MX.json'
import seqEn from '../../../seq/messages/en-US.json'
import seqPt from '../../../seq/messages/pt-BR.json'
import seqEs from '../../../seq/messages/es-MX.json'
// Strings that exist only in the mobile app live under the `Mobile` namespace.
import mobileEn from './messages/en-US.json'
import mobilePt from './messages/pt-BR.json'
import mobileEs from './messages/es-MX.json'

// Mobile-only strings per feature area, exposed as `Mobile.<area>.*`. Each area owns its three files.
import area_appEn from './messages/areas/app.en-US.json'
import area_appPt from './messages/areas/app.pt-BR.json'
import area_appEs from './messages/areas/app.es-MX.json'
import area_appContentEn from './messages/areas/appContent.en-US.json'
import area_appContentPt from './messages/areas/appContent.pt-BR.json'
import area_appContentEs from './messages/areas/appContent.es-MX.json'
import area_treeEn from './messages/areas/tree.en-US.json'
import area_treePt from './messages/areas/tree.pt-BR.json'
import area_treeEs from './messages/areas/tree.es-MX.json'
import area_seqEn from './messages/areas/seq.en-US.json'
import area_seqPt from './messages/areas/seq.pt-BR.json'
import area_seqEs from './messages/areas/seq.es-MX.json'
import area_bmsEn from './messages/areas/bms.en-US.json'
import area_bmsPt from './messages/areas/bms.pt-BR.json'
import area_bmsEs from './messages/areas/bms.es-MX.json'
import area_scanEn from './messages/areas/scan.en-US.json'
import area_scanPt from './messages/areas/scan.pt-BR.json'
import area_scanEs from './messages/areas/scan.es-MX.json'

type Catalogue = Record<string, unknown>

const CATALOGUES: Record<SystemId, Record<Locale, Catalogue>> = {
  app: { 'en-US': appEn, 'pt-BR': appPt, 'es-MX': appEs },
  bms: { 'en-US': bmsEn, 'pt-BR': bmsPt, 'es-MX': bmsEs },
  seq: { 'en-US': seqEn, 'pt-BR': seqPt, 'es-MX': seqEs },
}

const MOBILE: Record<Locale, Catalogue> = {
  'en-US': { ...mobileEn, app: area_appEn, appContent: area_appContentEn, tree: area_treeEn, seq: area_seqEn, bms: area_bmsEn, scan: area_scanEn },
  'pt-BR': { ...mobilePt, app: area_appPt, appContent: area_appContentPt, tree: area_treePt, seq: area_seqPt, bms: area_bmsPt, scan: area_scanPt },
  'es-MX': { ...mobileEs, app: area_appEs, appContent: area_appContentEs, tree: area_treeEs, seq: area_seqEs, bms: area_bmsEs, scan: area_scanEs },
}

export function messagesFor(system: SystemId, locale: Locale): Catalogue {
  return { ...CATALOGUES[system][locale], Mobile: MOBILE[locale] }
}

/** The system whose catalogue and theme are on screen: the active one, else the one picked at sign-in. */
export function useCurrentSystem(): SystemId {
  return useSession((state) => state.active ?? state.selected)
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useLocale((state) => state.locale)
  const system = useCurrentSystem()
  const messages = useMemo(() => messagesFor(system, locale), [system, locale])
  return (
    <IntlProvider
      locale={locale}
      messages={messages}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
      onError={() => {
        // A missing key falls back to its own name (below) instead of crashing a screen.
      }}
      getMessageFallback={({ key }) => key.split('.').pop() ?? key}
    >
      {children}
    </IntlProvider>
  )
}

export type Translate = {
  (key: string, values?: Record<string, string | number | Date>): string
  has: (key: string) => boolean
  rich: (key: string, values?: Record<string, unknown>) => ReactNode
}

/** `useTranslations` with a loose key type: catalogues differ per system, so keys are plain strings. */
export function useT(namespace?: string): Translate {
  return useTranslations(namespace as never) as unknown as Translate
}

/** Localised, user-facing text for anything thrown by the API client. */
export function useErrorMessage(): (error: unknown) => string {
  const t = useT('Mobile.errors')
  return (error) => {
    if (error instanceof ApiError) {
      return t.has(error.code) ? t(error.code, error.values) : t('serverError')
    }
    return t('serverError')
  }
}
