import 'server-only'

import { createHash } from 'node:crypto'
import type { Prisma } from '@genealogiq/db'
import { addBillingMonths } from './billing-dates'
import { reserveCreditForSale } from './credits'
import { enqueueEmail, notificationUrl } from './email-outbox'

export type PartnerConsumerAccessReason =
  | 'invalid-data' | 'customer-unavailable' | 'premium-unavailable' | 'active-subscription'
  | 'request-conflict' | 'grant-unavailable' | 'grant-revoked' | 'gencode-unavailable'

export class PartnerConsumerAccessError extends Error {
  constructor(readonly reason: PartnerConsumerAccessReason) {
    super(reason)
    this.name = 'PartnerConsumerAccessError'
  }
}

function fail(reason: PartnerConsumerAccessReason): never { throw new PartnerConsumerAccessError(reason) }

export interface PartnerConsumerInput {
  /** All identities except the recipient come from the verified server scope. */
  tenantId: string
  appUserId: string
  actorId: string
  requestId: string
  currency: string
}

async function lockCustomer(tx: Prisma.TransactionClient, tenantId: string, appUserId: string, granting = true) {
  await tx.$queryRaw`SELECT id FROM app_users WHERE id = ${appUserId} AND tenant_id = ${tenantId} FOR UPDATE`
  const customer = await tx.appUser.findFirst({
    where: { id: appUserId, tenantId, role: 'APP_USER' },
    select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
  })
  if (!customer || (granting && (!customer.isActive || !customer.email))) fail('customer-unavailable')
  return customer
}

