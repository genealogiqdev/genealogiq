import 'server-only'
import { queuePackageSaleEmail } from './sale-notifications'

import type Stripe from 'stripe'
import { generateGenCode } from '@genealogiq/core'
import { prisma, type GenCodeOrderStatus, type Prisma } from '@genealogiq/db'
import { CHECKOUT_TTL_HOURS, CHECKOUT_ORIGINS, type CheckoutOrigin } from './partner-checkout'
import { ensureTenantStripeCustomer } from './stripe-customer'
import { stripe } from './stripe'

export const GENCODE_PACKAGE_CREDIT_MONTHS = 12

export type GenCodePackageCheckoutErrorReason =
  | 'package-not-found'
  | 'package-not-synced'
  | 'invalid-quantity'
  | 'tenant-inactive'
  | 'coupon-not-applicable'
  | 'no-url'

export class GenCodePackageCheckoutError extends Error {
  constructor(readonly reason: GenCodePackageCheckoutErrorReason, message: string) {
    super(message)
    this.name = 'GenCodePackageCheckoutError'
  }
}

export interface GenCodePackageCheckoutInput {
  packageId: string
  tenantId: string
  quantity: number
  discountCouponId?: string | null
  createdById: string
  origin: CheckoutOrigin
  successUrl: string
  cancelUrl: string
}

export interface GenCodePackageCheckoutResult {
  url: string
  orderId: string
  packageName: string
  quantity: number
  subtotalAmount: number
  discountAmount: number
  discountCode: string | null
  totalAmount: number
  currency: string
  expiresAt: Date
}

/**
 * Creates or updates the Stripe Product and ensures its immutable one-time
 * Price exists. The launch catalogue is BRL-only.
 */
export async function syncGenCodePackage(packageId: string): Promise<void> {
  const row = await prisma.genCodePackage.findUnique({ where: { id: packageId } })
  if (!row || !row.isActive) {
    throw new GenCodePackageCheckoutError('package-not-found', 'GenCode package not found or inactive')
  }

  let productId = row.stripeProductId
  if (productId) {
    await stripe.products.update(productId, {
      name: row.name,
      metadata: { genCodePackageId: row.id, packageCode: row.code },
    })
  } else {
    const product = await stripe.products.create({
      name: row.name,
      metadata: { genCodePackageId: row.id, packageCode: row.code },
    })
    productId = product.id
  }

  let priceId = row.stripePriceId
  if (!priceId) {
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: Math.round(Number(row.unitPrice) * 100),
      currency: row.currency.toLowerCase(),
      nickname: `${row.name} — unidade`,
      metadata: { genCodePackageId: row.id, packageCode: row.code },
    })
    priceId = price.id
  }

  await prisma.genCodePackage.update({
    where: { id: row.id },
    data: { stripeProductId: productId, stripePriceId: priceId },
  })
}

/**
 * Opens a one-time checkout for any active Genealogiq partner. A package is a
 * standalone shelf product and may be the tenant's first purchase.
 * The order is created first so every live Stripe session has a local audit row.
 */
