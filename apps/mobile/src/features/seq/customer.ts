import type { CategoryOption, CustomerDetail, CustomerInput, DeceasedInput, Gender, MemorialView } from '@/api/seq'
import { useT } from '@/i18n'
import type { Option } from '@/ui'
import { useAddressSpecs, type Spec } from './forms'
import { addressInput, addressValues, dateOnly, nullable, text, type FormValues } from './util'

const SOCIAL_KEYS = ['fb', 'instagram', 'linkedin', 'tiktok', 'x', 'youtube', 'otherSocial', 'website'] as const

function socialLabel(key: (typeof SOCIAL_KEYS)[number], other: string): string {
  if (key === 'fb') return 'Facebook'
  if (key === 'x') return 'X'
  if (key === 'otherSocial') return other
  if (key === 'tiktok') return 'TikTok'
  if (key === 'linkedin') return 'LinkedIn'
  if (key === 'youtube') return 'YouTube'
  return key.charAt(0).toUpperCase() + key.slice(1)
}

function useGenderOptions(): Option[] {
  const t = useT('Customers.gender')
  return [
    { value: 'FEMALE', label: t('female') },
    { value: 'MALE', label: t('male') },
  ]
}

const gender = (values: FormValues): Gender | null => {
  const value = text(values, 'gender')
  return value === 'MALE' || value === 'FEMALE' || value === 'OTHER' ? value : null
}

/* -------------------------------- Customer -------------------------------- */

export const CUSTOMER_DEFAULTS: FormValues = {
  firstName: '', lastName: '', gender: '', birthDate: '', birthCity: '', birthState: '', birthCountry: '',
  email: '', phoneCountryCode: '55', phone: '', categoryId: '', notes: '', isActive: true,
  fb: '', instagram: '', linkedin: '', tiktok: '', x: '', youtube: '', otherSocial: '', website: '',
  ...addressValues(null),
}

export function customerValues(customer: CustomerDetail): FormValues {
  const values: FormValues = {
    firstName: customer.firstName,
    lastName: customer.lastName,
    gender: customer.gender ?? '',
    birthDate: dateOnly(customer.birthDate),
    birthCity: customer.birthCity ?? '',
    birthState: customer.birthState ?? '',
    birthCountry: customer.birthCountry ?? '',
    email: customer.email ?? '',
    phoneCountryCode: customer.phoneCountryCode,
    phone: customer.phone ?? '',
    categoryId: customer.categoryId ?? '',
    notes: customer.notes ?? '',
    isActive: customer.isActive,
    ...addressValues(customer.address),
  }
  for (const key of SOCIAL_KEYS) values[key] = customer[key] ?? ''
  return values
}

export function customerInput(values: FormValues): CustomerInput {
  return {
    firstName: text(values, 'firstName'),
    lastName: text(values, 'lastName'),
    gender: gender(values),
    birthDate: text(values, 'birthDate'),
    birthCity: nullable(values, 'birthCity'),
    birthState: nullable(values, 'birthState'),
    birthCountry: text(values, 'birthCountry'),
    email: text(values, 'email').toLowerCase(),
    phoneCountryCode: text(values, 'phoneCountryCode'),
    phone: text(values, 'phone'),
    categoryId: nullable(values, 'categoryId'),
    notes: nullable(values, 'notes'),
    isActive: values.isActive === true,
    fb: nullable(values, 'fb'),
    instagram: nullable(values, 'instagram'),
    linkedin: nullable(values, 'linkedin'),
    tiktok: nullable(values, 'tiktok'),
    x: nullable(values, 'x'),
    youtube: nullable(values, 'youtube'),
    otherSocial: nullable(values, 'otherSocial'),
    website: nullable(values, 'website'),
    address: addressInput(values),
  }
}

