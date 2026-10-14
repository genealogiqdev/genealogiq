'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './dialog'

interface Props {
  consumerName: string
  grantId?: string | null
  canGrant: boolean
  grant: (requestId: string) => Promise<{ ok: boolean; message?: string }>
  revoke: (grantId: string) => Promise<{ ok: boolean; message?: string }>
}

/** Both operator apps confirm the named recipient and retain a stable retry ID. */
export function PremiumAccessControl({ consumerName, grantId, canGrant, grant, revoke }: Props) {
  const t = useTranslations('PremiumAccess')
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [requestId, setRequestId] = React.useState(() => crypto.randomUUID())
  if (!grantId && !canGrant) return null

  return <Dialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); setError(null) } }}>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline" disabled={pending}>
      {t(grantId ? 'deactivate' : 'activate')}
    </Button></DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t(grantId ? 'deactivateTitle' : 'activateTitle')}</DialogTitle>
        <DialogDescription>{t(grantId ? 'deactivateDescription' : 'activateDescription', { name: consumerName })}</DialogDescription>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{t('stockUnchanged')}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>{t('cancel')}</Button>
        <Button type="button" variant={grantId ? 'destructive' : 'default'} disabled={pending} onClick={() => {
          setError(null)
          startTransition(async () => {
            try {
              const result = grantId ? await revoke(grantId) : await grant(requestId)
              if (!result.ok) { setError(result.message ?? t('errors.failed')); return }
              toast.success(result.message)
              setOpen(false)
              setRequestId(crypto.randomUUID())
              router.refresh()
            } catch { setError(t('errors.failed')) }
          })
        }}>{t(pending ? 'saving' : grantId ? 'deactivate' : 'activate')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
