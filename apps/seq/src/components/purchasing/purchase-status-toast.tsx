'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

export function PurchaseStatusToast({ kind = 'plan' }: { kind?: 'plan' | 'package' }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const t = useTranslations('Purchasing')
  const packageT = useTranslations('GenCodePackages')
  const status = params.get('status')

  useEffect(() => {
    if (status === 'success') {
      toast.success(kind === 'package' ? packageT('toasts.success') : t('toasts.success'))
    } else if (status === 'cancel') {
      toast.info(t('toasts.canceled'))
    }
    if (status) router.replace(pathname)
  }, [status, pathname, router, t, packageT, kind])

  return null
}
