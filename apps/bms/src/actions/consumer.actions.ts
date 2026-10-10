'use server'

import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getLocale, getTranslations } from 'next-intl/server'
import { Prisma } from '@genealogiq/db'
import { currencyForLocale, done, fail, hashToken, ok, type ActionResult } from '@genealogiq/core'
import { ConsumerAccessError, grantConsumerPremium, revokeConsumerPremium, type ConsumerAccessResult } from '@genealogiq/services/consumer-access'
import { prisma } from '@/lib/prisma'
import { verifyConsumerAdmin } from '@/lib/consumer-access'
import { sendConsumerPremiumEmail } from '@/lib/email'
import { getConsumerSchema, type ConsumerFormValues } from '@/schemas/consumer.schema'
import { identityTranslator } from '@/schemas/i18n'

export interface ConsumerRegistrationResult {
  appUserId: string
  expiresAt: string
  alreadyGranted: boolean
  emailPending: boolean
}

export async function registerConsumer(data: ConsumerFormValues): Promise<ActionResult<ConsumerRegistrationResult>> {
  const session = await verifyConsumerAdmin()
  const t = await getTranslations('Consumers')
  const parsed = getConsumerSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(t('errors.invalid-data'))
  const locale = await getLocale()
  const password = `Gq!${randomBytes(18).toString('base64url')}`
  const passwordHash = await bcrypt.hash(password, 12)
  let result: ConsumerAccessResult
  try {
    result = await grantConsumerPremium({
      ...parsed.data, passwordHash, createdById: session.user.id, locale,
      currency: currencyForLocale(locale).toUpperCase(),
    })
  } catch (error) {
    if (error instanceof ConsumerAccessError) return fail(t(`errors.${error.reason}`))
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return fail(t('errors.email-conflict'))
    console.error('[consumer-access] registration transaction failed')
    return fail(t('errors.failed'))
  }

  // From here the account and entitlement exist. A mail failure must not be
  // reported as a failed registration or invite a second grant.
  let emailPending = !result.emailSentAt
  if (!result.alreadyGranted) {
    try {
      await sendConsumerPremiumEmail({
        to: result.email, name: result.firstName, expiresAt: result.expiresAt,
        ...(result.credentialsCreated ? { password } : {}),
      })
      await prisma.consumerAccessGrant.update({ where: { id: result.id }, data: { emailSentAt: new Date() } })
      emailPending = false
    } catch {
      console.error('[consumer-access] access granted; email needs retry', { grantId: result.id })
    }
  }
  revalidatePath('/consumers')
  return ok({ appUserId: result.appUserId, expiresAt: result.expiresAt.toISOString(), alreadyGranted: result.alreadyGranted, emailPending },
    t(emailPending ? 'emailPending' : result.alreadyGranted ? 'alreadyGranted' : 'granted'))
}

/** Resend a setup link without changing the password or granting more months. */
export async function resendConsumerAccessEmail(appUserId: string): Promise<ActionResult> {
  await verifyConsumerAdmin()
  const t = await getTranslations('Consumers')
  if (!z.string().min(1).max(128).safeParse(appUserId).success) return fail(t('errors.invalid-data'))
  const consumer = await prisma.appUser.findFirst({
    where: { id: appUserId, tenantId: null, role: 'APP_USER', isActive: true, email: { not: null } },
    select: {
      id: true, firstName: true, email: true,
      consumerAccessGrants: {
        where: { revokedAt: null, expiresAt: { gt: new Date() }, appSale: { status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: new Date() } } },
        orderBy: { expiresAt: 'desc' }, take: 1, select: { id: true, expiresAt: true },
      },
    },
  })
  const grant = consumer?.consumerAccessGrants[0]
  if (!consumer?.email || !grant) return fail(t('errors.recipient-unavailable'))
  try {
    const token = randomBytes(32).toString('hex')
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { appUserId: consumer.id } }),
      prisma.passwordResetToken.create({ data: {
        token: hashToken(token), appUserId: consumer.id,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      } }),
    ])
    await sendConsumerPremiumEmail({ to: consumer.email, name: consumer.firstName, expiresAt: grant.expiresAt, token })
    await prisma.consumerAccessGrant.update({ where: { id: grant.id }, data: { emailSentAt: new Date() } })
  } catch {
    console.error('[consumer-access] email retry failed', { grantId: grant.id })
    return fail(t('errors.email-failed'))
  }
  revalidatePath('/consumers')
  return done(t('emailSent'))
}

/** The stable gift ID prevents a stale confirmation from revoking a new gift. */
export async function revokeConsumerAccess(grantId: string): Promise<ActionResult> {
  const session = await verifyConsumerAdmin()
  const t = await getTranslations('Consumers')
  if (!z.string().trim().min(1).max(128).safeParse(grantId).success) return fail(t('errors.grant-unavailable'))
  try {
    const result = await revokeConsumerPremium(grantId, session.user.id)
    revalidatePath('/consumers')
    return done(t(result.alreadyRevoked ? 'alreadyRevoked' : 'revoked'))
  } catch (error) {
    if (error instanceof ConsumerAccessError) return fail(t(`errors.${error.reason}`))
    console.error('[consumer-access] revocation transaction failed')
    return fail(t('errors.revoke-failed'))
  }
}
