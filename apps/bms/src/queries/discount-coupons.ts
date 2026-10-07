import 'server-only'

import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal'
import type { AppCurrency } from '@genealogiq/core'

export async function getDiscountCoupons() {
  await verifySession()

  return prisma.discountCoupon.findMany({
    select: {
      id:             true,
      code:           true,
      description:    true,
      discountType:   true,
      redemptionMode: true,
      percentOff:     true,
      amountOffUsd:   true,
      amountOffBrl:   true,
      amountOffMxn:   true,
      duration:       true,
      durationInMonths: true,
      maxRedemptions: true,
      redeemBy:       true,
      isActive:       true,
      createdAt:      true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getDiscountCoupon(id: string) {
  await verifySession()

  const coupon = await prisma.discountCoupon.findUnique({
    where: { id },
    select: {
      id:                    true,
      code:                  true,
      description:           true,
      discountType:          true,
      redemptionMode:        true,
      percentOff:            true,
      amountOffUsd:          true,
      amountOffBrl:          true,
      amountOffMxn:          true,
      duration:              true,
      durationInMonths:      true,
      maxRedemptions:        true,
      redeemBy:              true,
      isActive:              true,
      stripeCouponId:        true,
      stripePromotionCodeId: true,
      appliesTo:             { select: { id: true, name: true } },
      createdAt:             true,
    },
  })
  return coupon
}

/**
 * Products a coupon can be restricted to, priced in the operator's currency.
 *
 * Restrictions use local product IDs across B2B, packages and B2C. Stripe-mode
 * creation resolves those IDs to provider products; manual mode also accepts
 * unsynchronized products. The price label helps staff recognize each row.
 */
export async function getActiveProductsForSelect(currency: AppCurrency) {
  await verifySession()

  const [plans, packages, subscriptions] = await Promise.all([
    prisma.partnerPlan.findMany({
      where: {
        isActive: true,
        prices: {
          some: {
            isActive: true,
            effectiveTo: null,
            currency: currency.toUpperCase(),
          },
        },
      },
      orderBy: { annualAllowance: 'asc' },
      select:  {
        id: true, name: true, annualAllowance: true,
        prices: {
          where: {
            isActive: true,
            effectiveTo: null,
            currency: currency.toUpperCase(),
          },
          select: { annualCashAmount: true, stripeProductId: true },
          take: 1,
        },
      },
    }),
    prisma.genCodePackage.findMany({
      where: {
        isActive: true,
        currency: currency.toUpperCase(),
      },
      orderBy: [{ minimumQuantity: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        minimumQuantity: true,
        unitPrice: true,
        currency: true,
        stripeProductId: true,
      },
    }),
    prisma.subscription.findMany({
      where: { isActive: true, code: { not: 'FREE' }, prices: { some: { isActive: true, effectiveTo: null, currency: currency.toUpperCase() } } },
      select: { id: true, name: true, prices: { where: { isActive: true, effectiveTo: null, currency: currency.toUpperCase() }, select: { annualCashAmount: true, stripeProductId: true }, take: 1 } },
      orderBy: { name: 'asc' },
    }),
  ])

  return [
    ...plans.map((r) => ({
      kind:            'partner-plan' as const,
      id:              r.id,
      name:            r.name,
      quantity:        r.annualAllowance,
      price:           Number(r.prices[0]?.annualCashAmount ?? 0),
      currency:        currency.toUpperCase(),
      stripeSynced:    !!r.prices[0]?.stripeProductId,
    })),
    ...packages.map((r) => ({
      kind:            'gencode-package' as const,
      id:              r.id,
      name:            r.name,
      quantity:        r.minimumQuantity,
      price:           Number(r.unitPrice),
      currency:        r.currency,
      stripeSynced:    !!r.stripeProductId,
    })),
    ...subscriptions.map((r) => ({
      kind: 'consumer' as const, id: r.id, name: r.name, quantity: 1,
      price: Number(r.prices[0]?.annualCashAmount ?? 0), currency: currency.toUpperCase(),
      stripeSynced: !!r.prices[0]?.stripeProductId,
    })),
  ]
}

/**
 * Coupons an operator may legitimately attach to a sale, with the products each
 * one is restricted to. The form filters by the selected product client-side —
 * the whole set is a handful of rows, so a round trip per product change would
 * buy a spinner and nothing else.
 *
 * Four filters, and only the first is obvious:
 *
 * - `isActive` — the operator's own on/off switch.
 * - `stripePromotionCodeId` present — the discount is enforced by Stripe, not by
 *   us. A row without one is a coupon we failed to mirror, and attaching it
 *   would silently charge full price.
 * - `redeemBy` unset or still in the future. This matters more than it looks:
 *   the coupon list renders a green "active" badge off `isActive` alone and
 *   never reconciles it against the expiry date, so an expired coupon looks
 *   perfectly usable there. Stripe would reject it at checkout.
 *
 * - the currency the sale is being made in. A percentage has none and always
 *   qualifies; a fixed amount only appears where it has a value, because Stripe
 *   would refuse it otherwise. This is Douglas's rule — a coupon in Portuguese
 *   is a coupon in reais — falling out of the data rather than being enforced
 *   separately.
 *
 * An empty `productIds` means every product — that is how createDiscountCoupon
 * writes it, sending Stripe an `applies_to` only when neither relation has rows.
 *
 * This is a convenience for the form, never an authority: createSalePaymentLink
 * re-resolves the coupon server-side, because a page left open can offer one
 * that has since expired.
 */
export async function getSelectableCoupons(currency: AppCurrency) {
  await verifySession()

  const AMOUNT_BY_CURRENCY = { usd: 'amountOffUsd', brl: 'amountOffBrl', mxn: 'amountOffMxn' } as const

  const rows = await prisma.discountCoupon.findMany({
    where: {
      isActive:              true,
      OR: [{ redeemBy: null }, { redeemBy: { gt: new Date() } }],
      // Douglas's rule: a coupon in Portuguese is a coupon in reais. A
      // percentage has no currency and is always eligible; a fixed amount is
      // only offered where it has a value, because Stripe would refuse it.
      AND: [{ OR: [
        { redemptionMode: 'stripe', stripePromotionCodeId: { not: null } },
        { redemptionMode: 'manual', discountType: 'percent', percentOff: 100 },
      ] }, { OR: [
        { discountType: 'percent' },
        { [AMOUNT_BY_CURRENCY[currency]]: { gt: 0 } },
      ] }],
    },
    select: {
      id:            true,
      code:          true,
      redemptionMode: true,
      maxRedemptions: true,
      _count: { select: { redemptions: true } },
      discountType:  true,
      percentOff:    true,
      amountOffUsd:  true,
      amountOffBrl:  true,
      amountOffMxn:  true,
      appliesTo:     { select: { id: true } },
      genCodePackages: { select: { id: true } },
      subscriptions: { select: { id: true } },
    },
    orderBy: { code: 'asc' },
  })

  return rows.filter((c) => c.redemptionMode !== 'manual' || c.maxRedemptions == null || c._count.redemptions < c.maxRedemptions).map((c) => ({
    id:           c.id,
    code:         c.code,
    redemptionMode: c.redemptionMode,
    discountType: c.discountType,
    // One number, already resolved for this currency — the form never has to
    // know which of the four columns applies.
    value: c.discountType === 'percent'
      ? Number(c.percentOff ?? 0)
      : Number(c[AMOUNT_BY_CURRENCY[currency]] ?? 0),
    productIds: [
      ...c.appliesTo.map((p) => p.id),
      ...c.genCodePackages.map((p) => p.id),
      ...c.subscriptions.map((p) => p.id),
    ],
  }))
}

export type SelectableCoupon = Awaited<ReturnType<typeof getSelectableCoupons>>[number]