/** Field groups of the customer form (web: getAppUserSchema). */
export function useCustomerSpecs(categories: readonly CategoryOption[], currentCategoryId?: string | null) {
  const t = useT('Customers')
  const te = useT('Errors')
  const tc = useT('Mobile.common')
  const genders = useGenderOptions()
  const address = useAddressSpecs()
  const personal: Spec[] = [
    { key: 'firstName', label: t('fields.firstName'), required: true, max: 100 },
    { key: 'lastName', label: t('fields.lastName'), required: true, max: 100 },
    { key: 'gender', label: t('fields.gender'), kind: 'select', options: genders, placeholder: t('placeholders.select'), clearLabel: tc('none') },
    { key: 'birthDate', label: t('fields.birthDate'), kind: 'date', required: true },
    { key: 'birthCountry', label: t('fields.birthCountry'), kind: 'country', required: true, placeholder: t('placeholders.select') },
    { key: 'birthState', label: t('fields.birthState'), max: 200 },
    { key: 'birthCity', label: t('fields.birthCity'), max: 200 },
  ]
  const contact: Spec[] = [
    { key: 'email', label: t('fields.email'), kind: 'email', required: true, max: 320 },
    { key: 'phoneCountryCode', label: t('fields.countryCode'), kind: 'number', required: true, requiredMessage: te('countryCodeRequired'), max: 4 },
    { key: 'phone', label: t('fields.phone'), kind: 'phone', required: true },
    {
      key: 'categoryId',
      label: t('fields.category'),
      kind: 'select',
      placeholder: t('placeholders.category'),
      clearLabel: tc('none'),
      options: categories.filter((category) => category.isActive || category.id === currentCategoryId).map((category) => ({ value: category.id, label: category.name })),
    },
    { key: 'notes', label: t('fields.notes'), kind: 'multiline' },
  ]
  const social: Spec[] = SOCIAL_KEYS.map((key) => ({ key, label: socialLabel(key, t('social.other')), max: 500 }))
  return { personal, contact, address, social }
}

/* -------------------------------- Memorial -------------------------------- */

export function memorialValues(memorial: MemorialView['memorial']): FormValues {
  const values: FormValues = {
    firstName: memorial.firstName,
    lastName: memorial.lastName,
    gender: memorial.gender ?? '',
    birthDate: dateOnly(memorial.birthDate),
    birthCity: memorial.birthCity ?? '',
    birthState: memorial.birthState ?? '',
    birthCountry: memorial.birthCountry ?? '',
    deathDate: dateOnly(memorial.deathDate),
    deathCause: memorial.deathCause ?? '',
    deathCity: memorial.deathCity ?? '',
    deathState: memorial.deathState ?? '',
    deathCountry: memorial.deathCountry ?? '',
    burialDate: dateOnly(memorial.burialDate),
    burialLatitude: memorial.burialLatitude === null ? '' : String(memorial.burialLatitude),
    burialLongitude: memorial.burialLongitude === null ? '' : String(memorial.burialLongitude),
    burialSite: memorial.burialSite ?? '',
    burialZip: memorial.burialZip ?? '',
    burialStreet: memorial.burialStreet ?? '',
    burialNumber: memorial.burialNumber ?? '',
    burialComplement: memorial.burialComplement ?? '',
    burialNeighborhood: memorial.burialNeighborhood ?? '',
    burialCity: memorial.burialCity ?? '',
    burialState: memorial.burialState ?? '',
    burialCountry: memorial.burialCountry ?? '',
    notes: memorial.notes ?? '',
  }
  for (const key of SOCIAL_KEYS) values[key] = memorial[key] ?? ''
  return values
}

/** '' → null; a finite number within range → number; otherwise undefined (invalid). */
export function coordinate(raw: string, limit: number): number | null | undefined {
  const trimmed = raw.trim().replace(',', '.')
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : undefined
}

