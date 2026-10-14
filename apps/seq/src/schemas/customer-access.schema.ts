import { z } from 'zod'
import type { Translator } from './i18n'

export function getCustomerOnboardingSchema(t: Translator) {
  return z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('registration') }),
    z.object({ mode: z.literal('gencode-premium'), requestId: z.string().uuid(t('required')),
      genCode: z.string().trim().toUpperCase().max(64).optional() }),
  ])
}
export type CustomerOnboarding = z.infer<ReturnType<typeof getCustomerOnboardingSchema>>

export function getCustomerPremiumSchema(t: Translator) {
  return z.object({ appUserId: z.string().trim().min(1, t('required')).max(128), requestId: z.string().uuid(t('required')) })
}
export function getCustomerRevokeSchema(t: Translator) {
  return z.object({ appUserId: z.string().trim().min(1, t('required')).max(128), grantId: z.string().trim().min(1, t('required')).max(128) })
}
export function getCustomerGenCodeSaleSchema(t: Translator) {
  return getCustomerPremiumSchema(t).extend({ genCode: z.string().trim().toUpperCase().min(1, t('required')).max(64) })
}