/** The caller owns the transaction and verifies either tenant admin or live BMS platform scope. */
export async function grantPartnerConsumerPremium(tx: Prisma.TransactionClient, input: PartnerConsumerInput) {
  if (!input.tenantId || !input.appUserId || !input.actorId || !input.requestId
    || !['BRL', 'USD', 'MXN'].includes(input.currency)) fail('invalid-data')
  await lockCustomer(tx, input.tenantId, input.appUserId)
  const requestId = `partner-premium:${input.requestId}`
  const requestHash = createHash('sha256').update(JSON.stringify({
    tenantId: input.tenantId, appUserId: input.appUserId, actorId: input.actorId,
  })).digest('hex')
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${requestId}, 0))`
  const previous = await tx.consumerAccessGrant.findUnique({ where: { requestId }, include: { appSale: true } })
  if (previous) {
    if (previous.requestHash !== requestHash) fail('request-conflict')
    if (previous.revokedAt) fail('grant-revoked')
    if (!previous.appSale || previous.appSale.tenantId !== input.tenantId
      || previous.appSale.appUserId !== input.appUserId
      || !['active', 'trialing'].includes(previous.appSale.status ?? '')
      || !previous.appSale.currentPeriodEnd || previous.appSale.currentPeriodEnd <= new Date()) fail('grant-unavailable')
    return { grantId: previous.id, expiresAt: previous.expiresAt, alreadyGranted: true }
  }

  const now = new Date()
  const existing = await tx.consumerAccessGrant.findFirst({
    where: {
      recipientId: input.appUserId, revokedAt: null, expiresAt: { gt: now },
      appSale: { tenantId: input.tenantId, status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: now } },
    }, orderBy: { expiresAt: 'desc' },
  })
  // Repeated clicks or a second operator never add another complimentary year.
  if (existing) return { grantId: existing.id, expiresAt: existing.expiresAt, alreadyGranted: true }

  const premium = await tx.subscription.findFirst({ where: { code: 'PREMIUM', isActive: true }, select: { id: true } })
  if (!premium) fail('premium-unavailable')
  const sales = await tx.appSale.findMany({
    where: { appUserId: input.appUserId, status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: now } },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { id: true, value: true, subscriptionId: true, stripeSubscriptionId: true, stripePriceId: true,
      currentPeriodEnd: true, couponRedemption: { select: { id: true } } },
  })
  if (sales.some((sale) => sale.stripeSubscriptionId || sale.subscriptionId !== premium.id)) fail('active-subscription')
  const testId = `test-premium-${createHash('md5').update(input.appUserId).digest('hex')}`
  const testSale = sales.find((sale) => sale.id === testId && sale.value?.toString() === '0'
    && !sale.stripeSubscriptionId && !sale.stripePriceId && !sale.couponRedemption)
  const startsAt = sales.find((sale) => sale !== testSale)?.currentPeriodEnd ?? now
  const expiresAt = addBillingMonths(startsAt, 12)
  const sale = await tx.appSale.create({
    data: {
      appUserId: input.appUserId, tenantId: input.tenantId, soldById: input.actorId, subscriptionId: premium.id,
      value: 0, currency: input.currency, cadence: 'annual', status: 'active', currentPeriodEnd: expiresAt,
      cancelAtPeriodEnd: true,
    }, select: { id: true },
  })
  const grant = await tx.consumerAccessGrant.create({
    data: {
      requestId, requestHash, recipientId: input.appUserId, appUserId: input.appUserId,
      resultId: sale.id, appSaleId: sale.id, createdById: input.actorId, startsAt, expiresAt,
      notes: 'Partner customer Premium access',
    }, select: { id: true },
  })
  if (testSale) await tx.appSale.update({
    where: { id: testSale.id }, data: { status: 'canceled', cancelAtPeriodEnd: true, canceledAt: now, endedAt: now },
  })
  return { grantId: grant.id, expiresAt, alreadyGranted: false }
}

/** Revoke the confirmed grant, preserving purchased time, account identity and the GenCode sale. */
export async function revokePartnerConsumerPremium(tx: Prisma.TransactionClient, input: {
  tenantId: string; appUserId: string; actorId: string; grantId: string
}) {
  await lockCustomer(tx, input.tenantId, input.appUserId, false)
  const gift = await tx.consumerAccessGrant.findUnique({
    where: { id: input.grantId }, include: { appSale: { include: {
      subscription: { select: { code: true } }, couponRedemption: { select: { id: true } },
    } } },
  })
  if (!gift || gift.recipientId !== input.appUserId || gift.appUserId !== input.appUserId
    || gift.appSale?.tenantId !== input.tenantId) fail('grant-unavailable')
  if (gift.revokedAt) return { alreadyRevoked: true }
  const sale = gift.appSale
  const now = new Date()
  if (sale.id !== gift.resultId || sale.appUserId !== input.appUserId || sale.value?.toString() !== '0'
    || sale.stripeSubscriptionId || sale.stripePriceId || sale.couponRedemption
    || sale.subscription.code !== 'PREMIUM' || !['active', 'trialing'].includes(sale.status ?? '')
    || gift.expiresAt <= now || sale.currentPeriodEnd?.getTime() !== gift.expiresAt.getTime()) fail('grant-unavailable')
  const canceled = await tx.appSale.updateMany({
    where: { id: sale.id, appUserId: input.appUserId, tenantId: input.tenantId, value: 0,
      stripeSubscriptionId: null, stripePriceId: null, couponRedemption: { is: null },
      subscription: { code: 'PREMIUM' }, status: { in: ['active', 'trialing'] }, currentPeriodEnd: gift.expiresAt },
    data: { status: 'canceled', cancelAtPeriodEnd: true, canceledAt: now, endedAt: now },
  })
  if (canceled.count !== 1) fail('grant-unavailable')
  await tx.consumerAccessGrant.update({ where: { id: gift.id }, data: { revokedAt: now, revokedById: input.actorId } })
  return { alreadyRevoked: false }
}

/** One identified sale, credit reservation, Premium grant and receipt in the caller's transaction. */
export async function recordCustomerGenCodeSale(tx: Prisma.TransactionClient, input: PartnerConsumerInput & { genCode?: string }) {
  const customer = await lockCustomer(tx, input.tenantId, input.appUserId)
  const selectedCode = input.genCode?.trim().toUpperCase() || null
  // Existing-customer forms submit the physical code. A retry for that buyer is
  // a read, including after activation; it cannot re-enable a revoked Premium.
  if (selectedCode) {
    const existing = await tx.genCode.findFirst({ where: { genCode: selectedCode, tenantId: input.tenantId },
      select: { genCode: true, status: true, soldToAppUserId: true, soldAt: true } })
    if (existing?.soldAt && existing.soldToAppUserId === input.appUserId
      && ['SOLD', 'ACTIVATED'].includes(existing.status)) {
      return { genCode: existing.genCode, emailId: null, alreadySold: true }
    }
  }
  // Blank code is supported only by new registration: the unique customer
  // email and this transaction prevent retries from allocating another unit.
  const rows = await tx.$queryRaw<{ id: string; genCode: string }[]>`
    SELECT id, gen_code AS "genCode" FROM gencodes
    WHERE tenant_id = ${input.tenantId} AND status = 'AVAILABLE'
      AND (${selectedCode}::text IS NULL OR gen_code = ${selectedCode})
    ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
  `
  const code = rows[0]
  if (!code) fail('gencode-unavailable')
  const plan = await tx.partnerSubscription.findFirst({
    where: { tenantId: input.tenantId, status: 'ACTIVE' },
    select: { plan: { select: { committedReservationMonths: true } } },
  })
  await reserveCreditForSale({ tenantId: input.tenantId, genCodeId: code.id, committed: true,
    buyerId: customer.id, committedMonths: plan?.plan.committedReservationMonths ?? 12, actorId: input.actorId }, tx)
  await grantPartnerConsumerPremium(tx, input)
  const soldAt = new Date()
  const updated = await tx.genCode.updateMany({
    where: { id: code.id, tenantId: input.tenantId, status: 'AVAILABLE' },
    data: { status: 'SOLD', soldAt, soldVia: 'PLATFORM', soldById: input.actorId,
      soldToAppUserId: customer.id, soldToName: null, soldValue: null },
  })
  if (updated.count !== 1) fail('gencode-unavailable')
  const emailId = `customer-gencode:${code.id}:${soldAt.toISOString()}`
  await enqueueEmail(tx, {
    id: emailId, recipient: customer.email!,
    context: { type: 'gencode-sale', appUserId: customer.id, genCode: code.genCode, soldAt: soldAt.toISOString() },
    message: {
      subject: 'Seu GenCode está disponível', name: customer.firstName,
      paragraphs: [`O GenCode ${code.genCode} foi reservado para você. Acesse sua conta para ativá-lo.`],
      action: { label: 'Acessar GenCode', url: notificationUrl('app', `/qr/${encodeURIComponent(code.genCode)}`) },
    },
  })
  return { genCode: code.genCode, emailId, alreadySold: false }
}
