'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@genealogiq/ui/button'
import { Input } from '@genealogiq/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@genealogiq/ui/dialog'
import { linkConsumerPartner } from '@/actions/consumer-partner.actions'

interface Props {
  appUserId: string
  consumerName: string
  partners: { id: string; name: string; tradeName: string }[]
}

export function ConsumerPartnerDialog({ appUserId, consumerName, partners }: Props) {
  const t = useTranslations('ConsumerPartner')
  const router = useRouter()
  const selectId = useId()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const selected = partners.find((partner) => partner.id === tenantId)
  const needle = search.trim().toLocaleLowerCase()
  const filtered = partners.filter((partner) => partner.id === tenantId
    || `${partner.name} ${partner.tradeName}`.toLocaleLowerCase().includes(needle))

  function submit() {
    if (!selected || pending) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await linkConsumerPartner(appUserId, selected.id)
        if (!result.ok) { setError(result.message ?? t('errors.failed')); return }
        toast.success(result.message ?? t('linked'))
        setOpen(false)
        router.refresh()
      } catch { setError(t('errors.failed')) }
    })
  }

  return <Dialog open={open} onOpenChange={(next) => {
    if (pending) return
    setOpen(next)
    if (next) { setSearch(''); setTenantId(''); setError(null) }
  }}>
    <DialogTrigger asChild><Button variant="outline" size="sm" className="mt-2 h-auto whitespace-normal">{t('trigger')}</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description', { name: consumerName })}</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => { event.preventDefault(); submit() }} className="space-y-4">
        <Input aria-label={t('search')} placeholder={t('search')} value={search} disabled={pending}
          onChange={(event) => setSearch(event.target.value)} />
        <div className="space-y-2">
          <label htmlFor={selectId} className="text-sm font-medium">{t('partner')}</label>
          <select id={selectId} required value={tenantId} disabled={pending} onChange={(event) => { setTenantId(event.target.value); setError(null) }}
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">
            <option value="">{t('placeholder')}</option>
            {filtered.map((partner) => <option key={partner.id} value={partner.id}>
              {partner.tradeName && partner.tradeName !== partner.name ? `${partner.tradeName} (${partner.name})` : partner.name}
            </option>)}
          </select>
          {filtered.length === 0 && <p role="status" className="text-sm text-muted-foreground">{t('empty')}</p>}
        </div>
        {selected && <p className="text-sm">{t('confirmDescription', { name: consumerName, partner: selected.tradeName || selected.name })}</p>}
        <p className="text-sm text-muted-foreground">{t('preserved')}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>{t('cancel')}</Button>
          <Button type="submit" disabled={!selected || pending}>{t(pending ? 'saving' : 'confirm')}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
