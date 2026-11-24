// The country catalogue is the shared, dependency-free one the web apps use
// (ISO codes are what the API stores), so the lists never drift.
import { COUNTRIES, COUNTRY_BY_ISO, COUNTRY_BY_NAME, STATES_BY_ISO } from '../../../../../packages/core/src/countries'
import type { Option } from '@/ui'

const PRIORITY = ['BR', 'MX', 'US']

function displayNames(locale: string): { of: (code: string) => string | undefined } | null {
  try {
    const DisplayNames = (Intl as unknown as { DisplayNames?: new (locales: string[], options: { type: 'region' }) => { of: (code: string) => string | undefined } }).DisplayNames
    return DisplayNames ? new DisplayNames([locale], { type: 'region' }) : null
  } catch {
    return null
  }
}

/** Localised name for a stored country value (ISO code or a legacy English name). */
export function countryName(code: string | null | undefined, locale: string): string {
  if (!code) return ''
  const trimmed = code.trim()
  const iso = COUNTRY_BY_ISO[trimmed.toUpperCase()]?.iso ?? COUNTRY_BY_NAME[trimmed]?.iso
  if (!iso) return trimmed
  try {
    return displayNames(locale)?.of(iso) ?? COUNTRY_BY_ISO[iso].name
  } catch {
    return COUNTRY_BY_ISO[iso].name
  }
}

/** Select options: Brazil, Mexico and the United States first, then alphabetical. */
export function countryOptions(locale: string): Option[] {
  const names = displayNames(locale)
  const all = COUNTRIES.map((country) => {
    let label = country.name
    try {
      label = names?.of(country.iso) ?? country.name
    } catch {
      label = country.name
    }
    return { value: country.iso, label }
  })
  const priority = PRIORITY.map((iso) => all.find((option) => option.value === iso)).filter((option): option is Option => !!option)
  const rest = all.filter((option) => !PRIORITY.includes(option.value)).sort((a, b) => a.label.localeCompare(b.label))
  return [...priority, ...rest]
}

/** States of a country that has a fixed list (BR, MX, US); empty for free-text countries. */
export function stateOptions(country: string | null | undefined): Option[] {
  if (!country) return []
  return (STATES_BY_ISO[country.toUpperCase()] ?? []).map((state) => ({ value: state.code, label: state.name }))
}
