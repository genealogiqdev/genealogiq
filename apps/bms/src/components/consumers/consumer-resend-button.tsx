'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@genealogiq/ui/button'
import { resendConsumerAccessEmail } from '@/actions/consumer.actions'

export function ConsumerResendButton({ appUserId, onSent }: { appUserId: string; onSent?: () => void }) {
  const t = useTranslations('Consumers')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => {
    try {
      const result = await resendConsumerAccessEmail(appUserId)
      if (!result.ok) { toast.error(result.message); return }
      toast.success(result.message)
      onSent?.()
      router.refresh()
    } catch {
      toast.error(t('errors.connection'))
    }
  })}>{t(pending ? 'sending' : 'resend')}</Button>
}
