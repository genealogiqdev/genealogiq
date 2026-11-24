import { Stack } from 'expo-router'
import { useState } from 'react'
import { seqApi, type QrTarget } from '@/api/seq'
import { Notice } from '@/features/seq/forms'
import { formatGenCode } from '@/features/seq/util'
import { useT } from '@/i18n'
import { qrPrintSheetHtml } from '@/lib/qr'
import { useInvalidate } from '@/lib/query'
import { printHtml } from '@/lib/share'
import { Button, Card, Field, Muted, Screen, Text, useAction, useNotify } from '@/ui'

export default function SeqStockPrintBatch() {
  const t = useT('BusinessCustomers')
  const tm = useT('Mobile.seq.business')
  const notify = useNotify()
  const invalidate = useInvalidate('seq')
  const confirmAction = useAction()
  const [quantity, setQuantity] = useState('20')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [batch, setBatch] = useState<QrTarget[]>([])

  async function print(codes: QrTarget[]) {
    try {
      await printHtml(qrPrintSheetHtml(t('stockPrintTitle'), codes.map((code) => ({ label: formatGenCode(code.genCode), url: code.url }))))
    } catch {
      notify.error(t('qrFailed'))
    }
  }

  async function prepare() {
    const count = Number(quantity)
    if (!/^\d+$/.test(quantity.trim()) || count < 1 || count > 100) {
      setError(tm('quantityInvalid'))
      return
    }
    setError(null)
    setMessage('')
    setBatch([])
    setLoading(true)
    try {
      const result = await seqApi.stockPrintBatch(count)
      if (!result.ok || result.codes.length === 0) {
        setMessage(result.message || t('stockPrintUnavailable'))
        return
      }
      setBatch(result.codes)
      await print(result.codes)
    } catch (failure) {
      notify.error(failure)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: t('stockPrintTitle') }} />
      <Screen>
        <Muted>{t('stockPrintHelp')}</Muted>
        <Field
          label={t('quantity')}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="number-pad"
          maxLength={3}
          error={error}
          disabled={loading || confirmAction.pending}
        />
        <Button label={t('stockPrintDownload')} icon="print-outline" onPress={() => void prepare()} loading={loading} disabled={confirmAction.pending} fullWidth />
        {message ? <Notice tone="danger">{message}</Notice> : null}
        {batch.length > 0 ? (
          <Card>
            <Text>{t('stockPrintReady', { quantity: batch.length })}</Text>
            <Muted className="font-mono" selectable>
              {batch.map((code) => formatGenCode(code.genCode)).join(', ')}
            </Muted>
            <Button label={t('downloadBatchQr')} icon="print-outline" variant="secondary" onPress={() => void print(batch)} disabled={confirmAction.pending} fullWidth />
            <Button
              label={t('stockPrintConfirm')}
              icon="checkmark-done-outline"
              loading={confirmAction.pending}
              onPress={() =>
                void confirmAction.run(() => seqApi.markGenCodeBatchPrinted(batch.map((code) => code.genCode)), {
                  success: t('stockPrintRecorded'),
                  onSuccess: async () => {
                    setBatch([])
                    await invalidate(['activations'], ['activation'])
                  },
                })
              }
              fullWidth
            />
          </Card>
        ) : null}
      </Screen>
    </>
  )
}
