'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { done, fail, type ActionResult } from '@genealogiq/core'
import { prisma } from '@/lib/prisma'
import { verifyConsumerAdmin } from '@/lib/consumer-access'
import { getConsumerPartnerSchema } from '@/schemas/consumer-partner.schema'
import { identityTranslator } from '@/schemas/i18n'

/** Link an independent account without transferring its profiles, sales or gifts. */
export async function linkConsumerPartner(appUserId: string, tenantId: string): Promise<ActionResult> {
  const session = await verifyConsumerAdmin()
  const t = await getTranslations('ConsumerPartner')
  const parsed = getConsumerPartnerSchema(identityTranslator).safeParse({ appUserId, tenantId })
  if (!parsed.success) return fail(t('errors.invalidData'))

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialize with grants and other link attempts; an old screen cannot
      // move the customer away from a company chosen by another operator.
      await tx.$queryRaw`SELECT id FROM app_users WHERE id = ${parsed.data.appUserId} FOR UPDATE`
      const consumer = await tx.appUser.findFirst({
        where: { id: parsed.data.appUserId, role: 'APP_USER' }, select: { tenantId: true },
      })
      if (!consumer) return 'consumerUnavailable' as const
      if (consumer.tenantId === parsed.data.tenantId) return 'alreadyLinked' as const
      if (consumer.tenantId) return 'alreadyAssigned' as const

      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${parsed.data.tenantId} FOR SHARE`
      const partner = await tx.tenant.findFirst({
        where: { id: parsed.data.tenantId, isActive: true, users: { some: { isActive: true } } },
        select: { id: true },
      })
      if (!partner) return 'partnerUnavailable' as const

      const updated = await tx.appUser.updateMany({
        where: { id: parsed.data.appUserId, role: 'APP_USER', tenantId: null },
        data: { tenantId: partner.id, updatedById: session.user.id },
      })
      return updated.count === 1 ? 'linked' as const : 'alreadyAssigned' as const
    }, { timeout: 15_000 })
    if (result !== 'linked' && result !== 'alreadyLinked') return fail(t(`errors.${result}`))
    revalidatePath('/consumers')
    revalidatePath('/sales/partner-gencodes')
    return done(t(result))
  } catch {
    console.error('[consumer-partner] link transaction failed')
    return fail(t('errors.failed'))
  }
}