export async function openGenCodePackageCheckout(
  input: GenCodePackageCheckoutInput,
): Promise<GenCodePackageCheckoutResult> {
  const packageRow = await prisma.genCodePackage.findFirst({
    where: { id: input.packageId, isActive: true },
  })
  if (!packageRow) {
    throw new GenCodePackageCheckoutError('package-not-found', 'GenCode package not found or inactive')
  }
  if (!Number.isInteger(input.quantity) || input.quantity < packageRow.minimumQuantity) {
    throw new GenCodePackageCheckoutError(
      'invalid-quantity',
      `Quantity must be an integer greater than or equal to ${packageRow.minimumQuantity}`,
    )
  }
  if (!packageRow.stripePriceId) {
    throw new GenCodePackageCheckoutError('package-not-synced', 'GenCode package is not synced with Stripe')
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: input.tenantId, isActive: true },
    select: { id: true },
  })
  if (!tenant) {
    throw new GenCodePackageCheckoutError(
      'tenant-inactive',
      'Tenant not found or inactive',
    )
  }

  const coupon = input.discountCouponId
    ? await resolveCoupon(input.discountCouponId, packageRow.id, packageRow.currency)
    : null

  const customer = await ensureTenantStripeCustomer(tenant.id)
  const unitPrice = Number(packageRow.unitPrice)
  const subtotalCents = Math.round(unitPrice * 100) * input.quantity
  const discountCents = coupon ? discountInCents(coupon, packageRow.currency, subtotalCents) : 0
  const subtotalAmount = subtotalCents / 100
  const discountAmount = discountCents / 100
  const totalAmount = (subtotalCents - discountCents) / 100
  const expiresAt = new Date(Date.now() + CHECKOUT_TTL_HOURS * 60 * 60 * 1000)

  const order = await prisma.genCodeOrder.create({
    data: {
      packageId: packageRow.id,
      tenantId: tenant.id,
      partnerSubscriptionId: null,
      discountCouponId: coupon?.id ?? null,
      discountCode: coupon?.code ?? null,
      createdById: input.createdById,
      quantity: input.quantity,
      currency: packageRow.currency,
      unitPrice,
      discountAmount,
      totalAmount,
      activationTrialMonths: packageRow.activationTrialMonths,
      activationTrialPlanCode: packageRow.activationTrialPlanCode,
      checkoutExpiresAt: expiresAt,
    },
    select: { id: true },
  })

  try {
    const metadata = {
      origin: input.origin,
      genCodeOrderId: order.id,
      genCodePackageId: packageRow.id,
      tenantId: tenant.id,
      quantity: String(input.quantity),
      ...(coupon && { discountCouponId: coupon.id, discountCode: coupon.code }),
    }
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer,
      line_items: [{ price: packageRow.stripePriceId, quantity: input.quantity }],
      ...(coupon && { discounts: [{ promotion_code: coupon.stripePromotionCodeId }] }),
      client_reference_id: tenant.id,
      metadata,
      // A 100% coupon produces no PaymentIntent. Session metadata is enough to
      // fulfil those no-payment-required checkouts, while paid sessions also
      // keep the same audit metadata on their PaymentIntent.
      ...(totalAmount > 0 && { payment_intent_data: { metadata } }),
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    })

    if (!checkout.url) {
      throw new GenCodePackageCheckoutError('no-url', 'Stripe returned a session with no URL')
    }

    await prisma.genCodeOrder.update({
      where: { id: order.id },
      data: { stripeCheckoutSessionId: checkout.id },
    })

    return {
      url: checkout.url,
      orderId: order.id,
      packageName: packageRow.name,
      quantity: input.quantity,
      subtotalAmount,
      discountAmount,
      discountCode: coupon?.code ?? null,
      totalAmount,
      currency: packageRow.currency,
      expiresAt,
    }
  } catch (error) {
    await prisma.genCodeOrder.delete({ where: { id: order.id } }).catch(() => {})
    throw error
  }
}

export type GenCodePackageFulfillmentOutcome =
  | 'fulfilled'
  | 'already-fulfilled'
  | 'payment-pending'
  | 'ignored'

export interface GenCodePackageFulfillmentResult {
  outcome: GenCodePackageFulfillmentOutcome
  tenantId?: string
}

/**
 * Applies a paid package Checkout Session exactly once.
 *
 * Claiming PENDING -> PAID, writing the TOPUP ledger entries and minting the
 * virtual codes happen in one transaction. A concurrent webhook replay sees a
 * zero-row claim and cannot create a second grant.
 */
export async function fulfillGenCodePackageCheckout(
  session: Stripe.Checkout.Session,
): Promise<GenCodePackageFulfillmentResult> {
  const orderId = session.metadata?.genCodeOrderId
  if (!orderId) return { outcome: 'ignored' }
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return { outcome: 'payment-pending' }
  }

  const existing = await prisma.genCodeOrder.findUnique({
    where: { id: orderId },
    select: { id: true, tenantId: true, status: true, stripeCheckoutSessionId: true },
  })
  if (!existing) return { outcome: 'ignored' }
  if (existing.stripeCheckoutSessionId && existing.stripeCheckoutSessionId !== session.id) {
    return { outcome: 'ignored' }
  }
  if (existing.status === 'PAID') {
    return { outcome: 'already-fulfilled', tenantId: existing.tenantId }
  }
  if (existing.status !== 'PENDING') return { outcome: 'ignored' }

  const paidAt = new Date()
  const creditExpiresAt = addMonths(paidAt, GENCODE_PACKAGE_CREDIT_MONTHS)
  const paymentIntentId = stripeReferenceId(session.payment_intent)

  const outcome = await prisma.$transaction(async (tx) => {
    const claimed = await tx.genCodeOrder.updateMany({
      where: { id: orderId, status: 'PENDING' },
      data: {
        status: 'PAID',
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        paidAt,
        creditExpiresAt,
      },
    })
    if (claimed.count === 0) return 'already-fulfilled' as const

    await grantGenCodeOrder(tx, orderId, creditExpiresAt)
    await queuePackageSaleEmail(tx, orderId)
    return 'fulfilled' as const
  })

  return { outcome, tenantId: existing.tenantId }
}

