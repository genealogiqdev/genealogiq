import 'server-only'

import { createHash } from 'node:crypto'
import { prisma, Prisma } from '@genealogiq/db'
import { addBillingMonths } from './billing-dates'
import { grantGenCodeOrder, GENCODE_PACKAGE_CREDIT_MONTHS } from './gencode-package'
import { openPartnerCycle, partnerCycleSelect } from './partner-billing'

export type ManualCouponKind = 'partner' | 'package' | 'consumer'
export type ManualCouponErrorReason =
  | 'invalid-data' | 'coupon-unavailable' | 'coupon-exhausted' | 'product-not-applicable'
  | 'recipient-inactive' | 'product-unavailable' | 'invalid-quantity'
  | 'active-subscription' | 'reference-used' | 'request-conflict'

export class ManualCouponError extends Error {
  constructor(readonly reason: ManualCouponErrorReason) {
    super(reason)
    this.name = 'ManualCouponError'
  }
}

export interface ManualCouponInput {
  requestId: string
  couponId: string
  kind: ManualCouponKind
  productId: string
  tenantId?: string
  consumerEmail?: string
  quantity: number
  cadence: 'annual' | 'monthly'
  source: 'external_payment' | 'legacy_stock'
  reference: string
  externalAmount?: number | null
  confirmed: boolean
  /** Supplied by the authorized server action, never from a form. */
  createdById: string
  currency: string
}

export interface ManualCouponResult {
  id: string
  kind: string
  resultId: string
  alreadyApplied: boolean
}

function fail(reason: ManualCouponErrorReason): never { throw new ManualCouponError(reason) }

function cents(value: unknown): number {
  const result = Math.round(Number(value) * 100)
  if (!Number.isSafeInteger(result) || result <= 0 || result > 999_999_999_999) {
    fail('product-unavailable')
  }
  return result
}

function replayResult(row: { id: string; kind: string; resultId: string }): ManualCouponResult {
  return {
    id: row.id, kind: row.kind,
    resultId: row.resultId,
    alreadyApplied: true,
  }
}

/**
 * Only BMS exposes this writer, behind verifyAdmin and a translated Zod schema.
 * Coupon + recipient locks serialize limits and simultaneous grants. A receipt
 * and a stable request key are independently unique; all entitlement writes
 * roll back if recording the redemption fails. No payment SDK is called.
 */
