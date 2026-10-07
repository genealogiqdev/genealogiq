import { z } from 'zod'
import type { Translator } from './i18n'

export function getManualCouponSchema(t: Translator) {
  return z.object({
    requestId: z.string().uuid(),
    couponId: z.string().min(1, t('required')).max(128),
    kind: z.enum(['partner', 'package', 'consumer']),
    productId: z.string().min(1, t('required')).max(128),
    tenantId: z.string().max(128).optional(),
    consumerEmail: z.string().trim().toLowerCase().max(320).optional(),
    quantity: z.number().int(t('wholeNumber')).min(1, t('greaterThanZero')).max(10_000),
    cadence: z.enum(['annual', 'monthly']),
    source: z.enum(['external_payment', 'legacy_stock']),
    reference: z.string().trim().min(3, t('minChars', { count: 3 })).max(160),
    externalAmount: z.number().finite().positive(t('greaterThanZero')).max(9_999_999_999.99).multipleOf(0.01).nullable().optional(),
    confirmed: z.boolean().refine((value) => value, t('manualCouponConfirmation')),
  }).superRefine((data, ctx) => {
    if (data.kind === 'consumer' && !z.string().email().safeParse(data.consumerEmail).success) {
      ctx.addIssue({ code: 'custom', path: ['consumerEmail'], message: t('invalidEmail') })
    }
    if (data.kind !== 'consumer' && !data.tenantId) {
      ctx.addIssue({ code: 'custom', path: ['tenantId'], message: t('required') })
    }
    if (data.source === 'external_payment' && data.externalAmount == null) {
      ctx.addIssue({ code: 'custom', path: ['externalAmount'], message: t('required') })
    }
  })
}

export type ManualCouponFormValues = z.infer<ReturnType<typeof getManualCouponSchema>>
