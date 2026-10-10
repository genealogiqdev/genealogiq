'use server'

import { revalidatePath } from 'next/cache'
import { getLocale, getTranslations } from 'next-intl/server'
import { currencyForLocale, ok, fail, type ActionResult } from '@genealogiq/core'
import { redeemManualCoupon, ManualCouponError, type ManualCouponResult } from '@genealogiq/services/manual-coupon'
import { verifyAdmin } from '@/lib/dal'
import { provisionTenantAccess } from '@/lib/billing'
import { prisma } from '@/lib/prisma'
import { deliverEmail } from '@genealogiq/services/email-outbox'
import { manualSaleEmailId, queueManualSaleEmail } from '@genealogiq/services/sale-notifications'
import { z } from 'zod'
import { getManualCouponSchema, type ManualCouponFormValues } from '@/schemas/manual-coupon.schema'
import { identityTranslator } from '@/schemas/i18n'

type AppliedCoupon = ManualCouponResult & { accessPending?: boolean; emailPending?: boolean }

export async function applyManualCoupon(data: ManualCouponFormValues): Promise<ActionResult<AppliedCoupon>> {
  const session = await verifyAdmin()
  const t = await getTranslations('ManualCoupons')
  const parsed = getManualCouponSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(t('errors.invalid-data'))

  try {
    const result = await redeemManualCoupon({
      ...parsed.data, createdById: session.user.id,
      currency: currencyForLocale(await getLocale()).toUpperCase(),
    })
    // A newly registered partner's OWNER starts inactive. Settling outside
    // Stripe must open the same SEQ access as a verified payment webhook.
    // A later invitation failure must never report the committed sale as failed.
    let accessPending = false
    if (parsed.data.kind !== 'consumer') {
      try {
        await provisionTenantAccess(parsed.data.tenantId!)
      } catch {
        accessPending = true
        console.error('[manual-coupon] sale applied; partner access needs follow-up', { id: result.id })
      }
    }
    const emailPending = await deliverEmail(manualSaleEmailId(result.id)) !== 'sent'
    revalidatePath('/sales/discount-coupons')
    revalidatePath('/sales/discount-coupons/redeem')
    revalidatePath('/sales/contracts')
    revalidatePath('/gencodes')
    revalidatePath('/customers')
    return ok({ ...result, ...(accessPending && { accessPending: true }), ...(emailPending && { emailPending: true }) },
      t(accessPending ? 'appliedAccessPending' : emailPending ? 'appliedEmailPending' : result.alreadyApplied ? 'alreadyApplied' : 'applied'))
  } catch (error) {
    if (error instanceof ManualCouponError) return fail(t(`errors.${error.reason}`))
    console.error('[manual-coupon] redemption failed', error)
    return fail(t('errors.failed'))
  }
}

/** Sends only the receipt; never repeats the settlement or grants more benefits. */
export async function retryManualCouponEmail(redemptionId: string): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('ManualCoupons')
  if (!z.string().min(1).max(200).safeParse(redemptionId).success) return fail(t('errors.invalid-data'))
  try {
    const id = await prisma.$transaction((tx) => queueManualSaleEmail(tx, redemptionId))
    if (!id) return fail(t('emailUnavailable'))
    const state = await deliverEmail(id, { force: true })
    revalidatePath('/sales/discount-coupons/redeem')
    return state === 'sent' ? ok(undefined, t('emailSent')) : fail(t('appliedEmailPending'))
  } catch {
    return fail(t('appliedEmailPending'))
  }
}
