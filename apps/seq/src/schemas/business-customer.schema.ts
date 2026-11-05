import { z } from 'zod'
import { validateCnpj } from '@/lib/masks'
import { addressSchema, addressDefaultValues } from './address.schema'
import type { Translator } from './i18n'

export const BUSINESS_SEGMENTS = ['PLAQUE_PRINTER', 'MARBLE_SHOP', 'FUNERAL_SUPPLIES', 'URN_MANUFACTURER', 'OTHER'] as const
export function getBusinessCustomerSchema(t: Translator) {
  return z.object({
    name: z.string().trim().min(2, t('minChars', { count: 2 })).max(200),
    tradeName: z.string().trim().max(200),
    taxId: z.string().transform(value => value.replace(/[.\/\-\s]/g, '')).pipe(z.string().regex(/^\d{14}$/, t('invalidCnpj')).refine(validateCnpj, t('invalidCnpj'))),
    segment: z.enum(BUSINESS_SEGMENTS),
    contactName: z.string().trim().max(200),
    email: z.union([z.literal(''), z.string().trim().toLowerCase().email(t('invalidEmail'))]),
    phoneCountryCode: z.string().regex(/^\d{1,4}$/, t('countryCodeRequired')),
    phone: z.string().trim().max(30),
    notes: z.string().trim().max(5000),
    isActive: z.boolean(),
    address: addressSchema.optional(),
  })
}
export type BusinessCustomerFormValues = z.infer<ReturnType<typeof getBusinessCustomerSchema>>
export const businessCustomerDefaults: BusinessCustomerFormValues = {
  name: '', tradeName: '', taxId: '', segment: 'PLAQUE_PRINTER', contactName: '', email: '',
  phoneCountryCode: '55', phone: '', notes: '', isActive: true, address: addressDefaultValues,
}
export const businessSaleSchema = z.object({
  requestId: z.string().uuid(), quantity: z.number().int().min(1).max(100), genCode: z.string().trim().toUpperCase().max(100),
  unitValue: z.number().finite().min(0).max(1_000_000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001).optional(),
}).refine(data => !data.genCode || data.quantity === 1)
export type BusinessSaleInput = z.infer<typeof businessSaleSchema>

export const businessRecipientSchema = z.object({
  genCode: z.string().trim().toUpperCase().min(1).max(100),
  firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
})
export type BusinessRecipientInput = z.infer<typeof businessRecipientSchema>
