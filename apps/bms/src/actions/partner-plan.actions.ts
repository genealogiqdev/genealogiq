'use server'

import { revalidatePath } from 'next/cache'
import { getLocale, getTranslations } from 'next-intl/server'
import { Prisma } from '@genealogiq/db'
import { ok, done, fail, currencyForLocale, currencyCode, type ActionResult } from '@genealogiq/core'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { verifyAdmin } from '@/lib/dal'
import { sendSalePaymentLinkEmail } from '@/lib/email'
import { syncPartnerPlan as syncPartnerPlanWithStripe } from '@genealogiq/services/plan-sync'
import { getPartnerPlanSchema, type PartnerPlanFormValues } from '@/schemas/partner-plan.schema'
import { identityTranslator } from '@/schemas/i18n'
import { decidePriceOp } from '@/lib/price-book'
import {
  openPartnerCheckout,
  PartnerCheckoutError,
  type PartnerCadence,
} from '@genealogiq/services/partner-checkout'
import { BMS_ORIGIN } from '@/lib/billing'

/**
 * Sends a partner the link that subscribes them to a plan.
 *
 * The operator-driven half of the same flow SEQ offers self-serve. The contract
 * is written before the session exists and deleted if the session cannot be
 * created — the discipline the old Sale flow settled on, for the same reason: a
 * contract nobody can pay and nobody can see the state of is worse than none.
 *
 * The currency comes from the locale the operator is working in, not from a
 * field they fill: a subscription sold in Portuguese charges in reais.
 */
export async function sendPartnerPlanLink(
  tenantId: string,
  planId:   string,
  cadence:  PartnerCadence,
  discountCouponId?: string | null,
): Promise<ActionResult<{ email: string }>> {
  await verifyAdmin()
  const t = await getTranslations('Actions')
  const currency = currencyForLocale(await getLocale())

  if (cadence !== 'cash' && cadence !== 'installment') return fail(t('common.invalidData'))

  const tenant = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { isActive: true, email: true, name: true },
  })
  if (!tenant) return fail(t('sale.tenantNotFound'))
  if (!tenant.isActive) return fail(t('sale.tenantInactive'))

  // Re-resolved server-side rather than trusted from the form: a coupon offered
  // by a stale page can have expired since it rendered.
  let promotionCodeId: string | null = null
  if (discountCouponId) {
    const coupon = await prisma.discountCoupon.findFirst({
      where: {
        id: discountCouponId, isActive: true, stripePromotionCodeId: { not: null },
        OR: [{ redeemBy: null }, { redeemBy: { gt: new Date() } }],
      },
      select: {
        stripePromotionCodeId: true,
        appliesTo: { select: { id: true } },
        genCodePackages: { select: { id: true } },
        subscriptions: { select: { id: true } },
      },
    })
    if (!coupon) return fail(t('sale.couponNotApplicable'))
    const restrictedProductIds = [
      ...coupon.appliesTo.map((product) => product.id),
      ...coupon.genCodePackages.map((product) => product.id),
      ...coupon.subscriptions.map((product) => product.id),
    ]
    if (restrictedProductIds.length > 0 && !restrictedProductIds.includes(planId)) {
      return fail(t('sale.couponNotApplicable'))
    }
    promotionCodeId = coupon.stripePromotionCodeId
  }

  const baseUrl = process.env.BMS_URL ?? 'http://localhost:3001'

  try {
    const checkout = await openPartnerCheckout({
      tenantId,
      planId,
      cadence,
      currency,
      origin:     BMS_ORIGIN,
      successUrl: `${baseUrl}/sales/contracts?status=success`,
      cancelUrl:  `${baseUrl}/sales/contracts?status=cancel`,
      promotionCodeId,
    })

    await sendSalePaymentLinkEmail({
      to:          tenant.email,
      url:         checkout.url,
      tenantName:  tenant.name,
      productName: checkout.planName,
      quantity:    1,
      amount:      formatAmount(checkout.amountTotal, checkout.currency),
      expiresAt:   checkout.expiresAt,
    })

    revalidatePath('/sales/contracts')
    return ok({ email: tenant.email })
  } catch (err) {
    if (err instanceof PartnerCheckoutError) {
      if (err.reason === 'plan-not-found') return fail(t('sale.packageNotFound'))
      return fail(t('sale.packageNotSyncedInCurrency', { currency: currencyCode(currency) }))
    }
    const message = err instanceof Error ? err.message : t('sale.unknownError')
    return fail(t('sale.linkFailed', { message }))
  }
}

