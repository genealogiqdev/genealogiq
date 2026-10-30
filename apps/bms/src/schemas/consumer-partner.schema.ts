import { z } from 'zod'
import type { Translator } from './i18n'

export function getConsumerPartnerSchema(t: Translator) {
  return z.object({
    appUserId: z.string().trim().min(1, t('required')).max(128),
    tenantId: z.string().trim().min(1, t('required')).max(128),
  })
}