export async function redeemManualCoupon(input: ManualCouponInput): Promise<ManualCouponResult> {
  const reference = input.reference.trim().replace(/\s+/g, ' ').toUpperCase()
  const consumerEmail = input.consumerEmail?.trim().toLowerCase()
  if (!input.confirmed || !input.createdById || !input.requestId || !input.couponId || !input.productId
    || !['partner', 'package', 'consumer'].includes(input.kind)
    || !['external_payment', 'legacy_stock'].includes(input.source)
    || !['annual', 'monthly'].includes(input.cadence)
    || !['BRL', 'USD', 'MXN'].includes(input.currency)
    || reference.length < 3 || reference.length > 160
    || (input.kind === 'consumer' ? !consumerEmail : !input.tenantId)
    || (input.kind === 'package' && (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 10_000))
    || (input.source === 'external_payment' && (
      !Number.isFinite(input.externalAmount) || Number(input.externalAmount) <= 0
      || Number(input.externalAmount) > 9_999_999_999.99
      || Math.abs(Number(input.externalAmount) * 100 - Math.round(Number(input.externalAmount) * 100)) > 0.000001
    ))) fail('invalid-data')

  const normalized = {
    couponId: input.couponId, kind: input.kind, productId: input.productId,
    recipient: input.kind === 'consumer' ? consumerEmail : input.tenantId,
    quantity: input.kind === 'package' ? input.quantity : 1,
    cadence: input.kind === 'consumer' ? input.cadence : 'annual',
    source: input.source, reference,
    externalAmount: input.source === 'external_payment' ? Math.round(Number(input.externalAmount) * 100) / 100 : null,
    createdById: input.createdById, currency: input.currency,
  }
  const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex')

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM discount_coupons WHERE id = ${input.couponId} FOR UPDATE`
      const previous = await tx.couponRedemption.findUnique({ where: { requestId: input.requestId } })
      if (previous) {
        if (previous.requestHash !== requestHash) fail('request-conflict')
        return replayResult(previous)
      }
      const receipt = await tx.couponRedemption.findUnique({
        where: { source_reference: { source: input.source, reference } },
      })
      if (receipt) fail('reference-used')

      const now = new Date()
      const coupon = await tx.discountCoupon.findUnique({
        where: { id: input.couponId },
        include: {
          appliesTo: { select: { id: true } }, genCodePackages: { select: { id: true } },
          subscriptions: { select: { id: true } }, _count: { select: { redemptions: true } },
        },
      })
      if (!coupon || !coupon.isActive || coupon.redemptionMode !== 'manual'
        || coupon.discountType !== 'percent' || Number(coupon.percentOff) !== 100
        || coupon.duration !== 'once' || coupon.stripeCouponId || coupon.stripePromotionCodeId
        || (coupon.redeemBy && coupon.redeemBy <= now)) fail('coupon-unavailable')
      if (coupon.maxRedemptions != null && coupon._count.redemptions >= coupon.maxRedemptions) fail('coupon-exhausted')
      const restrictions = [...coupon.appliesTo, ...coupon.genCodePackages, ...coupon.subscriptions]
      if (restrictions.length && !restrictions.some((p) => p.id === input.productId)) fail('product-not-applicable')

      let recipientId: string
      let currency = input.currency
      let subtotalCents: number
      let result: { genCodeOrderId?: string; subscriptionCycleId?: string; appSaleId?: string }

      if (input.kind === 'consumer') {
        await tx.$queryRaw`SELECT id FROM app_users WHERE lower(email) = ${consumerEmail!} ORDER BY id FOR UPDATE`
        const buyer = await tx.appUser.findFirst({
          where: { email: { equals: consumerEmail, mode: 'insensitive' }, role: 'APP_USER', isActive: true },
          select: { id: true },
        })
        if (!buyer) fail('recipient-inactive')
        recipientId = buyer.id
        const plan = await tx.subscription.findFirst({
          where: { id: input.productId, isActive: true, code: { not: 'FREE' }, termLength: { gt: 0 } },
          include: { prices: { where: { currency, isActive: true, effectiveTo: null, effectiveFrom: { lte: now } }, orderBy: { effectiveFrom: 'desc' }, take: 1 } },
        })
        const price = plan?.prices[0]
        if (!plan || !price) fail('product-unavailable')
        if (input.cadence === 'monthly' && (!price.installmentCount || !price.installmentAmount)) fail('product-unavailable')
        subtotalCents = cents(input.cadence === 'monthly' ? price.installmentAmount : price.annualCashAmount)
        const activeSales = await tx.appSale.findMany({
          where: { appUserId: buyer.id, status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: now } },
          orderBy: { currentPeriodEnd: 'desc' },
          select: { stripeSubscriptionId: true, subscriptionId: true, currentPeriodEnd: true },
        })
        // Extend the same manually held plan without losing already-paid days.
        // A Stripe subscription must be managed there to avoid two billings.
        if (activeSales.some((sale) => sale.stripeSubscriptionId || sale.subscriptionId !== plan.id)) fail('active-subscription')
        const active = activeSales[0]
        const sale = await tx.appSale.create({
          data: {
            appUserId: buyer.id, subscriptionId: plan.id, soldById: input.createdById,
            value: 0, currency, cadence: input.cadence, status: 'active', cancelAtPeriodEnd: true,
            currentPeriodEnd: addBillingMonths(active?.currentPeriodEnd ?? now, input.cadence === 'monthly' ? 1 : plan.termLength),
          },
          select: { id: true },
        })
        result = { appSaleId: sale.id }
      } else {
        await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${input.tenantId!} FOR UPDATE`
        const tenant = await tx.tenant.findFirst({ where: { id: input.tenantId, isActive: true }, select: { id: true } })
        if (!tenant) fail('recipient-inactive')
        recipientId = tenant.id

        if (input.kind === 'package') {
          const product = await tx.genCodePackage.findFirst({ where: { id: input.productId, isActive: true } })
          if (!product) fail('product-unavailable')
          if (input.quantity < product.minimumQuantity) fail('invalid-quantity')
          currency = product.currency
          subtotalCents = cents(Number(product.unitPrice) * input.quantity)
          const expiresAt = addBillingMonths(now, GENCODE_PACKAGE_CREDIT_MONTHS)
          const order = await tx.genCodeOrder.create({
            data: {
              packageId: product.id, tenantId: tenant.id, discountCouponId: coupon.id, discountCode: coupon.code,
              createdById: input.createdById, status: 'PAID', quantity: input.quantity,
              currency, unitPrice: product.unitPrice, discountAmount: subtotalCents / 100, totalAmount: 0,
              paidAt: now, creditExpiresAt: expiresAt,
              activationTrialMonths: product.activationTrialMonths, activationTrialPlanCode: product.activationTrialPlanCode,
            },
            select: { id: true },
          })
          await grantGenCodeOrder(tx, order.id, expiresAt)
          result = { genCodeOrderId: order.id }
        } else {
          const plan = await tx.partnerPlan.findFirst({
            where: { id: input.productId, isActive: true },
            include: { prices: { where: { currency, isActive: true, effectiveTo: null, effectiveFrom: { lte: now } }, orderBy: { effectiveFrom: 'desc' }, take: 1 } },
          })
          const price = plan?.prices[0]
          if (!plan || !price) fail('product-unavailable')
          subtotalCents = cents(price.annualCashAmount)
          const current = await tx.partnerSubscription.findFirst({
            where: {
              tenantId: tenant.id, status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE'] },
              OR: [{ stripeSubscriptionId: { not: null } }, { status: 'PENDING' }, { currentCycle: { endAt: { gt: now } } }],
            },
            select: { id: true },
          })
          if (current) fail('active-subscription')
          const renewable = await tx.partnerSubscription.findFirst({
            where: {
              tenantId: tenant.id, stripeSubscriptionId: null, status: { in: ['ACTIVE', 'PAST_DUE'] },
              currentCycle: { endAt: { lte: now }, graceEndAt: { gte: now } },
            },
            orderBy: { createdAt: 'desc' }, select: { id: true },
          })
          const subscription = renewable
            ? await tx.partnerSubscription.update({ where: { id: renewable.id }, data: { planId: plan.id, autoRenew: false }, select: partnerCycleSelect })
            : await tx.partnerSubscription.create({ data: { tenantId: tenant.id, planId: plan.id, autoRenew: false }, select: partnerCycleSelect })
          const cycle = await openPartnerCycle(tx, {
            subscription, now,
            price: {
              planPriceId: price.id, cadence: 'cash', currency, amountPaid: 0,
              discountCode: coupon.code, subtotalAmount: subtotalCents / 100, discountAmount: subtotalCents / 100,
              source: input.source, reference, externalAmount: normalized.externalAmount,
              book: { id: price.id, version: price.version, annualCashAmount: price.annualCashAmount.toString() },
            },
          })
          result = { subscriptionCycleId: cycle.id }
        }
      }

      const redemption = await tx.couponRedemption.create({
        data: {
          requestId: input.requestId, requestHash, couponId: coupon.id, code: coupon.code,
          resultId: (result.genCodeOrderId ?? result.subscriptionCycleId ?? result.appSaleId)!,
          kind: input.kind, recipientId, productId: input.productId, quantity: normalized.quantity,
          cadence: input.kind === 'consumer' ? input.cadence : input.kind === 'partner' ? 'annual' : null,
          source: input.source, reference, externalAmount: normalized.externalAmount,
          currency, subtotalAmount: subtotalCents / 100, discountAmount: subtotalCents / 100, totalAmount: 0,
          createdById: input.createdById, ...result,
        },
      })
      return { ...replayResult(redemption), alreadyApplied: false }
    }, { maxWait: 10_000, timeout: 30_000 })
  } catch (error) {
    // A receipt used concurrently with a different coupon loses to the global
    // unique index; the losing transaction leaves no sale, stock or credits.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const previous = await prisma.couponRedemption.findUnique({ where: { requestId: input.requestId } })
      if (previous) {
        if (previous.requestHash !== requestHash) fail('request-conflict')
        return replayResult(previous)
      }
      const receipt = await prisma.couponRedemption.findUnique({ where: { source_reference: { source: input.source, reference } } })
      if (receipt) fail('reference-used')
    }
    throw error
  }
}
