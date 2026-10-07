'use server'

import { revalidatePath } from 'next/cache'
import { getLocale, getTranslations } from 'next-intl/server'
import { currencyForLocale, ok, fail, type ActionResult } from '@genealogiq/core'
import { redeemManualCoupon, ManualCouponError, type ManualCouponResult } from '@genealogiq/services/manual-coupon'
import { verifyAdmin } from '@/lib/dal'
import { provisionTenantAccess } from '@/lib/billing'
import { getManualCouponSchema, type ManualCouponFormValues } from '@/schemas/manual-coupon.schema'
import { identityTranslator } from '@/schemas/i18n'

type AppliedCoupon = ManualCouponResult & { accessPending?: boolean }

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
      } catch (error) {
        accessPending = true
        console.error('[manual-coupon] sale applied; partner access needs follow-up', error)
      }
    }
    revalidatePath('/sales/discount-coupons')
    revalidatePath('/sales/discount-coupons/redeem')
    revalidatePath('/sales/contracts')
    revalidatePath('/gencodes')
    revalidatePath('/customers')
    return ok(accessPending ? { ...result, accessPending: true } : result,
      t(accessPending ? 'appliedAccessPending' : result.alreadyApplied ? 'alreadyApplied' : 'applied'))
  } catch (error) {
    if (error instanceof ManualCouponError) return fail(t(`errors.${error.reason}`))
    console.error('[manual-coupon] redemption failed', error)
    return fail(t('errors.failed'))
  }
}
