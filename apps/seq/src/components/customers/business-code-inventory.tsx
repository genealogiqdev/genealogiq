'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@genealogiq/ui/data-table'
import { Button } from '@genealogiq/ui/button'
import { Badge } from '@genealogiq/ui/badge'
import { Input } from '@genealogiq/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@genealogiq/ui/dialog'
import { deliverBusinessGenCode, resendBusinessGenCode } from '@/actions/business-customer.actions'
import type { BusinessCodeState } from '@/lib/business-code-status'

export type BusinessCodeRow = { genCode: string; state: BusinessCodeState; url: string; expiresAt: Date | null;
  recipient: { id: string; name: string; email: string | null } | null }
export function BusinessCodeInventory({ customerId, active, canDeliver, codes }: {
  customerId: string; active: boolean; canDeliver: boolean; codes: BusinessCodeRow[]
}) {
  const t = useTranslations('BusinessCustomers')
  const router = useRouter()
  const [selected, setSelected] = useState<BusinessCodeRow | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('all')
  const columns: ColumnDef<BusinessCodeRow>[] = [
    { accessorKey: 'genCode', header: t('code'), cell: ({ row }) => <span className="font-mono">{row.original.genCode}</span> },
    { accessorKey: 'state', header: t('codeStatus'), cell: ({ row }) => <Badge variant="outline">{t(`codeStates.${row.original.state}`)}</Badge> },
    { id: 'recipient', header: t('recipient'), cell: ({ row }) => row.original.recipient
      ? <Link href={`/customers/${row.original.recipient.id}`} className="underline">{row.original.recipient.name}<br />{row.original.recipient.email}</Link> : '—' },
    { id: 'actions', enableHiding: false, cell: ({ row }) => <div className="flex flex-wrap gap-2">
      {row.original.state === 'available' && canDeliver && <Button disabled={!active} onClick={() => { setSelected(row.original); setMessage('') }}>{t('deliverCode')}</Button>}
      {row.original.recipient && <Button variant="outline" disabled={pending} onClick={async () => {
        setPending(true)
        try { const result = await resendBusinessGenCode(customerId, row.original.genCode); setMessage(result.message ?? '') }
        catch { setMessage(t('accessEmailPending')) }
        finally { setPending(false) }
      }}>{t('resendAccess')}</Button>}
      <Button variant="outline" onClick={async () => {
        try {
          const QRCode = (await import('qrcode')).default
          const svg = await QRCode.toString(row.original.url, { type: 'svg', margin: 4, errorCorrectionLevel: 'H' })
          const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
          const link = document.createElement('a'); link.href = url; link.download = `${row.original.genCode}.svg`; link.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch { setMessage(t('qrFailed')) }
      }}>{t('downloadQr')}</Button>
    </div> },
  ]
  return <section className="flex flex-col gap-4">
    <h2 className="text-2xl font-semibold">{t('inventoryTitle')}</h2>
    <p>{t('inventoryHelp')}</p>
    <div className="grid gap-3 sm:grid-cols-4">
      {(['available', 'assigned', 'activated', 'expired'] as const).map(state => <div key={state} className="rounded-lg border p-4"><p className="text-3xl font-semibold">{codes.filter(code => code.state === state).length}</p><p>{t(`codeStates.${state}`)}</p></div>)}
    </div>
    <label htmlFor="business-code-filter">{t('codeStatus')}<select id="business-code-filter" className="ml-3 rounded-md border p-2" value={filter} onChange={event => setFilter(event.target.value)}>
      <option value="all">{t('allCodes')}</option>
      {(['available', 'assigned', 'activated', 'expired'] as const).map(state => <option key={state} value={state}>{t(`codeStates.${state}`)}</option>)}
    </select></label>
    <DataTable columns={columns} data={codes.filter(code => filter === 'all' || code.state === filter)} filterColumn="genCode" emptyMessage={t('noCodes')} />
    {message && !selected && <p role="status">{message}</p>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !pending) setSelected(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('deliverCode')}: {selected?.genCode}</DialogTitle><DialogDescription>{t('deliveryHelp')}</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={async event => {
          event.preventDefault()
          if (!selected || pending) return
          const values = new FormData(event.currentTarget)
          setPending(true); setMessage('')
          try {
            const result = await deliverBusinessGenCode(customerId, { genCode: selected.genCode,
              firstName: String(values.get('firstName')), lastName: String(values.get('lastName')), email: String(values.get('email')),
            })
            setMessage(result.message ?? '')
            if (result.ok) { setSelected(null); router.refresh() }
          } catch { setMessage(t('deliveryFailed')) }
          finally { setPending(false) }
        }}>
          <label htmlFor="recipient-first-name">{t('firstName')}<Input id="recipient-first-name" name="firstName" required maxLength={100} disabled={pending} /></label>
          <label htmlFor="recipient-last-name">{t('lastName')}<Input id="recipient-last-name" name="lastName" required maxLength={100} disabled={pending} /></label>
          <label htmlFor="recipient-email">{t('fields.email')}<Input id="recipient-email" name="email" type="email" required disabled={pending} /></label>
          {message && <p role="status">{message}</p>}
          <Button type="submit" disabled={pending}>{pending ? t('saving') : t('confirmDelivery')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </section>
}