/** Stripe reports totals in the smallest currency unit; every currency we sell in has two decimals. */
function formatAmount(amountTotal: number | null, currency: string | null): string {
  if (amountTotal == null || !currency) return ''
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency.toUpperCase() })
    .format(amountTotal / 100)
}

// ─── Catalogue CRUD ──────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'USD', country: null, cash: 'cashUsd', inst: 'installmentUsd', unit: 'unitRefUsd' },
  { code: 'BRL', country: 'BR', cash: 'cashBrl', inst: 'installmentBrl', unit: 'unitRefBrl' },
  { code: 'MXN', country: 'MX', cash: 'cashMxn', inst: 'installmentMxn', unit: 'unitRefMxn' },
] as const

/** Everything on a plan except its prices — the terms a version bump applies to. */
function planTerms(v: PartnerPlanFormValues) {
  return {
    name:                       v.name,
    code:                       v.code,
    description:                v.description || null,
    annualAllowance:            v.annualAllowance,
    rolloverRate:               v.rolloverRate,
    rolloverValidityMonths:     v.rolloverValidityMonths,
    graceDays:                  v.graceDays,
    committedReservationMonths: v.committedReservationMonths,
    activationTrialMonths:      v.activationTrialMonths,
    activationTrialPlanCode:    v.activationTrialPlanCode || null,
    isActive:                   v.isActive,
  }
}

export async function createPartnerPlan(data: PartnerPlanFormValues): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  const parsed = getPartnerPlanSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(t('common.invalidData'))
  const v = parsed.data

  const clash = await prisma.partnerPlan.findUnique({ where: { code: v.code }, select: { id: true } })
  if (clash) return fail(t('partnerPlan.codeExists'))

  try {
    await prisma.$transaction(async (tx) => {
      const plan = await tx.partnerPlan.create({ data: planTerms(v), select: { id: true } })
      const rows = livePriceRows(v).map((p) => ({ ...p, partnerPlanId: plan.id }))
      if (rows.length) await tx.planPrice.createMany({ data: rows })
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return fail(t('common.duplicate'))
    }
    throw e
  }

  revalidatePath('/plans')
  return done(t('partnerPlan.created'))
}

/**
 * Edits a plan's terms and reconciles its price book.
 *
 * Terms are updated in place with `version` bumped; a cycle already running
 * keeps the terms it opened with, because it froze them in planSnapshot.
 *
 * Prices are NEVER edited. A changed amount closes the live row (effectiveTo =
 * now) and opens the next version beside it, so a contract signed last week can
 * still resolve the price that was in force when it was signed. Editing in
 * place is exactly the bug the old Package columns had, where changing a price
 * silently rewrote the revenue history of every sale without an amount snapshot.
 */
