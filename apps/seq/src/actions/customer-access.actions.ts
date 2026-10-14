'use server'

import { revalidatePath } from 'next/cache'
import { getLocale, getTranslations } from 'next-intl/server'
import { currencyForLocale, done, fail, type ActionResult } from '@genealogiq/core'
import { grantPartnerConsumerPremium, revokePartnerConsumerPremium, recordCustomerGenCodeSale, PartnerConsumerAccessError } from '@genealogiq/services/partner-consumer-access'
import { InsufficientCreditsError } from '@genealogiq/services/credits'
import { deliverEmail } from '@genealogiq/services/email-outbox'
import { prisma } from '@/lib/prisma'
import { verifyCustomerAccessAdmin } from '@/lib/customer-access'
import { getCustomerPremiumSchema, getCustomerRevokeSchema, getCustomerGenCodeSaleSchema } from '@/schemas/customer-access.schema'
import { identityTranslator } from '@/schemas/i18n'

function refresh(appUserId: string) {
  revalidatePath('/customers')
  revalidatePath(`/customers/${appUserId}`)
  revalidatePath('/inventory/activations')
  revalidatePath('/dashboard')
}

export async function grantCustomerPremium(appUserId: string, requestId: string): Promise<ActionResult> {
  const session = await verifyCustomerAccessAdmin()
  const t = await getTranslations('PremiumAccess')
  const parsed = getCustomerPremiumSchema(identityTranslator).safeParse({ appUserId, requestId })
  if (!parsed.success) return fail(t('errors.invalid-data'))
  const currency = currencyForLocale(await getLocale()).toUpperCase()
  try {
    const result = await prisma.$transaction((tx) => grantPartnerConsumerPremium(tx, {
      ...parsed.data, tenantId: session.customerId, actorId: session.user.id, currency,
    }), { timeout: 15_000 })
    refresh(appUserId)
    return done(t(result.alreadyGranted ? 'alreadyGranted' : 'granted'))
  } catch (error) {
    if (error instanceof PartnerConsumerAccessError) return fail(t(`errors.${error.reason}`))
    console.error('[seq] customer Premium grant failed')
    return fail(t('errors.failed'))
  }
}

export async function revokeCustomerPremium(appUserId: string, grantId: string): Promise<ActionResult> {
  const session = await verifyCustomerAccessAdmin()
  const t = await getTranslations('PremiumAccess')
  const parsed = getCustomerRevokeSchema(identityTranslator).safeParse({ appUserId, grantId })
  if (!parsed.success) return fail(t('errors.invalid-data'))
  try {
    await prisma.$transaction((tx) => revokePartnerConsumerPremium(tx, {
      ...parsed.data, tenantId: session.customerId, actorId: session.user.id,
    }), { timeout: 15_000 })
    refresh(appUserId)
    return done(t('revoked'))
  } catch (error) {
    if (error instanceof PartnerConsumerAccessError) return fail(t(`errors.${error.reason}`))
    console.error('[seq] customer Premium revocation failed')
    return fail(t('errors.failed'))
  }
}

/** Existing customers identify the delivered code, so retries cannot allocate a second unit. */
export async function sellCustomerGenCode(appUserId: string, genCode: string, requestId: string): Promise<ActionResult> {
  const session = await verifyCustomerAccessAdmin()
  const t = await getTranslations('PremiumAccess')
  const parsed = getCustomerGenCodeSaleSchema(identityTranslator).safeParse({ appUserId, genCode, requestId })
  if (!parsed.success) return fail(t('errors.invalid-data'))
  const currency = currencyForLocale(await getLocale()).toUpperCase()
  let result
  try {
    result = await prisma.$transaction((tx) => recordCustomerGenCodeSale(tx, {
      ...parsed.data, tenantId: session.customerId, actorId: session.user.id, currency,
    }), { timeout: 15_000 })
  } catch (error) {
    if (error instanceof PartnerConsumerAccessError) return fail(t(`errors.${error.reason}`))
    if (error instanceof InsufficientCreditsError) return fail(t('errors.no-credit'))
    console.error('[seq] customer GenCode sale failed')
    return fail(t('errors.failed'))
  }
  refresh(appUserId)
  let pending = false
  if (result.emailId) {
    try { pending = await deliverEmail(result.emailId) !== 'sent' } catch { pending = true }
  }
  return done(t(pending ? 'soldEmailPending' : result.alreadySold ? 'alreadySold' : 'sold', { code: result.genCode }))
}
