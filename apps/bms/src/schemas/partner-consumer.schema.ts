import { z } from 'zod'
import type { Translator } from './i18n'

export function getPartnerConsumerPremiumSchema(t: Translator) {
  return z.object({ appUserId: z.string().trim().min(1, t('required')).max(128), requestId: z.string().uuid(t('required')) })
}
export function getPartnerConsumerRevokeSchema(t: Translator) {
  return z.object({ appUserId: z.string().trim().min(1, t('required')).max(128), grantId: z.string().trim().min(1, t('required')).max(128) })
}
