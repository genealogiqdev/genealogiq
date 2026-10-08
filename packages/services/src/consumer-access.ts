import 'server-only'

import { createHash } from 'node:crypto'
import { prisma } from '@genealogiq/db'
import { addBillingMonths } from './billing-dates'

export type ConsumerAccessErrorReason =
  | 'invalid-data' | 'email-conflict' | 'recipient-unavailable' | 'partner-account'
  | 'premium-unavailable' | 'active-subscription' | 'request-conflict' | 'request-completed'

export class ConsumerAccessError extends Error {
  constructor(readonly reason: ConsumerAccessErrorReason) {
    super(reason)
    this.name = 'ConsumerAccessError'
  }
}

export interface ConsumerAccessInput {
  requestId: string
  firstName: string
  lastName: string
  email: string
  notes?: string
  /** These fields come from the authorized server, never the browser. */
  passwordHash: string
  createdById: string
  locale: string
  currency: string
}

export interface ConsumerAccessResult {
  id: string
  appUserId: string
  email: string
  firstName: string
  expiresAt: Date
  emailSentAt: Date | null
  credentialsCreated: boolean
  alreadyGranted: boolean
}

function fail(reason: ConsumerAccessErrorReason): never { throw new ConsumerAccessError(reason) }

const recipientSelect = {
  id: true, email: true, firstName: true, role: true, isActive: true, tenantId: true,
} as const

function replay(grant: {
  id: string; expiresAt: Date; emailSentAt: Date | null; appSaleId: string | null
  appUser: { id: string; email: string | null; firstName: string; role: string; isActive: boolean; tenantId: string | null } | null
}): ConsumerAccessResult {
  if (!grant.appSaleId || !grant.appUser) fail('request-completed')
  if (grant.appUser.tenantId) fail('partner-account')
  if (!grant.appUser.isActive || grant.appUser.role !== 'APP_USER' || !grant.appUser.email) fail('recipient-unavailable')
  return {
    id: grant.id, appUserId: grant.appUser.id, email: grant.appUser.email,
    firstName: grant.appUser.firstName, expiresAt: grant.expiresAt, emailSentAt: grant.emailSentAt,
    credentialsCreated: false, alreadyGranted: true,
  }
}

/**
 * BMS-only gift, behind verifyConsumerAdmin and a translated schema. No purchase, coupon,
 * tenant or price-book dependency. Account + finite entitlement + audit commit
 * together; delivery happens afterward and never repeats the grant.
 */
export async function grantConsumerPremium(input: ConsumerAccessInput): Promise<ConsumerAccessResult> {
  const email = input.email.trim().toLowerCase()
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  const notes = input.notes?.trim() || null
  if (!input.requestId || !input.createdById || !firstName || !lastName || !email.includes('@')
    || email.length > 320 || firstName.length > 100 || lastName.length > 100 || (notes?.length ?? 0) > 500
    || !/^\$2[aby]\$12\$/.test(input.passwordHash)
    || !['BRL', 'USD', 'MXN'].includes(input.currency)) fail('invalid-data')

  // A fresh random password hash on a network retry is intentionally excluded.
  const requestHash = createHash('sha256').update(JSON.stringify({
    email, firstName, lastName, notes, createdById: input.createdById,
  })).digest('hex')

  return prisma.$transaction(async (tx) => {
    // Request locks also serialize an accidental reuse with a different email.
    // Email locks cover new accounts for which a row lock does not exist yet.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`consumer-access-request:${input.requestId}`}, 0))`
    const previous = await tx.consumerAccessGrant.findUnique({
      where: { requestId: input.requestId }, include: { appUser: { select: recipientSelect } },
    })
    if (previous) {
      if (previous.requestHash !== requestHash) fail('request-conflict')
      return replay(previous)
    }
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`consumer-access-email:${email}`}, 0))`
    // Coordinate existing consumers with the manual coupon writer as well.
    await tx.$queryRaw`SELECT id FROM app_users WHERE lower(email) = ${email} ORDER BY id FOR UPDATE`
    const matches = await tx.appUser.findMany({
      where: { email: { equals: email, mode: 'insensitive' } }, take: 2,
      select: { ...recipientSelect, password: true, googleId: true, emailVerified: true },
    })
    if (matches.length > 1) fail('email-conflict')
    let buyer = matches[0]
    if (buyer?.tenantId) fail('partner-account')
    if (buyer && (!buyer.isActive || buyer.role !== 'APP_USER')) fail('recipient-unavailable')

    const now = new Date()
    if (buyer) {
      // A second registration/operator must not accidentally gift another year.
      const activeGift = await tx.consumerAccessGrant.findFirst({
        where: { recipientId: buyer.id, expiresAt: { gt: now } },
        orderBy: { expiresAt: 'desc' }, include: { appUser: { select: recipientSelect } },
      })
      if (activeGift) return replay(activeGift)
    }

    const premium = await tx.subscription.findFirst({
      where: { code: 'PREMIUM', isActive: true }, select: { id: true },
    })
    if (!premium) fail('premium-unavailable')
    const activeSales = buyer ? await tx.appSale.findMany({
      where: { appUserId: buyer.id, status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: now } },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { subscriptionId: true, stripeSubscriptionId: true, currentPeriodEnd: true },
    }) : []
    // Do not create overlapping automatic charges or replace a different plan.
    if (activeSales.some((sale) => sale.stripeSubscriptionId || sale.subscriptionId !== premium.id)) fail('active-subscription')
    const startsAt = activeSales[0]?.currentPeriodEnd ?? now
    const expiresAt = addBillingMonths(startsAt, 12)
    const credentialsCreated = !buyer || (!buyer.password && !buyer.googleId)

    if (!buyer) {
      buyer = await tx.appUser.create({
        data: {
          firstName, lastName, email, role: 'APP_USER', isActive: true, tenantId: null,
          password: input.passwordHash, emailVerified: now, preferredLocale: input.locale,
          createdById: input.createdById,
        }, select: { ...recipientSelect, password: true, googleId: true, emailVerified: true },
      })
    } else if (credentialsCreated || !buyer.emailVerified) {
      // Existing profile/name/password/Google identity remain intact. An old
      // invitation with no login method can receive its first usable password.
      await tx.appUser.update({
        where: { id: buyer.id }, data: {
          ...(credentialsCreated ? { password: input.passwordHash } : {}),
          ...(buyer.emailVerified ? {} : { emailVerified: now }), updatedById: input.createdById,
        },
      })
    }
    const sale = await tx.appSale.create({
      data: {
        appUserId: buyer.id, subscriptionId: premium.id, tenantId: null, soldById: input.createdById,
        value: 0, currency: input.currency, cadence: 'annual', status: 'active',
        currentPeriodEnd: expiresAt, cancelAtPeriodEnd: true,
      }, select: { id: true },
    })
    const grant = await tx.consumerAccessGrant.create({
      data: {
        requestId: input.requestId, requestHash, recipientId: buyer.id, appUserId: buyer.id,
        resultId: sale.id, appSaleId: sale.id, createdById: input.createdById, startsAt, expiresAt, notes,
      }, select: { id: true },
    })
    return {
      id: grant.id, appUserId: buyer.id, email: buyer.email!, firstName: buyer.firstName,
      expiresAt, emailSentAt: null, credentialsCreated, alreadyGranted: false,
    }
  }, { timeout: 15_000 })
}
