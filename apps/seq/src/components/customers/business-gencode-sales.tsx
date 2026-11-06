'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@genealogiq/ui/button'
import { Input } from '@genealogiq/ui/input'
import { sellBusinessGenCodes } from '@/actions/business-customer.actions'
import { downloadGenCodeBatch } from '@/lib/download-gencode-batch'

export type BusinessSaleRow = { id: string; quantity: number; unitValue: number | null; createdAt: Date; codes: string[]; activeCodes: string[] }
export function BusinessGenCodeSales({ customerId, active, sales, appBaseUrl }: { customerId: string; active: boolean; sales: BusinessSaleRow[]; appBaseUrl: string }) {
  const t = useTranslations('BusinessCustomers')
  const locale = useLocale()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [requestValues, setRequestValues] = useState('')
  return <section className="flex flex-col gap-4">
    <h2 className="text-2xl font-semibold">{t('salesTitle')}</h2>
    <p className="text-muted-foreground">{t('saleHelp')}</p>
    <form className="flex max-w-2xl flex-col gap-3" onSubmit={async event => {
      event.preventDefault()
      if (pending) return
      const form = new FormData(event.currentTarget)
      const quantity = Number(form.get('quantity'))
      const genCode = String(form.get('genCode') ?? '').trim()
      const price = String(form.get('unitValue') ?? '')
      const unitValue = price ? Number(price) : undefined
      const values = JSON.stringify({ quantity, genCode, unitValue })
      const key = requestId && requestValues === values ? requestId : crypto.randomUUID()
      setRequestId(key); setRequestValues(values); setPending(true); setMessage('')
      try {
        const result = await sellBusinessGenCodes(customerId, { requestId: key, quantity, genCode, unitValue })
        setMessage(result.message ?? '')
        if (result.ok) { setRequestId(null); router.refresh() }
      } catch { setMessage(t('saleFailed')) }
      finally { setPending(false) }
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label htmlFor="business-quantity">{t('quantity')}<Input id="business-quantity" name="quantity" type="number" min="1" max="100" step="1" defaultValue="1" required disabled={pending || !active} /></label>
        <label htmlFor="business-code">{t('specificCode')}<textarea id="business-code" name="genCode" className="w-full rounded-md border p-2" rows={3} disabled={pending || !active} /></label>
        <label htmlFor="business-price">{t('unitValue')}<Input id="business-price" name="unitValue" type="number" min="0" max="1000000" step="0.01" disabled={pending || !active} /></label>
      </div>
      <Button disabled={pending || !active} type="submit">{pending ? t('saving') : t('sell')}</Button>
      {!active && <p>{t('inactive')}</p>}
      {message && <p role="status">{message}</p>}
    </form>
    {sales.length === 0 && <p>{t('noSales')}</p>}
    {sales.map(sale => <div key={sale.id} className="flex flex-col gap-2 rounded-lg border p-4">
      <p>{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(sale.createdAt)} · {t('saleSummary', { quantity: sale.quantity, active: sale.activeCodes.length })}</p>
      {sale.unitValue !== null && <p>{t('unitValue')}: {new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(sale.unitValue)}</p>}
      <details><summary className="cursor-pointer">{t('viewBatchCodes')}</summary><p className="break-all font-mono text-sm">{sale.codes.join(', ')}</p></details>
      <Button variant="outline" className="w-fit" onClick={() => {
        const blob = new Blob([sale.activeCodes.join('\r\n')], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a'); link.href = url; link.download = `GenCodes-${sale.id}.txt`; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }} disabled={sale.activeCodes.length === 0}>{t('downloadCodes')}</Button>
      <Button variant="outline" className="w-fit" onClick={async () => {
        try {
          await downloadGenCodeBatch(sale.activeCodes, appBaseUrl, locale, t('printHelp'), `QR-Codes-${sale.id}.html`)
        } catch { setMessage(t('qrFailed')) }
      }} disabled={sale.activeCodes.length === 0}>{t('downloadBatchQr')}</Button>
    </div>)}
  </section>
}
