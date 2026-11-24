import { Stack, useLocalSearchParams } from 'expo-router'
import { useRef, useState } from 'react'
import { View } from 'react-native'
import { ApiError } from '@/api/client'
import { seqApi, type BusinessCustomerView, type BusinessSaleRow } from '@/api/seq'
import { Notice } from '@/features/seq/forms'
import { formatGenCode, parseAmount, uuid } from '@/features/seq/util'
import { useT } from '@/i18n'
import { formatDateTime, formatMoney } from '@/lib/format'
import { qrPrintSheetHtml } from '@/lib/qr'
import { useInvalidate, useView } from '@/lib/query'
import { printHtml, shareFile } from '@/lib/share'
import { Button, Card, EmptyState, Field, LinkText, Muted, QueryView, Screen, Section, Text, useAction, useNotify } from '@/ui'

// Lot prices are recorded in reais, as the web form states.
const LOT_CURRENCY = 'BRL'

/** The pasted list, normalised the way the server does (upper case, no dashes). */
const parseCodes = (raw: string): string[] =>
  raw
    .trim()
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((code) => code.replace(/-/g, ''))

function SaleForm({ customerId, active }: { customerId: string; active: boolean }) {
  const t = useT('BusinessCustomers')
  const invalidate = useInvalidate('seq')
  const { run, pending } = useAction()
  const [quantity, setQuantity] = useState('1')
  const [codes, setCodes] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  // The id is reused while the same data is retried and replaced once the data changes.
  const request = useRef<{ id: string; values: string } | null>(null)

  async function sell() {
    const count = Number(quantity)
    const list = parseCodes(codes)
    const unitValue = parseAmount(price)
    const quantityOk = /^\d+$/.test(quantity.trim()) && count >= 1 && count <= 100
    const listOk = list.length === 0 || (list.length === count && new Set(list).size === count && list.every((code) => /^[A-Z0-9]{1,100}$/.test(code)))
    if (!quantityOk || !listOk || unitValue === null) {
      setError(t('invalidSale'))
      return
    }
    setError(null)
    const genCode = codes.trim()
    const values = JSON.stringify({ count, genCode, unitValue })
    if (!request.current || request.current.values !== values) request.current = { id: uuid(), values }
    const requestId = request.current.id
    await run(() => seqApi.sellBusinessGenCodes(customerId, { requestId, quantity: count, genCode, unitValue }), {
      success: true,
      onSuccess: async () => {
        request.current = null
        setCodes('')
        await invalidate(['businessCustomer', customerId], ['businessCustomers'], ['activations'], ['dashboard'])
      },
    })
  }

  const off = pending || !active
  return (
    <View className="gap-4">
      <Muted>{t('saleHelp')}</Muted>
      <Field label={t('quantity')} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" maxLength={3} disabled={off} />
      <Field label={t('specificCode')} value={codes} onChangeText={setCodes} multiline autoCapitalize="characters" autoCorrect={false} disabled={off} />
      <Field label={t('unitValue')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" disabled={off} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {active ? null : <Notice>{t('inactive')}</Notice>}
      <Button label={pending ? t('saving') : t('sell')} icon="cart-outline" onPress={() => void sell()} loading={pending} disabled={!active} fullWidth />
    </View>
  )
}

function Lot({ customerId, sale }: { customerId: string; sale: BusinessSaleRow }) {
  const t = useT('BusinessCustomers')
  const notify = useNotify()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState<'txt' | 'print' | null>(null)
  const empty = sale.activeCodes.length === 0

  async function exportTxt() {
    setBusy('txt')
    try {
      // Read fresh so a code delivered or activated meanwhile is left out.
      const lot = await seqApi.businessLotCodes(customerId, sale.id)
      await shareFile(lot.filename, lot.codes.join('\r\n'), { mimeType: 'text/plain' })
    } catch (failure) {
      notify.error(failure)
    } finally {
      setBusy(null)
    }
  }

  async function print() {
    setBusy('print')
    try {
      const sheet = await seqApi.businessLotPrintSheet(customerId, sale.id)
      await printHtml(qrPrintSheetHtml(sheet.filename.replace(/\.html$/i, ''), sheet.codes.map((code) => ({ label: formatGenCode(code.genCode), url: code.url }))))
    } catch (failure) {
      // An API failure is localised; anything else is the QR/print step.
      notify.error(failure instanceof ApiError ? failure : t('qrFailed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <Text>{`${formatDateTime(sale.createdAt)} · ${t('saleSummary', { quantity: sale.quantity, active: sale.activeCodes.length })}`}</Text>
      {sale.unitValue !== null ? <Muted>{`${t('unitValue')}: ${formatMoney(sale.unitValue, LOT_CURRENCY)}`}</Muted> : null}
      <LinkText label={t('viewBatchCodes')} onPress={() => setExpanded((value) => !value)} />
      {expanded ? (
        <Muted className="font-mono" selectable>
          {sale.codes.map(formatGenCode).join(', ')}
        </Muted>
      ) : null}
      <Button label={t('downloadCodes')} icon="document-text-outline" variant="secondary" onPress={() => void exportTxt()} loading={busy === 'txt'} disabled={empty || busy !== null} fullWidth />
      <Button label={t('downloadBatchQr')} icon="print-outline" variant="secondary" onPress={() => void print()} loading={busy === 'print'} disabled={empty || busy !== null} fullWidth />
    </Card>
  )
}

function Sales({ view }: { view: BusinessCustomerView }) {
  const t = useT('BusinessCustomers')
  const tm = useT('Mobile.seq.business')
  return (
    <>
      <SaleForm customerId={view.company.id} active={view.company.isActive} />
      <Section title={tm('lots')}>
        {view.sales.length === 0 ? <EmptyState title={t('noSales')} icon="cube-outline" /> : view.sales.map((sale) => <Lot key={sale.id} customerId={view.company.id} sale={sale} />)}
      </Section>
    </>
  )
}

export default function SeqBusinessSales() {
  const t = useT('BusinessCustomers')
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useView('seq', ['businessCustomer', id], () => seqApi.businessCustomer(id))
  return (
    <>
      <Stack.Screen options={{ title: t('salesTitle') }} />
      <QueryView query={query}>
        {(view) => (
          <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
            <Sales view={view} />
          </Screen>
        )}
      </QueryView>
    </>
  )
}
