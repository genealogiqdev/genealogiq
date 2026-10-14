'use server'

import { revalidatePath } from 'next/cache'
import { getLocale, getTranslations } from 'next-intl/server'
import { currencyForLocale, done, fail, type ActionResult } from '@genealogiq/core'
import { grantPartnerConsumerPremium, revokePartnerConsumerPremium, PartnerConsumerAccessError } from '@genealogiq/services/partner-consumer-access'
import { prisma } from '@/lib/prisma'
import { verifyConsumerAdmin } from '@/lib/consumer-access'
import { getPartnerConsumerPremiumSchema, getPartnerConsumerRevokeSchema } from '@/schemas/partner-consumer.schema'
import { identityTranslator } from '@/schemas/i18n'

export async function grantPartnerPremium(appUserId: string, requestId: string): Promise<ActionResult> {
  const session = await verifyConsumerAdmin()
  const t = await getTranslations('PremiumAccess')
  const parsed = getPartnerConsumerPremiumSchema(identityTranslator).safeParse({ appUserId, requestId })
  if (!parsed.success) return fail(t('errors.invalid-data'))
  const currency = currencyForLocale(await getLocale()).toUpperCase()
  try {
    const result = await prisma.$transaction(async (tx) => {
      const recipient = await tx.appUser.findFirst({ where: { id: parsed.data.appUserId, role: 'APP_USER' }, select: { tenantId: true } })
      if (!recipient?.tenantId) throw new PartnerConsumerAccessError('customer-unavailable')
      return grantPartnerConsumerPremium(tx, { ...parsed.data, tenantId: recipient.tenantId, actorId: session.user.id, currency })
    }, { timeout: 15_000 })
    revalidatePath('/consumers')
    return done(t(result.alreadyGranted ? 'alreadyGranted' : 'granted'))
  } catch (error) {
    if (error instanceof PartnerConsumerAccessError) return fail(t(`errors.${error.reason}`))
    console.error('[bms] partner customer Premium grant failed')
    return fail(t('errors.failed'))
  }
}

export async function revokePartnerPremium(appUserId: string, grantId: string): Promise<ActionResult> {
  const session = await verifyConsumerAdmin()
  const t = await getTranslations('PremiumAccess')
  const parsed = getPartnerConsumerRevokeSchema(identityTranslator).safeParse({ appUserId, grantId })
  if (!parsed.success) return fail(t('errors.invalid-data'))
  try {
    await prisma.$transaction(async (tx) => {
      const recipient = await tx.appUser.findFirst({ where: { id: parsed.data.appUserId, role: 'APP_USER' }, select: { tenantId: true } })
      if (!recipient?.tenantId) throw new PartnerConsumerAccessError('customer-unavailable')
      return revokePartnerConsumerPremium(tx, { ...parsed.data, tenantId: recipient.tenantId, actorId: session.user.id })
    }, { timeout: 15_000 })
    revalidatePath('/consumers')
    return done(t('revoked'))
  } catch (error) {
    if (error instanceof PartnerConsumerAccessError) return fail(t(`errors.${error.reason}`))
    console.error('[bms] partner customer Premium revocation failed')
    return fail(t('errors.failed'))
  }
}
