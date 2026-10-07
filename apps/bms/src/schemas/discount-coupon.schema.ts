import { z } from 'zod'
import type { Translator } from './i18n'

/**
 * A coupon is one of two shapes, and discountType says which.
 *
 * A percentage has no currency — 10% off is 10% off in every currency — so it
 * stays a single number. A fixed amount is money, and money needs a slot per
 * currency like every other price in this catalogue. Zero means "not offered in
 * this currency"; the column holds null.
 */
function makeDiscountCouponRefine(t: Translator) {
  return (
    data: {
      duration: string
      durationInMonths?: number | null
      discountType: string
      percentOff: number
      amountOffUsd: number
      amountOffBrl: number
      amountOffMxn: number
      redemptionMode?: 'stripe' | 'manual'
    },
    ctx: z.RefinementCtx,
  ) => {
    if (data.redemptionMode === 'manual' && (data.discountType !== 'percent' || data.percentOff !== 100 || data.duration !== 'once')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['percentOff'], message: t('manualCouponTerms') })
    }
    if (data.duration === 'repeating' && !data.durationInMonths) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['durationInMonths'], message: t('durationInMonthsRequired') })
    }

    if (data.discountType === 'percent') {
      if (data.percentOff <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['percentOff'], message: t('greaterThanZero') })
      }
      if (data.percentOff > 100) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['percentOff'], message: t('percentMax') })
      }
      return
    }

    // A fixed-amount coupon with no amount anywhere discounts nothing.
    if (data.amountOffUsd <= 0 && data.amountOffBrl <= 0 && data.amountOffMxn <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amountOffUsd'], message: t('atLeastOneAmount') })
    }
  }
}

export function getDiscountCouponSchema(t: Translator) {
  return z.object({
    code: z.string().trim().toUpperCase()
      .min(3, t('minChars', { count: 3 }))
      .max(32, t('maxChars', { count: 32 }))
      .regex(/^[A-Z0-9_-]+$/, t('couponCodeFormat')),
    description:      z.string().max(255).optional().nullable(),
    discountType:     z.enum(['percent', 'amount']),
    redemptionMode:   z.enum(['stripe', 'manual']).optional(),
    percentOff:       z.number().min(0, t('mustBeZeroOrGreater')),
    amountOffUsd:     z.number().min(0, t('mustBeZeroOrGreater')),
    amountOffBrl:     z.number().min(0, t('mustBeZeroOrGreater')),
    amountOffMxn:     z.number().min(0, t('mustBeZeroOrGreater')),
    duration:         z.enum(['once', 'forever', 'repeating']),
    durationInMonths: z.number().int().positive().optional().nullable(),
    maxRedemptions:   z.number().int().positive().optional().nullable(),
    redeemBy:         z.date().optional().nullable(),
    appliesTo:        z.array(z.string()),
  }).superRefine(makeDiscountCouponRefine(t))
}

export type DiscountCouponFormValues = z.infer<ReturnType<typeof getDiscountCouponSchema>>

export const discountCouponDefaultValues: DiscountCouponFormValues = {
  code:             '',
  description:      '',
  discountType:     'percent',
  redemptionMode:   'stripe',
  percentOff:       10,
  amountOffUsd:     0,
  amountOffBrl:     0,
  amountOffMxn:     0,
  duration:         'once',
  durationInMonths: null,
  maxRedemptions:   null,
  redeemBy:         null,
  appliesTo:        [],
}
