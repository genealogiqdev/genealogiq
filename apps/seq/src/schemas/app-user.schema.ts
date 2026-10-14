import { z } from 'zod'
import type { Translator } from './i18n'
import { addressSchema, addressDefaultValues } from './address.schema'

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const
export type Gender = typeof GENDERS[number]
export const GENDER_OPTIONS = ['FEMALE', 'MALE'] as const

export function getAppUserSchema(t: Translator) {
  return z.object({
    firstName:       z.string().trim().min(1, t('required')).max(100, t('maxChars', { count: 100 })),
    lastName:        z.string().trim().min(1, t('required')).max(100, t('maxChars', { count: 100 })),
    gender:          z.enum(GENDERS).nullish(),
    birthDate:       z.string().min(1, t('required')),
    birthCity:       z.string().max(200).nullish(),
    birthState:      z.string().max(200).nullish(),
    birthCountry:    z.string().min(1, t('required')).max(200),
    email:           z.string().trim().toLowerCase().email(t('invalidEmail')).max(320),
    phoneCountryCode: z.string().min(1, t('countryCodeRequired')),
    phone:           z.string().min(1, t('required')),
    categoryId:      z.string().nullish(),
    notes:           z.string().nullish(),
    isActive:        z.boolean(),
    fb:              z.string().max(500).nullish(),
    instagram:       z.string().max(500).nullish(),
    linkedin:        z.string().max(500).nullish(),
    tiktok:          z.string().max(500).nullish(),
    x:               z.string().max(500).nullish(),
    youtube:         z.string().max(500).nullish(),
    otherSocial:           z.string().max(500).nullish(),
    website:         z.string().max(500).nullish(),
    address:         addressSchema.optional(),
  })
}

export type AppUserFormValues = z.infer<ReturnType<typeof getAppUserSchema>>

export const appUserDefaultValues: AppUserFormValues = {
  firstName:        '',
  lastName:         '',
  gender:           null,
  birthDate:        '',
  birthCity:        '',
  birthState:       '',
  birthCountry:     '',
  email:            '',
  phoneCountryCode: '55',
  phone:            '',
  categoryId:       '',
  notes:            '',
  isActive:         true,
  fb:               '',
  instagram:        '',
  linkedin:         '',
  tiktok:           '',
  x:                '',
  youtube:          '',
  otherSocial:            '',
  website:          '',
  address:          addressDefaultValues,
}
