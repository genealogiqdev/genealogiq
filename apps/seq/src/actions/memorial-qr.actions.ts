'use server'

import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import { ok, fail, type ActionResult } from '@genealogiq/core'
import { InsufficientCreditsError } from '@genealogiq/services/credits'
import { verifyTenantSession } from '@/lib/dal'
import { prisma } from '@/lib/prisma'
import { issueCustomerMemorialQr, MemorialQrError } from '@/lib/memorial-qr'

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

  const session = await verifyTenantSession()
  try {
    const result = await prisma.$transaction((tx) => issueCustomerMemorialQr(tx, {
      ...parsed.data, tenantId: session.customerId, actorId: session.user.id,
    }), { timeout: 15_000 })
    if (result.issued) {
      revalidatePath('/inventory/activations')
      revalidatePath('/dashboard')
      revalidatePath('/customers')
      revalidatePath(`/customers/${parsed.data.customerId}`)
    }
    return ok({ profileUrl: result.profileUrl })
  } catch (error) {
    if (error instanceof MemorialQrError) return fail(t(`qrCode.${error.reason}`))
    if (error instanceof InsufficientCreditsError) return fail(t('qrCode.noCredit'))
    throw error
  }
}
