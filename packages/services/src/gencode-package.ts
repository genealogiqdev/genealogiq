import 'server-only'

import type Stripe from 'stripe'
import { generateGenCode } from '@genealogiq/core'
import { prisma, Prisma, type GenCodeOrderStatus } from '@genealogiq/db'
import { CHECKOUT_TTL_HOURS, CHECKOUT_ORIGINS, type CheckoutOrigin } from './partner-checkout'
import { ensureTenantStripeCustomer } from './stripe-customer'
import { stripe } from './stripe'

export const GENCODE_PACKAGE_CODE = 'GENCODE_VIRTUAL_BRL'
export const GENCODE_PACKAGE_CREDIT_MONTHS = 12

export type GenCodePackageCheckoutErrorReason =
  | 'package-not-found'
  | 'package-not-synced'
  | 'invalid-quantity'
  | 'tenant-not-eligible'
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
 * Opens a one-time checkout for a tenant whose paid annual contract is active.
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

  const now = new Date()
  const tenant = await prisma.tenant.findFirst({
    where: {
      id: input.tenantId,
      isActive: true,
      partnerSubscriptions: {
        some: {
          status: 'ACTIVE',
          currentCycle: { is: { status: 'ACTIVE', startAt: { lte: now }, endAt: { gt: now } } },
        },
      },
    },
    select: {
      id: true,
      partnerSubscriptions: {
        where: {
          status: 'ACTIVE',
          currentCycle: { is: { status: 'ACTIVE', startAt: { lte: now }, endAt: { gt: now } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true },
      },
    },
  })
  const contract = tenant?.partnerSubscriptions[0]
  if (!tenant || !contract) {
    throw new GenCodePackageCheckoutError(
      'tenant-not-eligible',
      'Tenant must have an active B2B contract and cycle',
    )
  }

  const customer = await ensureTenantStripeCustomer(tenant.id)
  const unitPrice = new Prisma.Decimal(packageRow.unitPrice)
  const totalAmount = unitPrice.mul(input.quantity)
  const expiresAt = new Date(Date.now() + CHECKOUT_TTL_HOURS * 60 * 60 * 1000)

  const order = await prisma.genCodeOrder.create({
    data: {
      packageId: packageRow.id,
      tenantId: tenant.id,
      partnerSubscriptionId: contract.id,
      createdById: input.createdById,
      quantity: input.quantity,
      currency: packageRow.currency,
      unitPrice,
      totalAmount,
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
    }
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer,
      line_items: [{ price: packageRow.stripePriceId, quantity: input.quantity }],
      client_reference_id: tenant.id,
      metadata,
      payment_intent_data: { metadata },
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
      totalAmount: Number(totalAmount),
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

/**
 * Applies a paid package Checkout Session exactly once.
 *
 * Claiming PENDING -> PAID, writing the TOPUP ledger entries and minting the
 * virtual codes happen in one transaction. A concurrent webhook replay sees a
 * zero-row claim and cannot create a second grant.
 */
export async function fulfillGenCodePackageCheckout(
  session: Stripe.Checkout.Session,
): Promise<GenCodePackageFulfillmentOutcome> {
  const orderId = session.metadata?.genCodeOrderId
  if (!orderId) return 'ignored'
  if (session.payment_status !== 'paid') return 'payment-pending'

  const existing = await prisma.genCodeOrder.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, stripeCheckoutSessionId: true },
  })
  if (!existing) return 'ignored'
  if (existing.stripeCheckoutSessionId && existing.stripeCheckoutSessionId !== session.id) return 'ignored'
  if (existing.status === 'PAID') return 'already-fulfilled'
  if (existing.status !== 'PENDING') return 'ignored'

  const paidAt = new Date()
  const creditExpiresAt = addMonths(paidAt, GENCODE_PACKAGE_CREDIT_MONTHS)
  const paymentIntentId = stripeReferenceId(session.payment_intent)

  return prisma.$transaction(async (tx) => {
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
    if (claimed.count === 0) return 'already-fulfilled'

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
        // A top-up has its own 12-month term and never participates in rollover.
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

    return 'fulfilled'
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
