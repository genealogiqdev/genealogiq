'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { Prisma } from '@genealogiq/db'
import { prisma } from '@/lib/prisma'
import { ok, done, fail, type ActionResult } from '@genealogiq/core'
import { verifyAdmin } from '@/lib/dal'
import { getDiscountCouponSchema, type DiscountCouponFormValues } from '@/schemas/discount-coupon.schema'
import { identityTranslator } from '@/schemas/i18n'
// NOTE: stripe is imported lazily inside each action below — see comment in createDiscountCoupon.

const AMOUNT_FIELDS = [
  { currency: 'usd', field: 'amountOffUsd' },
  { currency: 'brl', field: 'amountOffBrl' },
  { currency: 'mxn', field: 'amountOffMxn' },
] as const

/**
 * Stripe wants one base currency plus the rest in currency_options, so the
 * first currency the operator priced becomes the base. Which one it is has no
 * effect on the buyer — Stripe picks by the session's currency either way.
 */
function amountOffPayload(input: DiscountCouponFormValues) {
  const priced = AMOUNT_FIELDS
    .map((f) => ({ currency: f.currency, cents: Math.round(input[f.field] * 100) }))
    .filter((f) => f.cents > 0)

  const [base, ...rest] = priced
  return {
    amount_off: base.cents,
    currency:   base.currency,
    ...(rest.length > 0 && {
      currency_options: Object.fromEntries(rest.map((r) => [r.currency, { amount_off: r.cents }])),
    }),
  }
}

export async function createDiscountCoupon(
  data: DiscountCouponFormValues,
): Promise<ActionResult<{ id: string; code: string }>> {
  const session = await verifyAdmin()
  const t = await getTranslations('Actions')

  const validated = getDiscountCouponSchema(identityTranslator).safeParse(data)
  if (!validated.success) return fail(t('common.invalidData'))
  const input = validated.data
  const manual = input.redemptionMode === 'manual'

  // Pre-flight 1: the code must be free in our DB
  const dbDup = await prisma.discountCoupon.findFirst({
    where:  { code: { equals: input.code, mode: 'insensitive' } },
    select: { id: true },
  })
  if (dbDup) return fail(t('discountCoupon.codeExists'))

  // Resolve both shelf products (annual plans and one-time GenCode packages)
  // to Stripe Product ids. Unknown or unsynced ids must fail closed: silently
  // dropping one would turn a restricted coupon into a global coupon.
  let stripeProductIds: string[] = []
  let partnerPlanIds: string[] = []
  let genCodePackageIds: string[] = []
  let subscriptionIds: string[] = []
  if (input.appliesTo.length > 0) {
    const requested = [...new Set(input.appliesTo)]
    const [prices, packages] = await Promise.all([
      prisma.planPrice.findMany({
        where: {
          OR: [
            { partnerPlan: { id: { in: requested }, isActive: true } },
            { subscription: { id: { in: requested }, isActive: true } },
          ],
          isActive: true,
          effectiveTo: null,
          ...(manual ? {} : { stripeProductId: { not: null } }),
        },
        select: { partnerPlanId: true, subscriptionId: true, stripeProductId: true },
      }),
      prisma.genCodePackage.findMany({
        where: { id: { in: requested }, isActive: true, ...(manual ? {} : { stripeProductId: { not: null } }) },
        select: { id: true, stripeProductId: true },
      }),
    ])
    partnerPlanIds = [...new Set(prices.map((p) => p.partnerPlanId).filter((id): id is string => !!id))]
    genCodePackageIds = packages.map((p) => p.id)
    subscriptionIds = [...new Set(prices.map((p) => p.subscriptionId).filter((id): id is string => !!id))]
    const resolvedIds = new Set([...partnerPlanIds, ...genCodePackageIds, ...subscriptionIds])
    if (requested.some((id) => !resolvedIds.has(id))) {
      return fail(t('discountCoupon.productNotSynced'))
    }
    stripeProductIds = [...new Set(
      [
        ...prices.map((p) => p.stripeProductId),
        ...packages.map((p) => p.stripeProductId),
      ].filter((id): id is string => !!id),
    )]
  }

  const couponData = {
    code: input.code, description: input.description ?? null,
    redemptionMode: input.redemptionMode ?? 'stripe',
    discountType: input.discountType,
    percentOff: input.discountType === 'percent' ? input.percentOff : null,
    amountOffUsd: input.discountType === 'amount' && input.amountOffUsd > 0 ? input.amountOffUsd : null,
    amountOffBrl: input.discountType === 'amount' && input.amountOffBrl > 0 ? input.amountOffBrl : null,
    amountOffMxn: input.discountType === 'amount' && input.amountOffMxn > 0 ? input.amountOffMxn : null,
    duration: input.duration, durationInMonths: input.duration === 'repeating' ? input.durationInMonths : null,
    maxRedemptions: input.maxRedemptions ?? null, redeemBy: input.redeemBy ?? null,
    appliesTo: { connect: partnerPlanIds.map((id) => ({ id })) },
    genCodePackages: { connect: genCodePackageIds.map((id) => ({ id })) },
    subscriptions: { connect: subscriptionIds.map((id) => ({ id })) },
    createdById: session.user.id,
  } satisfies Prisma.DiscountCouponCreateInput

  if (manual) {
    try {
      const created = await prisma.discountCoupon.create({ data: couponData, select: { id: true, code: true } })
      revalidatePath('/sales/discount-coupons')
      return ok(created, t('discountCoupon.created'))
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return fail(t('discountCoupon.codeExists'))
      console.error('[discount-coupon] manual create failed', error)
      return fail(t('discountCoupon.createFailed'))
    }
  }

  // Dynamic import so the action module never forces stripe.ts to load at
  // module-init time — only when this action is actually invoked.
  const { stripe } = await import('@/lib/stripe')

  // Pre-flight 2: the code must be free on Stripe too (catches orphans from
  // earlier failed runs — without this the user gets stuck unable to use a
  // code that doesn't exist in our DB).
  const stripeDup = await stripe.promotionCodes.list({ code: input.code, active: true, limit: 1 })
  if (stripeDup.data.length > 0) {
    return fail(t('discountCoupon.stripeOrphan', { code: input.code }))
  }

  let stripeCoupon: Awaited<ReturnType<typeof stripe.coupons.create>> | null = null
  let promo:        Awaited<ReturnType<typeof stripe.promotionCodes.create>> | null = null

  try {
    // 1. Create Stripe Coupon.
    //
    // A percentage needs no currency at all. A fixed amount does, and Stripe
    // models multi-currency on ONE coupon rather than three: a base
    // amount_off + currency, plus currency_options for the rest. So a coupon
    // valid in reais and dollars is a single object with a single promotion
    // code — the customer types one string whatever they are billed in.
    stripeCoupon = await stripe.coupons.create({
      ...(input.discountType === 'percent'
        ? { percent_off: input.percentOff }
        : amountOffPayload(input)),
      duration:           input.duration,
      duration_in_months: input.duration === 'repeating' ? (input.durationInMonths ?? undefined) : undefined,
      applies_to:         stripeProductIds.length > 0 ? { products: stripeProductIds } : undefined,
    })

    // 2. Create Stripe Promotion Code (the customer-facing string)
    promo = await stripe.promotionCodes.create({
      promotion:       { type: 'coupon', coupon: stripeCoupon.id },
      code:            input.code,
      max_redemptions: input.maxRedemptions ?? undefined,
      expires_at:      input.redeemBy ? Math.floor(input.redeemBy.getTime() / 1000) : undefined,
    })

    // 3. Persist mirror in DB
    const created = await prisma.discountCoupon.create({
      data: {
        ...couponData,
        stripeCouponId:        stripeCoupon.id,
        stripePromotionCodeId: promo.id,
      },
      select: { id: true, code: true },
    })

    revalidatePath('/sales/discount-coupons')
    return ok(created, t('discountCoupon.created'))
  } catch (e) {
    // Roll back anything we created on Stripe so we don't leak orphans.
    if (promo) {
      try { await stripe.promotionCodes.update(promo.id, { active: false }) } catch {}
    }
    if (stripeCoupon) {
      try { await stripe.coupons.del(stripeCoupon.id) } catch {}
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return fail(t('discountCoupon.codeExists'))
    }
    console.error('[discount-coupon] create failed', e)
    return fail(t('discountCoupon.createFailed'))
  }
}