export async function updatePartnerPlan(id: string, data: PartnerPlanFormValues): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  const parsed = getPartnerPlanSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(t('common.invalidData'))
  const v = parsed.data

  const clash = await prisma.partnerPlan.findFirst({
    where: { code: v.code, NOT: { id } }, select: { id: true },
  })
  if (clash) return fail(t('partnerPlan.codeExists'))

  const live = await prisma.planPrice.findMany({
    where:  { partnerPlanId: id, isActive: true, effectiveTo: null },
    select: {
      id: true, currency: true, version: true,
      annualCashAmount: true, installmentCount: true, installmentAmount: true, unitReferenceAmount: true,
      stripeCashPriceId: true, stripeInstallmentPriceId: true,
    },
  })

  const now      = new Date()
  const superseded: string[] = []

  try {
    await prisma.$transaction(async (tx) => {
      await tx.partnerPlan.update({
        where: { id },
        data:  { ...planTerms(v), version: { increment: 1 } },
      })

      for (const c of CURRENCIES) {
        const wanted   = priceRowFor(v, c)
        const existing = live.find((p) => p.currency === c.code)

        const op = decidePriceOp(
          existing && {
            version:             existing.version,
            annualCashAmount:    Number(existing.annualCashAmount),
            installmentCount:    existing.installmentCount,
            installmentAmount:   existing.installmentAmount === null ? null : Number(existing.installmentAmount),
            unitReferenceAmount: existing.unitReferenceAmount === null ? null : Number(existing.unitReferenceAmount),
          },
          wanted,
        )

        if (op.kind === 'absent' || op.kind === 'keep') continue

        // Closing always precedes opening, and both close the SAME live row —
        // otherwise two rows for one currency would both read as in force.
        if (existing && (op.kind === 'close' || op.kind === 'supersede')) {
          await tx.planPrice.update({
            where: { id: existing.id },
            data:  { effectiveTo: now, isActive: false },
          })
          if (existing.stripeCashPriceId)        superseded.push(existing.stripeCashPriceId)
          if (existing.stripeInstallmentPriceId) superseded.push(existing.stripeInstallmentPriceId)
        }

        if (op.kind === 'open') {
          await tx.planPrice.create({ data: { ...wanted!, partnerPlanId: id } })
        } else if (op.kind === 'supersede') {
          await tx.planPrice.create({ data: { ...wanted!, partnerPlanId: id, version: op.nextVersion } })
        }
      }
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return fail(t('partnerPlan.notFound'))
    }
    throw e
  }

  // Best-effort, and outside the transaction: a Stripe Price left live after
  // its DB row closed is purchasable through a link nobody can trace back. The
  // same reason the old package sync archived superseded prices.
  for (const priceId of superseded) {
    await stripe.prices.update(priceId, { active: false }).catch(() => {})
  }

  revalidatePath('/plans')
  revalidatePath(`/plans/${id}`)
  return done(superseded.length ? t('partnerPlan.updatedResync') : t('partnerPlan.updated'))
}

export async function togglePartnerPlanActive(id: string): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  const plan = await prisma.partnerPlan.findUnique({ where: { id }, select: { isActive: true } })
  if (!plan) return fail(t('partnerPlan.notFound'))

  await prisma.partnerPlan.update({ where: { id }, data: { isActive: !plan.isActive } })
  revalidatePath('/plans')
  return done()
}

/** Mints the Stripe Product and the recurring Prices the checkout needs. */
export async function syncPartnerPlan(id: string): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  try {
    const r = await syncPartnerPlanWithStripe(id)
    return done(t('partnerPlan.synced', { created: r.pricesCreated, reused: r.pricesReused }))
  } catch (e) {
    const message = e instanceof Error ? e.message : t('sale.unknownError')
    return fail(t('partnerPlan.syncFailed', { message }))
  } finally {
    revalidatePath('/plans')
    revalidatePath(`/plans/${id}`)
  }
}

/** The price-book rows a form submission asks for, one per priced currency. */
function livePriceRows(v: PartnerPlanFormValues) {
  return CURRENCIES.map((c) => priceRowFor(v, c)).filter((r): r is NonNullable<typeof r> => r !== null)
}

function priceRowFor(v: PartnerPlanFormValues, c: (typeof CURRENCIES)[number]) {
  const cash = v[c.cash]
  if (cash <= 0) return null
  const instalment = v[c.inst]
  const unit       = v[c.unit]
  return {
    currency:            c.code,
    countryScope:        c.country,
    annualCashAmount:    cash,
    installmentCount:    instalment > 0 ? v.installmentCount : null,
    installmentAmount:   instalment > 0 ? instalment : null,
    unitReferenceAmount: unit > 0 ? unit : null,
    effectiveFrom:       new Date(),
  }
}
