import { z } from 'zod'
import type { Translator } from './i18n'

export function getConsumerSchema(t: Translator) {
  return z.object({
    requestId: z.string().uuid(),
    firstName: z.string().trim().min(1, t('required')).max(100, t('maxChars', { count: 100 })),
    lastName: z.string().trim().min(1, t('required')).max(100, t('maxChars', { count: 100 })),
    email: z.string().trim().toLowerCase().email(t('invalidEmail')).max(320, t('maxChars', { count: 320 })),
    notes: z.string().trim().max(500, t('maxChars', { count: 500 })).optional(),
  })
}

export type ConsumerFormValues = z.infer<ReturnType<typeof getConsumerSchema>>