/**
 * Updates the only safely-editable field on a coupon: the internal `description`.
 * Stripe Coupons and Promotion Codes are immutable for every commercially
 * meaningful attribute (percent_off, amount_off, duration, max_redemptions,
 * expires_at). Touching those would desync our DB from Stripe enforcement, so
 * we don't expose them. To change terms in practice: deactivate this coupon
 * and create a new one.
 */
export async function updateDiscountCoupon(
  id: string,
  data: { description: string | null },
): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  const coupon = await prisma.discountCoupon.findUnique({ where: { id }, select: { id: true } })
  if (!coupon) return fail(t('discountCoupon.notFound'))

  try {
    await prisma.discountCoupon.update({
      where: { id },
      data:  { description: data.description },
    })
  } catch (e) {
    console.error('[discount-coupon] update failed', e)
    return fail(t('discountCoupon.updateFailed'))
  }

  revalidatePath('/sales/discount-coupons')
  revalidatePath(`/sales/discount-coupons/${id}`)
  return done(t('discountCoupon.descriptionUpdated'))
}

export async function toggleDiscountCouponActive(id: string): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  const coupon = await prisma.discountCoupon.findUnique({
    where:  { id },
    select: { isActive: true, stripePromotionCodeId: true },
  })
  if (!coupon) return fail(t('discountCoupon.notFound'))

  const nextActive = !coupon.isActive

  try {
    // Mirror the active flag onto the Stripe Promotion Code so checkout enforcement stays in sync.
    if (coupon.stripePromotionCodeId) {
      const { stripe } = await import('@/lib/stripe')
      await stripe.promotionCodes.update(coupon.stripePromotionCodeId, { active: nextActive })
    }
    await prisma.discountCoupon.update({ where: { id }, data: { isActive: nextActive } })
  } catch (e) {
    console.error('[discount-coupon] toggle failed', e)
    return fail(t('discountCoupon.updateFailed'))
  }

  revalidatePath('/sales/discount-coupons')
  return done(nextActive ? t('discountCoupon.reactivated') : t('discountCoupon.deactivated'))
}
