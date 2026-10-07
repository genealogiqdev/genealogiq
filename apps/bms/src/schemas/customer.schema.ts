import { z } from 'zod'
import { addressSchema, addressDefaultValues } from './address.schema'
import { validateCpf, validateCnpj } from '@/lib/masks'
import type { Translator } from './i18n'

export const ENTITY_TYPES = ['INDIVIDUAL', 'COMPANY'] as const
export const PARTNER_SEGMENTS = [
  'FUNERAL_HOME',
  'MARBLE_SHOP',
  'CEMETERY',
  'URN_MANUFACTURER',
  'PLAQUE_PRINTER',
] as const

function makeTaxIdRefine(t: Translator) {
  return (data: { entityType: string; taxId: string }, ctx: z.RefinementCtx) => {
    if (data.entityType === 'INDIVIDUAL') {
      if (!validateCpf(data.taxId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('invalidCpf'), path: ['taxId'] })
      }
    } else {
      if (!validateCnpj(data.taxId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('invalidCnpj'), path: ['taxId'] })
      }
    }
  }
}

function makeCustomerBaseSchema(t: Translator) {
  return z.object({
    entityType:            z.enum(ENTITY_TYPES),
    businessSegment:       z.enum(PARTNER_SEGMENTS),
    name:                  z.string().min(2, t('minChars', { count: 2 })),
    tradeName:             z.string().min(2, t('minChars', { count: 2 })),
    taxId:                 z.string().min(1, t('required')),
    stateRegistration:     z.string().nullish(),
    municipalRegistration: z.string().nullish(),
    birthDate:             z.string().nullish(),
    email:                 z.string().email(t('invalidEmail')),
    phoneCountryCode:      z.string().min(1, t('countryCodeRequired')),
    phone:                 z.string().min(1, t('required')),
    notes:                 z.string().nullish(),
    isActive:              z.boolean(),
    moduleRecordsSuppliers:    z.boolean().default(false),
    moduleCategoriesSuppliers: z.boolean().default(false),
    address:               addressSchema.optional(),
  })
}

export function getCustomerSchema(t: Translator) {
  return makeCustomerBaseSchema(t).superRefine(makeTaxIdRefine(t))
}

export function getOwnerSchema(t: Translator) {
  return z.object({
    firstName: z.string().min(2, t('minChars', { count: 2 })),
    lastName:  z.string().min(2, t('minChars', { count: 2 })),
    email:     z.string().email(t('invalidEmail')),
  })
}

export function getCustomerCreateSchema(t: Translator) {
  return makeCustomerBaseSchema(t).extend({
    owner: getOwnerSchema(t),
    initialGenCodes: z.number().int(t('invalidInitialGenCodes')).min(0, t('invalidInitialGenCodes')).max(10_000, t('invalidInitialGenCodes')).default(0),
  }).superRefine(makeTaxIdRefine(t))
}

export type CustomerFormValues       = z.infer<ReturnType<typeof getCustomerSchema>>
export type OwnerFormValues          = z.infer<ReturnType<typeof getOwnerSchema>>
export type CustomerCreateFormValues = z.infer<ReturnType<typeof getCustomerCreateSchema>>

// Pre-default input shapes — what react-hook-form fields actually hold (the
// module booleans are optional before .default() runs). useForm is typed with
// these so zodResolver lines up without an `as any`; handleSubmit still yields
// the output (…FormValues) type via useForm's 3rd generic.
export type CustomerFormInput        = z.input<ReturnType<typeof getCustomerSchema>>
export type CustomerCreateFormInput  = z.input<ReturnType<typeof getCustomerCreateSchema>>

export const ownerDefaultValues: OwnerFormValues = {
  firstName: '',
  lastName:  '',
  email:     '',
}

export const customerDefaultValues: CustomerFormValues = {
  entityType:            'COMPANY',
  businessSegment:       'FUNERAL_HOME',
  name:                  '',
  tradeName:             '',
  taxId:                 '',
  stateRegistration:     '',
  municipalRegistration: '',
  birthDate:             '',
  email:                 '',
  phoneCountryCode:      '55',
  phone:                 '',
  notes:                 '',
  isActive:              true,
  moduleRecordsSuppliers:    false,
  moduleCategoriesSuppliers: false,
  address:               addressDefaultValues,
}

export const customerCreateDefaultValues: CustomerCreateFormValues = {
  ...customerDefaultValues,
  owner: ownerDefaultValues,
  initialGenCodes: 0,
}
