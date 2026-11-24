import type { Address, AddressInput } from '@/api/seq'

/** RFC-4122 v4 id for idempotent requests. Uses the platform generator when there is one. */
export function uuid(): string {
  const native = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (native?.randomUUID) {
    try {
      return native.randomUUID()
    } catch {
      // fall through to the manual generator
    }
  }
  const hex = (count: number) => {
    let text = ''
    for (let index = 0; index < count; index += 1) text += Math.floor(Math.random() * 16).toString(16)
    return text
  }
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16)
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const digitsOnly = (value: string) => value.replace(/\D/g, '')

export function maskCnpj(value: string): string {
  const d = digitsOnly(value).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function maskCpf(value: string): string {
  const d = digitsOnly(value).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

export function validateCpf(value: string): boolean {
  const d = digitsOnly(value)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const check = (length: number) => {
    let sum = 0
    for (let index = 0; index < length; index += 1) sum += Number(d[index]) * (length + 1 - index)
    const rest = (sum * 10) % 11
    return (rest === 10 ? 0 : rest) === Number(d[length])
  }
  return check(9) && check(10)
}

export function validateCnpj(value: string): boolean {
  const d = digitsOnly(value)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const check = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let index = 0; index < length; index += 1) sum += Number(d[index]) * weights[index]
    const rest = sum % 11
    return (rest < 2 ? 0 : 11 - rest) === Number(d[length])
  }
  return check(12) && check(13)
}

/**
 * Optional money input. '' → undefined (not informed); a valid amount with at
 * most two decimals → number; anything else → null (invalid).
 */
export function parseAmount(text: string, max = 1_000_000): number | undefined | null {
  const trimmed = text.trim().replace(',', '.')
  if (!trimmed) return undefined
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isFinite(value) && value >= 0 && value <= max ? value : null
}

/** ISO timestamp → `YYYY-MM-DD` for date inputs. */
export const dateOnly = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : '')

export const fullName = (person: { firstName: string; lastName: string } | null | undefined): string =>
  person ? `${person.firstName} ${person.lastName}`.trim() : ''

/** Display form of a GenCode: groups of four separated by dashes. */
export const formatGenCode = (code: string): string => code.replace(/-/g, '').replace(/(.{4})(?=.)/g, '$1-')

export type FormValues = Record<string, string | boolean>

const ADDRESS_KEYS = ['zip', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'country'] as const

export function addressValues(address: Partial<Record<keyof Address, string | null>> | null | undefined): FormValues {
  const values: FormValues = {}
  for (const key of ADDRESS_KEYS) values[`address.${key}`] = address?.[key] ?? (key === 'country' ? 'BR' : '')
  return values
}

export function addressInput(values: FormValues): AddressInput {
  const address: AddressInput = {}
  for (const key of ADDRESS_KEYS) address[key] = String(values[`address.${key}`] ?? '').trim()
  return address
}

export const text = (values: FormValues, key: string): string => String(values[key] ?? '').trim()
export const nullable = (values: FormValues, key: string): string | null => text(values, key) || null
