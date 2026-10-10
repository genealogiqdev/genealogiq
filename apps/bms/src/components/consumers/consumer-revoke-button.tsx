'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@genealogiq/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { revokeConsumerAccess } from '@/actions/consumer.actions'

export function ConsumerRevokeButton({ grantId, consumerName }: { grantId: string; consumerName: string }) {
  const t = useTranslations('Consumers')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return <AlertDialog open={open} onOpenChange={(next) => {
    if (!pending) { setOpen(next); setError(null) }
  }}>
    <AlertDialogTrigger asChild>
      <Button variant="outline" size="sm" className="text-destructive" disabled={pending}>{t('revoke')}</Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('revokeTitle')}</AlertDialogTitle>
        <AlertDialogDescription>{t('revokeDescription', { name: consumerName })}</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{t('keepPremium')}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={pending} onClick={(event) => {
          event.preventDefault()
          setError(null)
          startTransition(async () => {
            try {
              const result = await revokeConsumerAccess(grantId)
              if (!result.ok) { setError(result.message); return }
              toast.success(result.message)
              setOpen(false)
              router.refresh()
            } catch {
              setError(t('errors.connection'))
            }
          })
        }}>{t(pending ? 'revoking' : 'revoke')}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
