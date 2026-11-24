import { currentLocale } from '@/i18n/locale'

type DateInput = string | number | Date | null | undefined

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** A calendar date. Date-only values (birth, death) are shown in UTC so they never shift a day. */
export function formatDate(value: DateInput, options?: { utc?: boolean; month?: 'short' | 'long' | '2-digit' }): string {
  const date = toDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(currentLocale(), {
    day: '2-digit',
    month: options?.month ?? 'short',
    year: 'numeric',
    ...(options?.utc ? { timeZone: 'UTC' } : {}),
  }).format(date)
}

export function formatDateTime(value: DateInput): string {
  const date = toDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(currentLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** "3 hours ago" style text for activity feeds. */
export function formatRelative(value: DateInput): string {
  const date = toDate(value)
  if (!date) return ''
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const formatter = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto' })
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return formatter.format(seconds, 'second')
}

/** Money from a decimal string/number in major units (the API sends Prisma Decimals as strings). */
export function formatMoney(amount: string | number | null | undefined, currency = 'BRL'): string {
  if (amount === null || amount === undefined || amount === '') return ''
  const value = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(value)) return ''
  return new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: currency.toUpperCase() }).format(value)
}

/** Money from an integer amount in minor units (cents). */
export function formatCents(cents: number | null | undefined, currency = 'BRL'): string {
  if (cents === null || cents === undefined) return ''
  return formatMoney(cents / 100, currency)
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? new Intl.NumberFormat(currentLocale()).format(number) : ''
}

/** `YYYY-MM-DD` for date inputs sent to the API. */
export function toDateInput(value: DateInput): string {
  const date = toDate(value)
  return date ? date.toISOString().slice(0, 10) : ''
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}
