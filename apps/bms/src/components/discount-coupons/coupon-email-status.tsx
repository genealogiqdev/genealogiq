'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@genealogiq/ui/button'
import { retryManualCouponEmail } from '@/actions/manual-coupon.actions'

export function CouponEmailStatus({ id, sent }: { id: string; sent: boolean }) {
  const t = useTranslations('ManualCoupons')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (sent) return <p className="mt-2 text-sm text-muted-foreground">{t('emailSent')}</p>
  return <div className="mt-2 space-y-1">
    <p className="text-sm text-amber-600 dark:text-amber-400">{t('emailPending')}</p>
    <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => {
      try {
        const result = await retryManualCouponEmail(id)
        if (result.ok) toast.success(result.message)
        else toast.warning(result.message)
        router.refresh()
      } catch {
        toast.warning(t('appliedEmailPending'))
      }
    })}>{pending ? t('emailSending') : t('emailRetry')}</Button>
  </div>
}