/** Called only inside the transaction that settles a previously unfulfilled order. */
export async function grantGenCodeOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  creditExpiresAt: Date,
): Promise<void> {
  const order = await tx.genCodeOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      tenantId: true,
      partnerSubscriptionId: true,
      createdById: true,
      quantity: true,
    },
  })
  if (!order) throw new Error(`GenCode order ${orderId} disappeared during fulfillment`)

  const grant = await tx.creditGrant.create({
    data: {
      tenantId: order.tenantId,
      subscriptionId: order.partnerSubscriptionId,
      source: 'TOPUP',
      grantedQty: order.quantity,
      remainingQty: order.quantity,
      expiresAt: creditExpiresAt,
      // A standalone package has its own 12-month term and never participates in rollover.
      rolloverGeneration: 1,
      createdById: order.createdById,
      reason: `One-time GenCode package order ${order.id}`,
    },
    select: { id: true },
  })

  await tx.creditTransaction.create({
    data: {
      grantId: grant.id,
      tenantId: order.tenantId,
      type: 'GRANT',
      quantity: order.quantity,
      balanceAfter: order.quantity,
      idempotencyKey: `grant:topup:${order.id}`,
      actorId: order.createdById,
      reason: `Paid GenCode package order ${order.id}`,
    },
  })

  await tx.genCode.createMany({
    data: Array.from({ length: order.quantity }, () => ({
      genCode: generateGenCode(),
      tenantId: order.tenantId,
      mintedInOrderId: order.id,
    })),
  })

  await tx.genCodeOrder.update({
    where: { id: order.id },
    data: { creditGrantId: grant.id },
  })
}

/** Mirrors a terminal unpaid Checkout state without touching credits or codes. */
export async function closeGenCodePackageCheckout(
  session: Stripe.Checkout.Session,
  status: Extract<GenCodeOrderStatus, 'FAILED' | 'EXPIRED'>,
): Promise<boolean> {
  const orderId = session.metadata?.genCodeOrderId
  if (!orderId) return false

  const result = await prisma.genCodeOrder.updateMany({
    where: {
      id: orderId,
      status: 'PENDING',
      OR: [{ stripeCheckoutSessionId: session.id }, { stripeCheckoutSessionId: null }],
    },
    data: {
      status,
      stripeCheckoutSessionId: session.id,
      failedAt: new Date(),
    },
  })
  return result.count > 0
}

/** Stripe fans all account events to this endpoint; metadata identifies ours. */
export function isGenCodePackageCheckout(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.origin === CHECKOUT_ORIGINS.bms && !!session.metadata?.genCodeOrderId
}

function addMonths(from: Date, months: number): Date {
  const value = new Date(from)
  value.setMonth(value.getMonth() + months)
  return value
}

function stripeReferenceId(reference: string | { id: string } | null): string | null {
  if (typeof reference === 'string') return reference
  return reference?.id ?? null
}

type ResolvedCoupon = {
  id: string
  code: string
  discountType: string
  percentOff: unknown
  amountOffUsd: unknown
  amountOffBrl: unknown
  amountOffMxn: unknown
  stripePromotionCodeId: string
}

async function resolveCoupon(
  discountCouponId: string,
  packageId: string,
  currency: string,
): Promise<ResolvedCoupon> {
  const coupon = await prisma.discountCoupon.findFirst({
    where: {
      id: discountCouponId,
      isActive: true,
      stripePromotionCodeId: { not: null },
      OR: [{ redeemBy: null }, { redeemBy: { gt: new Date() } }],
    },
    select: {
      id: true,
      code: true,
      discountType: true,
      percentOff: true,
      amountOffUsd: true,
      amountOffBrl: true,
      amountOffMxn: true,
      stripePromotionCodeId: true,
      appliesTo: { select: { id: true } },
      genCodePackages: { select: { id: true } },
      subscriptions: { select: { id: true } },
    },
  })

  const restrictedProductIds = coupon
    ? [
        ...coupon.appliesTo.map((product) => product.id),
        ...coupon.genCodePackages.map((product) => product.id),
        ...coupon.subscriptions.map((product) => product.id),
      ]
    : []
  const applicable = coupon
    && (restrictedProductIds.length === 0 || restrictedProductIds.includes(packageId))
    && couponValue(coupon, currency) > 0

  if (!applicable || !coupon.stripePromotionCodeId) {
    throw new GenCodePackageCheckoutError(
      'coupon-not-applicable',
      'Coupon is inactive, expired, unavailable in this currency, or restricted to another product',
    )
  }

  return { ...coupon, stripePromotionCodeId: coupon.stripePromotionCodeId }
}

function discountInCents(coupon: ResolvedCoupon, currency: string, subtotalCents: number): number {
  const raw = coupon.discountType === 'percent'
    ? Math.round(subtotalCents * couponValue(coupon, currency) / 100)
    : Math.round(couponValue(coupon, currency) * 100)
  return Math.min(subtotalCents, raw)
}

function couponValue(
  coupon: Pick<ResolvedCoupon, 'discountType' | 'percentOff' | 'amountOffUsd' | 'amountOffBrl' | 'amountOffMxn'>,
  currency: string,
): number {
  if (coupon.discountType === 'percent') return Number(coupon.percentOff ?? 0)
  if (currency === 'BRL') return Number(coupon.amountOffBrl ?? 0)
  if (currency === 'MXN') return Number(coupon.amountOffMxn ?? 0)
  if (currency === 'USD') return Number(coupon.amountOffUsd ?? 0)
  return 0
}
