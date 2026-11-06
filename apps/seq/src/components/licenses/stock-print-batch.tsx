'use client'
import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@genealogiq/ui/button'
import { Input } from '@genealogiq/ui/input'
import { prepareGenCodePrintBatch, markGenCodeBatchPrinted } from '@/actions/gencode.actions'
import { downloadGenCodeBatch } from '@/lib/download-gencode-batch'

export function StockPrintBatch() {
  const t = useTranslations('BusinessCustomers'); const locale = useLocale(); const router = useRouter()
  const [pending, setPending] = useState(false); const [message, setMessage] = useState(''); const [batch, setBatch] = useState<string[]>([])
  return <section className="rounded-lg border p-4 space-y-3">
    <h2 className="text-xl font-semibold">{t('stockPrintTitle')}</h2><p>{t('stockPrintHelp')}</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={async event => {
      event.preventDefault(); if (pending) return
      const quantity = Number(new FormData(event.currentTarget).get('quantity'))
      setPending(true); setMessage(''); setBatch([])
      try {
        const result = await prepareGenCodePrintBatch(quantity)
        if (!result.ok || !result.data) { setMessage(result.message ?? ''); return }
        await downloadGenCodeBatch(result.data.codes, result.data.appBaseUrl, locale, t('printHelp'), 'QR-Codes-estoque.html')
        setBatch(result.data.codes)
      } catch { setMessage(t('qrFailed')) } finally { setPending(false) }
    }}>
      <label htmlFor="stock-print-quantity">{t('quantity')}<Input id="stock-print-quantity" name="quantity" type="number" min="1" max="100" step="1" defaultValue="20" required disabled={pending} /></label>
      <Button disabled={pending}>{t('stockPrintDownload')}</Button>
    </form>
    {batch.length > 0 && <div className="space-y-2"><p>{t('stockPrintReady', { quantity: batch.length })}</p><p className="font-mono text-sm break-all">{batch.join(', ')}</p>
      <Button variant="outline" disabled={pending} onClick={async () => {
        setPending(true)
        try { const result = await markGenCodeBatchPrinted(batch); setMessage(result.message ?? ''); if (result.ok) { setBatch([]); router.refresh() } }
        catch { setMessage(t('stockPrintFailed')) } finally { setPending(false) }
      }}>{t('stockPrintConfirm')}</Button></div>}
    {message && <p role="status">{message}</p>}
  </section>
}
