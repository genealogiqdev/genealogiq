'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { PremiumAccessControl } from '@genealogiq/ui/premium-access-control'
import { Button } from '@genealogiq/ui/button'
import { Input } from '@genealogiq/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@genealogiq/ui/dialog'
import { grantCustomerPremium, revokeCustomerPremium, sellCustomerGenCode } from '@/actions/customer-access.actions'

export function CustomerAccessControls({ appUserId, consumerName, grantId, canGrant, showSale = false }: {
  appUserId: string; consumerName: string; grantId: string | null; canGrant: boolean; showSale?: boolean
}) {
  return <div className="flex flex-wrap gap-2">
    <PremiumAccessControl consumerName={consumerName} grantId={grantId} canGrant={canGrant}
      grant={(requestId) => grantCustomerPremium(appUserId, requestId)} revoke={(id) => revokeCustomerPremium(appUserId, id)} />
    {showSale && canGrant && <CustomerGenCodeSale appUserId={appUserId} consumerName={consumerName} />}
  </div>
}

function CustomerGenCodeSale({ appUserId, consumerName }: { appUserId: string; consumerName: string }) {
  const t = useTranslations('PremiumAccess')
  const router = useRouter()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [genCode, setGenCode] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); setError(null) } }}>
    <DialogTrigger asChild><Button type="button" variant="outline" size="sm">{t('recordSale')}</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>{t('recordSale')}</DialogTitle><DialogDescription>{t('existingSaleDescription', { name: consumerName })}</DialogDescription></DialogHeader>
      <form onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
          try {
            const result = await sellCustomerGenCode(appUserId, genCode, requestId)
            if (!result.ok) { setError(result.message); return }
            toast.success(result.message)
            setOpen(false); setGenCode(''); setRequestId(crypto.randomUUID()); router.refresh()
          } catch { setError(t('errors.failed')) }
        })
      }} className="space-y-4">
        <div className="space-y-2"><label htmlFor={id} className="text-sm font-medium">{t('code')}</label>
          <Input id={id} required maxLength={64} value={genCode} disabled={pending} onChange={(event) => setGenCode(event.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" />
          <p className="text-sm text-muted-foreground">{t('existingSaleHelp')}</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>{t('cancel')}</Button>
          <Button type="submit" disabled={pending}>{t(pending ? 'saving' : 'confirmSale')}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
