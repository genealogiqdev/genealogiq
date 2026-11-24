import { Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { seqApi, type ActivationView } from '@/api/seq'
import { FormFields, useForm, type Spec } from '@/features/seq/forms'
import { fullName, parseAmount, text } from '@/features/seq/util'
import { QrExport } from '@/features/shared/QrExport'
import { useT } from '@/i18n'
import { formatDateTime, formatMoney } from '@/lib/format'
import { useInvalidate, useView } from '@/lib/query'
import { Badge, Button, Card, Heading, KeyValue, Muted, QueryView, Row, Screen, Sheet, confirm, useAction } from '@/ui'

// The web detail page reports sale values in this currency; the view carries none of its own.
const SALES_CURRENCY = 'USD'
const STATUS_COLOR = { AVAILABLE: 'success', SOLD: 'warning', ACTIVATED: 'accent' } as const

function SaleSheet({ mode, genCode, onClose, onDone }: { mode: 'manual' | 'platform'; genCode: string; onClose: () => void; onDone: () => Promise<unknown> }) {
  const t = useT('GenCode')
  const ta = useT('Actions.gencode')
  const form = useForm({ buyerName: '', firstName: '', lastName: '', email: '', value: '' })
  const specs: Spec[] =
    mode === 'manual'
      ? [
          { key: 'buyerName', label: t('fields.buyerName'), placeholder: t('placeholders.buyerName'), required: true, max: 200 },
          { key: 'value', label: t('fields.saleValue'), kind: 'decimal', placeholder: '0.00' },
        ]
      : [
          { key: 'firstName', label: t('fields.buyerFirstName'), required: true, max: 100 },
          { key: 'lastName', label: t('fields.buyerLastName'), required: true, max: 100 },
          { key: 'email', label: t('fields.buyerEmail'), kind: 'email', required: true },
          { key: 'value', label: t('fields.saleValue'), kind: 'decimal', placeholder: '0.00' },
        ]

  async function submit() {
    const value = parseAmount(text(form.values, 'value'), Number.MAX_SAFE_INTEGER)
    const valid = form.validate(specs, () => ({ value: value === null ? ta('invalidValue') : undefined }))
    if (!valid || value === null) return
    await form.submit(
      () =>
        mode === 'manual'
          ? seqApi.sellGenCodeManually(genCode, { buyerName: text(form.values, 'buyerName'), value })
          : seqApi.sellGenCodeViaPlatform(genCode, {
              firstName: text(form.values, 'firstName'),
              lastName: text(form.values, 'lastName'),
              email: text(form.values, 'email').toLowerCase(),
              value,
            }),
      {
        success: true,
        onSuccess: async () => {
          onClose()
          await onDone()
        },
      },
    )
  }

  return (
    <Sheet visible onClose={() => (form.pending ? undefined : onClose())} title={t(mode === 'manual' ? 'manualSale.title' : 'platformSale.title')}>
      <Muted>{t(mode === 'manual' ? 'manualSale.description' : 'platformSale.description')}</Muted>
      <FormFields specs={specs} form={form} />
      <Button
        label={t(mode === 'manual' ? 'manualSale.submit' : form.pending ? 'platformSale.submitting' : 'platformSale.submit')}
        onPress={() => void submit()}
        loading={form.pending}
        fullWidth
      />
    </Sheet>
  )
}

function Detail({ license, refresh, refreshing }: { license: ActivationView; refresh: () => Promise<unknown>; refreshing: boolean }) {
  const t = useT('GenCode')
  const tc = useT('Common')
  const { run, pending } = useAction()
  const invalidate = useInvalidate('seq')
  const [sale, setSale] = useState<'manual' | 'platform' | null>(null)
  const printed = license.printedAt != null
  const buyer = fullName(license.buyer) || license.soldToName

  const changed = () => invalidate(['activation', license.genCode], ['activations'], ['dashboard'], ['customers'], ['customer'])

  async function undo() {
    const accepted = await confirm({
      title: t('actions.undoSale'),
      message: t('undo.confirm'),
      confirmLabel: t('actions.undoSale'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!accepted) return
    await run(() => seqApi.undoGenCodeSale(license.genCode), {
      success: true,
      onSuccess: async () => {
        await changed()
      },
    })
  }

  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
      <Card>
        <Row className="justify-between">
          <Heading className="font-mono">{license.formattedGenCode}</Heading>
          <Badge label={t(`status.${license.status}`)} color={STATUS_COLOR[license.status] ?? 'default'} />
        </Row>
        <QrExport value={license.qrUrl} fileName={license.filename} />
      </Card>

      <Card>
        <Heading>{t('statusCard.title')}</Heading>
        <KeyValue label={t('timeline.created')} value={formatDateTime(license.createdAt)} />
        <KeyValue label={t('timeline.printed')} value={printed ? formatDateTime(license.printedAt) : '—'} />
        {license.status !== 'AVAILABLE' ? (
          <View>
            <KeyValue label={t('timeline.sold')} value={license.soldAt ? formatDateTime(license.soldAt) : '—'} />
            {license.soldVia ? <Muted>{t.has(`soldVia.${license.soldVia}`) ? t(`soldVia.${license.soldVia}`) : license.soldVia}</Muted> : null}
            {buyer ? <Muted>{t('timeline.soldTo', { name: buyer })}</Muted> : null}
            {license.buyer?.email ? <Muted>{license.buyer.email}</Muted> : null}
            {license.soldByName ? <Muted>{t('timeline.soldBy', { name: license.soldByName })}</Muted> : null}
            {license.soldValue != null ? <Muted>{t('timeline.soldFor', { value: formatMoney(license.soldValue, SALES_CURRENCY) })}</Muted> : null}
          </View>
        ) : null}
        {license.status === 'ACTIVATED' ? (
          <View>
            <KeyValue label={t('timeline.activated')} value={license.activatedAt ? formatDateTime(license.activatedAt) : '—'} />
            {license.memorial ? <Muted>{t('timeline.memorial', { name: fullName(license.memorial) })}</Muted> : null}
          </View>
        ) : null}
      </Card>

      <View className="gap-3">
        <Button
          label={t(printed ? 'actions.markNotPrinted' : 'actions.markPrinted')}
          icon="print-outline"
          variant="secondary"
          loading={pending}
          onPress={() =>
            void run(() => seqApi.markGenCodePrinted(license.genCode, !printed), {
              success: t(printed ? 'toasts.markedNotPrinted' : 'toasts.markedPrinted'),
              onSuccess: async () => {
                await invalidate(['activation', license.genCode], ['activations'])
              },
            })
          }
          fullWidth
        />
        {license.status === 'AVAILABLE' ? (
          <>
            <Button label={t('actions.manualWriteOff')} icon="create-outline" onPress={() => setSale('manual')} disabled={pending} fullWidth />
            <Button label={t('actions.sellViaPlatform')} icon="mail-outline" variant="secondary" onPress={() => setSale('platform')} disabled={pending} fullWidth />
          </>
        ) : null}
        {license.status === 'SOLD' ? (
          <Button label={t('actions.undoSale')} icon="arrow-undo-outline" variant="danger-soft" onPress={() => void undo()} disabled={pending} fullWidth />
        ) : null}
      </View>

      {sale ? <SaleSheet mode={sale} genCode={license.genCode} onClose={() => setSale(null)} onDone={changed} /> : null}
    </Screen>
  )
}

export default function SeqGenCodeDetail() {
  const t = useT('GenCode')
  const params = useLocalSearchParams<{ genCode: string }>()
  const genCode = String(params.genCode ?? '').toUpperCase().replace(/-/g, '')
  const query = useView('seq', ['activation', genCode], () => seqApi.activation(genCode))
  return (
    <>
      <Stack.Screen options={{ title: t('detail.title') }} />
      <QueryView query={query}>{(license) => <Detail license={license} refresh={query.refetch} refreshing={query.isRefetching} />}</QueryView>
    </>
  )
}