export function memorialInput(values: FormValues): DeceasedInput {
  return {
    firstName: text(values, 'firstName'),
    lastName: text(values, 'lastName'),
    gender: gender(values),
    birthDate: text(values, 'birthDate'),
    birthCity: nullable(values, 'birthCity'),
    birthState: text(values, 'birthState'),
    birthCountry: text(values, 'birthCountry'),
    deathDate: text(values, 'deathDate'),
    deathCause: nullable(values, 'deathCause'),
    deathCity: nullable(values, 'deathCity'),
    deathState: nullable(values, 'deathState'),
    deathCountry: text(values, 'deathCountry'),
    burialDate: nullable(values, 'burialDate'),
    burialLatitude: coordinate(text(values, 'burialLatitude'), 90) ?? null,
    burialLongitude: coordinate(text(values, 'burialLongitude'), 180) ?? null,
    burialSite: nullable(values, 'burialSite'),
    burialZip: nullable(values, 'burialZip'),
    burialStreet: nullable(values, 'burialStreet'),
    burialNumber: nullable(values, 'burialNumber'),
    burialComplement: nullable(values, 'burialComplement'),
    burialNeighborhood: nullable(values, 'burialNeighborhood'),
    burialCity: nullable(values, 'burialCity'),
    burialState: nullable(values, 'burialState'),
    burialCountry: nullable(values, 'burialCountry'),
    fb: nullable(values, 'fb'),
    instagram: nullable(values, 'instagram'),
    linkedin: nullable(values, 'linkedin'),
    tiktok: nullable(values, 'tiktok'),
    x: nullable(values, 'x'),
    youtube: nullable(values, 'youtube'),
    otherSocial: nullable(values, 'otherSocial'),
    website: nullable(values, 'website'),
    notes: nullable(values, 'notes'),
  }
}

/** Field groups of the memorial form (web: getDeceasedSchema). */
export function useMemorialSpecs() {
  const t = useT('Memorialized')
  const tc = useT('Mobile.common')
  const genders = useGenderOptions()
  const personal: Spec[] = [
    { key: 'firstName', label: t('fields.firstName'), required: true, max: 100 },
    { key: 'lastName', label: t('fields.lastName'), required: true, max: 100 },
    { key: 'gender', label: t('fields.gender'), kind: 'select', options: genders, clearLabel: tc('none') },
    { key: 'birthDate', label: t('fields.birthDate'), kind: 'date', required: true },
    { key: 'birthCountry', label: t('fields.birthCountry'), kind: 'country', required: true },
    { key: 'birthCity', label: t('fields.birthCity'), max: 200 },
    { key: 'birthState', label: t('fields.birthState'), required: true, max: 200 },
  ]
  const death: Spec[] = [
    { key: 'deathDate', label: t('fields.deathDate'), kind: 'date', required: true },
    { key: 'deathCity', label: t('fields.city'), max: 200 },
    { key: 'deathState', label: t('fields.state'), max: 200 },
    { key: 'deathCountry', label: t('fields.countryRequired'), kind: 'country', required: true },
    { key: 'deathCause', label: t('fields.cause'), max: 500 },
  ]
  const burial: Spec[] = [
    { key: 'burialDate', label: t('fields.burialDate'), kind: 'date' },
    { key: 'burialSite', label: t('fields.burialSite'), max: 300 },
    { key: 'burialLatitude', label: t('fields.latitude'), placeholder: '-23.550520' },
    { key: 'burialLongitude', label: t('fields.longitude'), placeholder: '-46.633308' },
    { key: 'burialCountry', label: t('fields.country'), kind: 'country', clearLabel: tc('none') },
    { key: 'burialZip', label: t('fields.zip'), max: 20 },
    { key: 'burialStreet', label: t('fields.street'), max: 200 },
    { key: 'burialNumber', label: t('fields.number'), max: 20 },
    { key: 'burialComplement', label: t('fields.complement'), max: 200 },
    { key: 'burialNeighborhood', label: t('fields.neighborhood'), max: 200 },
    { key: 'burialCity', label: t('fields.city'), max: 200 },
    { key: 'burialState', label: t('fields.state'), max: 200 },
  ]
  const social: Spec[] = [
    ...SOCIAL_KEYS.map((key): Spec => ({ key, label: socialLabel(key, t('fields.otherSocial')), max: 500 })),
    { key: 'notes', label: t('fields.notes'), kind: 'multiline' },
  ]
  return { personal, death, burial, social }
}
