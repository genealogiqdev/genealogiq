import 'server-only'

import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal'
import { byCurrencyDisplayOrder, type AppCurrency } from '@genealogiq/core'

/**
 * The live row of the price book: active, and not yet superseded by a newer
 * version. Every read of a plan's price goes through this shape, so "which
 * price is in force" has exactly one definition.
 */
const LIVE_PRICE = { isActive: true, effectiveTo: null } as const

const PRICE_SELECT = {
  id:                       true,
  currency:                 true,
  countryScope:             true,
  annualCashAmount:         true,
  installmentCount:         true,
  installmentAmount:        true,
  unitReferenceAmount:      true,
  version:                  true,
  stripeProductId:          true,
  stripeCashPriceId:        true,
  stripeInstallmentPriceId: true,
} as const

/** Decimal columns cross the server/client boundary as numbers, never as Decimal instances. */
function toNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

// Generic so the spread keeps every selected field. Narrowing the parameter to
// the three Decimal columns silently drops the rest from the return type, which
// surfaces far away as "not assignable" on whatever consumes the row.
function serialisePrice<T extends {
  annualCashAmount: unknown; installmentAmount: unknown; unitReferenceAmount: unknown
}>(p: T) {
  return {
    ...p,
    annualCashAmount:    toNumber(p.annualCashAmount),
    installmentAmount:   toNumber(p.installmentAmount),
    unitReferenceAmount: toNumber(p.unitReferenceAmount),
  }
}

export async function getPartnerPlans() {
  await verifySession()

  const rows = await prisma.partnerPlan.findMany({
    select: {
      id: true, name: true, code: true, description: true,
      annualAllowance: true, rolloverRate: true, rolloverValidityMonths: true,
      graceDays: true, committedReservationMonths: true,
      activationTrialMonths: true, activationTrialPlanCode: true,
      isActive: true, version: true, createdAt: true,
      prices:   { where: LIVE_PRICE, select: PRICE_SELECT },
      _count:   { select: { subscriptions: true } },
    },
    orderBy: { annualAllowance: 'asc' },
  })

  return rows.map((r) => ({
    ...r,
    rolloverRate: Number(r.rolloverRate),
    // Display order follows the language switcher, not the alphabet. Prisma
    // cannot express a custom sequence, so it is applied here.
    prices:       r.prices.map(serialisePrice).sort(byCurrencyDisplayOrder),
  }))
}

export async function getPartnerPlan(id: string) {
  await verifySession()

  const row = await prisma.partnerPlan.findUnique({
    where: { id },
    select: {
      id: true, name: true, code: true, description: true,
      annualAllowance: true, rolloverRate: true, rolloverValidityMonths: true,
      graceDays: true, committedReservationMonths: true,
      activationTrialMonths: true, activationTrialPlanCode: true,
      isActive: true, version: true,
      prices: { where: LIVE_PRICE, select: PRICE_SELECT },
    },
  })
  if (!row) return null

  return {
    ...row,
    rolloverRate: Number(row.rolloverRate),
    prices: row.prices.map(serialisePrice).sort(byCurrencyDisplayOrder),
  }
}

/**
 * Plans a partner can actually be sold in this currency — priced in it AND
 * synced with Stripe.
 *
 * A plan priced only in dollars does not appear in the Portuguese interface,
 * because choosing it there would fail at checkout with nothing to charge. Same
 * rule the old Package catalogue had, now expressed against the price book.
 */
export async function getSellablePartnerPlans(currency: AppCurrency, includeUnsynced = false) {
  await verifySession()

  const rows = await prisma.partnerPlan.findMany({
    where: {
      isActive: true,
      prices:   { some: { ...LIVE_PRICE, currency: currency.toUpperCase(), ...(includeUnsynced ? {} : { stripeCashPriceId: { not: null } }) } },
    },
    select: {
      id: true, name: true, code: true, annualAllowance: true,
      prices: {
        where:  { ...LIVE_PRICE, currency: currency.toUpperCase() },
        select: PRICE_SELECT,
        take:   1,
      },
    },
    orderBy: { annualAllowance: 'asc' },
  })

  return rows
    .filter((r) => r.prices[0])
    .map((r) => {
      const p = r.prices[0]
      return {
        id:                  r.id,
        name:                r.name,
        code:                r.code,
        annualAllowance:     r.annualAllowance,
        currency:            p.currency,
        stripeSynced:        !!p.stripeCashPriceId,
        annualCashAmount:    Number(p.annualCashAmount),
        unitReferenceAmount: toNumber(p.unitReferenceAmount),
        // Only offered as instalments when the amount AND its Stripe Price both
        // exist — offering a cadence we cannot charge fails at the till.
        installmentCount:  p.stripeInstallmentPriceId ? p.installmentCount : null,
        installmentAmount: p.stripeInstallmentPriceId ? toNumber(p.installmentAmount) : null,
      }
    })
}

export type PartnerPlanRow = Awaited<ReturnType<typeof getPartnerPlans>>[number]
export type SellablePartnerPlan = Awaited<ReturnType<typeof getSellablePartnerPlans>>[number]
