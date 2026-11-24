import { useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import { bmsApi, type BmsRole, type PartnerSegment } from '@/api/bms'
import type { ActionResponse } from '@/api/client'
import { useT } from '@/i18n'
import { useLocale } from '@/i18n/locale'
import { useInvalidate, useView } from '@/lib/query'
import { useNotify } from '@/ui'

/** Live role flags. Every mutation control is gated by these; the server still decides. */
export function useMe() {
  return useView('bms', ['me'], () => bmsApi.me())
}

/** The app language: pricing views derive their currency from it, so it belongs in their query keys. */
export function useLanguageKey(): string {
  return useLocale((state) => state.locale)
}

/** SUPER_ADMIN / OWNER: the roles the web lets delete partners, staff and consumer plans. */
export const canDelete = (role: BmsRole | undefined): boolean => role === 'SUPER_ADMIN' || role === 'OWNER'

export type RouteParams = Record<string, string | number | undefined>

export function useGo() {
  const router = useRouter()
  return useMemo(() => {
    const href = (pathname: string, params?: RouteParams) => (params ? { pathname, params } : pathname) as unknown as Href
    return {
      push: (pathname: string, params?: RouteParams) => router.push(href(pathname, params)),
      replace: (pathname: string, params?: RouteParams) => router.replace(href(pathname, params)),
      back: () => (router.canGoBack() ? router.back() : router.replace('/bms/dashboard' as unknown as Href)),
    }
  }, [router])
}

/** Pull-to-refresh state for a query. */
export function useRefresh(query: { refetch: () => Promise<unknown> }) {
  const [refreshing, setRefreshing] = useState(false)
  return {
    refreshing,
    onRefresh: () => {
      setRefreshing(true)
      void query.refetch().finally(() => setRefreshing(false))
    },
  }
}

/** RFC-4122 v4 identifier for idempotent requests. */
export function uuid(): string {
  const native = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.()
  if (native) return native
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

export type Errors = Record<string, string | undefined>

function flatten(fieldErrors: Record<string, string[] | undefined>): Errors {
  const out: Errors = {}
  for (const [key, list] of Object.entries(fieldErrors)) if (list?.[0]) out[key] = list[0]
  return out
}

/**
 * Form submission state: client validation errors, the server's message and
 * its `fieldErrors`, shown next to the fields they belong to.
 */
export function useFormSubmit() {
  const notify = useNotify()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Errors>({})

  /** Stores the validation result; true when something is invalid. */
  function invalid(next: Errors): boolean {
    const clean: Errors = {}
    for (const [key, value] of Object.entries(next)) if (value) clean[key] = value
    setErrors(clean)
    return Object.keys(clean).length > 0
  }

  async function submit<T>(
    call: () => Promise<ActionResponse<T>>,
    onSuccess: (response: ActionResponse<T> & { ok: true }) => void | Promise<void>,
  ): Promise<void> {
    setPending(true)
    setError(null)
    try {
      const response = await call()
      if (!response.ok) {
        setError(response.message)
        if (response.fieldErrors) setErrors(flatten(response.fieldErrors))
        return
      }
      await onSuccess(response)
    } catch (failure) {
      notify.error(failure)
    } finally {
      setPending(false)
    }
  }

  return { pending, error, errors, setError, setErrors, invalid, submit }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The web Zod rules, with the web's own messages (`Errors` namespace). */
export function useRules() {
  const t = useT('Errors')
  return useMemo(
    () => ({
      t,
      required: (value: string | null | undefined) => (value && value.trim() ? undefined : t('required')),
      min: (value: string | null | undefined, count: number) => ((value ?? '').length >= count ? undefined : t('minChars', { count })),
      max: (value: string | null | undefined, count: number) => ((value ?? '').length <= count ? undefined : t('maxChars', { count })),
      email: (value: string | null | undefined) => (EMAIL.test((value ?? '').trim()) ? undefined : t('invalidEmail')),
      money: (value: number) => (Number.isFinite(value) && value >= 0 ? undefined : t('mustBeZeroOrGreater')),
      price: (value: number) => (Number.isFinite(value) && value >= 0 ? undefined : t('priceMin')),
      whole: (value: number) => (!Number.isInteger(value) ? t('wholeNumber') : value < 0 ? t('mustBeZeroOrGreater') : undefined),
      positiveWhole: (value: number) => (!Number.isInteger(value) ? t('wholeNumber') : value <= 0 ? t('greaterThanZero') : undefined),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )
}

export function parseNumber(text: string): number {
  const trimmed = text.trim().replace(',', '.')
  return trimmed === '' ? Number.NaN : Number(trimmed)
}

const digitsOf = (value: string) => value.replace(/\D/g, '')

export function validCpf(value: string): boolean {
  const digits = digitsOf(value)
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false
  const check = (length: number) => {
    let sum = 0
    for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index)
    const remainder = (sum * 10) % 11
    return remainder >= 10 ? 0 : remainder
  }
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10])
}

export function validCnpj(value: string): boolean {
  const digits = digitsOf(value)
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false
  const digit = (weights: number[]) => {
    const remainder = weights.reduce((sum, weight, index) => sum + Number(digits[index]) * weight, 0) % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  return (
    digit([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[12]) &&
    digit([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[13])
  )
}

export const SEGMENT_KEY: Record<PartnerSegment, string> = {
  FUNERAL_HOME: 'funeralHome',
  MARBLE_SHOP: 'marbleShop',
  CEMETERY: 'cemetery',
  URN_MANUFACTURER: 'urnManufacturer',
  PLAQUE_PRINTER: 'plaquePrinter',
}

export const CURRENCIES = ['USD', 'BRL', 'MXN'] as const
export type CurrencyCode = (typeof CURRENCIES)[number]

export const percent = (part: number, whole: number): string => (whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`)

/** Invalidate cached BMS views by key prefix after a mutation. */
export function useBmsInvalidate() {
  const invalidate = useInvalidate('bms')
  return async (...keys: readonly unknown[][]): Promise<void> => {
    await invalidate(...keys)
  }
}
