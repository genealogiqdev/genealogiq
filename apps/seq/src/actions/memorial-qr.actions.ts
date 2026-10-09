'use server'

import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import { ok, fail, type ActionResult } from '@genealogiq/core'
import { getCustomer } from '@/queries/customers'

const inputSchema = z.object({
  customerId: z.string().trim().min(1).max(100),
  profileId: z.string().trim().min(1).max(100),
})

export async function getCustomerMemorialQr(
  customerId: string,
  profileId: string,
): Promise<ActionResult<{ profileUrl: string }>> {
  const t = await getTranslations('Actions')
  const parsed = inputSchema.safeParse({ customerId, profileId })
  if (!parsed.success) return fail(t('common.invalidData'))

  // Rechecks tenant, accepted guardianship and the customer's live plan on
  // opening the preview AND on every export, including after a plan expires.
  const customer = await getCustomer(parsed.data.customerId)
  const profile = customer?.guardiansOf.find(({ appUser }) => appUser.id === parsed.data.profileId)?.appUser
  if (!profile) return fail(t('qrCode.notFound'))
  if (profile.qrAccess !== 'allowed') return fail(t(`qrCode.${profile.qrAccess}`))

  return ok({ profileUrl: profile.profileUrl })
}
