import { Stack, useLocalSearchParams } from 'expo-router'
import { useRef, useState } from 'react'
import { View } from 'react-native'
import { bmsApi, type DiscountCouponRedeemView, type ManualCouponFormValues, type ManualCouponHistoryRow } from '@/api/bms'
import { FormError, Note } from '@/features/bms/fields'
import { parseNumber, useFormSubmit, useGo, useLanguageKey, useRefresh, useRules, uuid } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Badge, Button, Card, CheckRow, Field, Heading, KeyValue, Muted, QueryView, Row, Screen, Section, SelectField, Text, useAction, useNotify } from '@/ui'

type Kind = ManualCouponFormValues['kind']
type Source = ManualCouponFormValues['source']
type Cadence = ManualCouponFormValues['cadence']
interface Initial {
  couponId?: string
  kind?: string
  productId?: string
  tenantId?: string
  quantity?: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function RedeemForm({ view, initial }: { view: DiscountCouponRedeemView; initial: Initial }) {
  const t = useT('ManualCoupons')
  const rules = useRules()
  const go = useGo()
  const notify = useNotify()
  const invalidate = useBmsInvalidate()
  const form = useFormSubmit()
  const { options } = view
  // Generated once per form instance and reused on every retry, so a repeated
  // submit can never release the benefits twice.
  const requestId = useRef('')
  const [completed, setCompleted] = useState<{ message: string; accessPending: boolean } | null>(null)
  const [couponId, setCouponId] = useState(
    options.coupons.find((coupon) => coupon.id === initial.couponId)?.id ??
      options.coupons.find((coupon) => coupon.code.toLowerCase() === 'gen2026')?.id ??
      options.coupons[0]?.id ??
      '',
  )
  const [kind, setKind] = useState<Kind>(initial.kind === 'partner' || initial.kind === 'consumer' ? initial.kind : 'package')
  const [productId, setProductId] = useState(initial.productId ?? '')
  const [tenantId, setTenantId] = useState(initial.tenantId ?? '')
  const [email, setEmail] = useState('')
  const [quantity, setQuantity] = useState(initial.quantity ?? '20')
  const [cadence, setCadence] = useState<Cadence>('annual')
  const [source, setSource] = useState<Source>('external_payment')
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const coupon = options.coupons.find((entry) => entry.id === couponId)
  const products = options.products.filter((product) => product.kind === kind && (!coupon?.productIds.length || coupon.productIds.includes(product.id)))
  const product = products.find((entry) => entry.id === productId)
  const units = kind === 'package' ? parseNumber(quantity) || 0 : 1
  const monthly = kind === 'consumer' && cadence === 'monthly'
  const subtotal = product ? (monthly ? (product.monthlyAmount ?? 0) : product.amount) * units : 0
  const currency = product?.currency ?? view.currency
  const months = monthly ? 1 : (product?.termMonths ?? 12)

  function submit() {
    const count = kind === 'package' ? parseNumber(quantity) : 1
    const received = source === 'external_payment' ? parseNumber(amount) : null
    const invalid = form.invalid({
      couponId: rules.required(couponId),
      productId: product ? undefined : rules.t('required'),
      tenantId: kind !== 'consumer' && !tenantId ? rules.t('required') : undefined,
      consumerEmail: kind === 'consumer' && !EMAIL.test(email.trim()) ? rules.t('invalidEmail') : undefined,
      quantity:
        kind !== 'package'
          ? undefined
          : !Number.isInteger(count)
            ? rules.t('wholeNumber')
            : count < 1
              ? rules.t('greaterThanZero')
              : count < (product?.minimumQuantity ?? 1)
                ? rules.t('minQuantity', { count: product?.minimumQuantity ?? 1 })
                : count > 10_000
                  ? rules.t('maxQuantity', { count: 10_000 })
                  : undefined,
      reference: rules.min(reference.trim(), 3) ?? rules.max(reference.trim(), 160),
      externalAmount:
        received === null ? undefined : Number.isNaN(received) ? rules.t('required') : received > 0 ? undefined : rules.t('greaterThanZero'),
      confirmed: confirmed ? undefined : rules.t('manualCouponConfirmation'),
    })
    if (invalid || !product) return
    requestId.current ||= uuid()
    void form.submit(
      () =>
        bmsApi.applyManualCoupon({
          requestId: requestId.current,
          couponId,
          kind,
          productId: product.id,
          tenantId: kind === 'consumer' ? undefined : tenantId,
          consumerEmail: kind === 'consumer' ? email.trim().toLowerCase() : undefined,
          quantity: count,
          cadence,
          source,
          reference: reference.trim(),
          externalAmount: received === null ? null : Math.round(received * 100) / 100,
          confirmed,
        }),
      async (response) => {
        const message = response.message ?? t('applied')
        setCompleted({ message, accessPending: !!response.data?.accessPending })
        if (response.data?.accessPending || response.data?.emailPending) notify.info(message)
        else notify.success(message)
        await invalidate(['discountCouponRedeem'], ['contracts'], ['gencodes'], ['consumers'], ['dashboard'], ['reports'], ['partnerGencodes'])
      },
    )
  }

  if (completed) {
    return (
      <Card>
        <Text className="font-medium" accessibilityRole="alert">
          {completed.message}
        </Text>
        <Muted>{t('resultNote')}</Muted>
        {completed.accessPending ? <Button label={t('manageAccess')} variant="outline" onPress={() => go.push('/bms/customers')} /> : null}
        <Button
          label={t('another')}
          onPress={() => {
            requestId.current = ''
            setCompleted(null)
            setReference('')
            setAmount('')
            setConfirmed(false)
          }}
        />
      </Card>
    )
  }

  return (
    <View className="gap-4">
      <FormError message={form.error} />
      <SelectField
        label={t('coupon')}
        placeholder={t('pickCoupon')}
        value={couponId}
        options={options.coupons.map((entry) => ({ value: entry.id, label: `${entry.code} — 100%` }))}
        onChange={(next) => {
          setCouponId(next)
          setProductId('')
        }}
        error={form.errors.couponId}
      />
      {options.coupons.length === 0 ? <Muted>{t('noCoupons')}</Muted> : null}
      <SelectField<Kind>
        label={t('kind')}
        value={kind}
        options={(['package', 'partner', 'consumer'] as const).map((value) => ({ value, label: t(`kinds.${value}`) }))}
        onChange={(next) => {
          setKind(next)
          setProductId('')
          setCadence('annual')
        }}
      />
      {kind === 'consumer' ? (
        <Field
          label={t('consumerEmail')}
          value={email}
          onChangeText={setEmail}
          hint={t('consumerHint')}
          error={form.errors.consumerEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={320}
        />
      ) : (
        <SelectField
          label={t('partner')}
          placeholder={t('pickPartner')}
          value={tenantId}
          options={options.tenants.map((tenant) => ({ value: tenant.id, label: tenant.name, description: tenant.taxId }))}
          onChange={setTenantId}
          error={form.errors.tenantId}
          searchable
        />
      )}
      <SelectField
        label={t('product')}
        placeholder={t('pickProduct')}
        value={product?.id ?? ''}
        options={products.map((entry) => ({ value: entry.id, label: entry.name }))}
        onChange={(next) => {
          setProductId(next)
          setCadence('annual')
          const selected = products.find((entry) => entry.id === next)
          if (selected) setQuantity(String(selected.minimumQuantity))
        }}
        error={form.errors.productId}
      />
      {products.length === 0 ? <Muted>{t('noProducts')}</Muted> : null}
      {kind === 'package' ? <Field label={t('quantity')} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" error={form.errors.quantity} /> : null}
      {kind === 'consumer' && product?.monthlyAmount != null ? (
        <SelectField<Cadence>
          label={t('period')}
          value={cadence}
          options={[
            { value: 'annual', label: t('months', { count: product.termMonths }) },
            { value: 'monthly', label: t('months', { count: 1 }) },
          ]}
          onChange={setCadence}
        />
      ) : null}

      {product ? (
        <Card>
          <KeyValue label={t('subtotal')} value={formatMoney(subtotal, currency)} />
          <KeyValue label={t('discount')} value={`− ${formatMoney(subtotal, currency)}`} />
          <KeyValue label={t('total')} value={formatMoney(0, currency)} />
          {kind === 'package' ? <Muted>{t('credits', { count: units })}</Muted> : <Muted>{t('termNote', { count: months })}</Muted>}
          {kind === 'partner' && product.quantity > 0 ? <Muted>{t('credits', { count: product.quantity })}</Muted> : null}
        </Card>
      ) : null}

      <SelectField<Source>
        label={t('source')}
        value={source}
        options={(['external_payment', 'legacy_stock'] as const).map((value) => ({ value, label: t(`sources.${value}`) }))}
        onChange={setSource}
      />
      <Field
        label={t('reference')}
        value={reference}
        onChangeText={setReference}
        placeholder={t('referencePlaceholder')}
        hint={t('referenceHint')}
        error={form.errors.reference}
        maxLength={160}
        autoCorrect={false}
      />
      {source === 'external_payment' ? (
        <Field label={t('externalAmount', { currency: currency.toUpperCase() })} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={form.errors.externalAmount} />
      ) : null}
      <CheckRow label={t('confirmation')} value={confirmed} onChange={setConfirmed} error={form.errors.confirmed} />
      <Button label={form.pending ? t('applying') : t('apply')} onPress={submit} loading={form.pending} disabled={!coupon} fullWidth />
    </View>
  )
}

function HistoryCard({ row }: { row: ManualCouponHistoryRow }) {
  const t = useT('ManualCoupons')
  const action = useAction()
  const invalidate = useBmsInvalidate()
  return (
    <Card>
      <Row className="justify-between">
        <Text className="flex-1 font-semibold">{row.code}</Text>
        <Badge label={row.emailSentAt ? t('emailSent') : t('emailPending')} color={row.emailSentAt ? 'success' : 'warning'} />
      </Row>
      <Muted>
        {t.has(`kinds.${row.kind}`) ? t(`kinds.${row.kind}`) : row.kind} · {row.product}
        {row.quantity > 1 ? ` × ${row.quantity}` : ''}
      </Muted>
      <KeyValue label={t('recipient')} value={row.recipient} />
      <KeyValue label={t('source')} value={t.has(`sources.${row.source}`) ? t(`sources.${row.source}`) : row.source} />
      <KeyValue label={t('reference')} value={row.reference} />
      <KeyValue label={t('subtotal')} value={formatMoney(row.subtotalAmount, row.currency)} />
      <KeyValue label={t('discount')} value={formatMoney(row.discountAmount, row.currency)} />
      <KeyValue label={t('total')} value={formatMoney(row.totalAmount, row.currency)} />
      {row.externalAmount !== null ? <KeyValue label={t('externalAmount', { currency: row.currency.toUpperCase() })} value={formatMoney(row.externalAmount, row.currency)} /> : null}
      <KeyValue label={t('record')} value={`${formatDateTime(row.createdAt)} · ${row.operator}`} />
      {row.endsAt ? <Muted>{t('validUntil', { date: formatDate(row.endsAt, { utc: true }) })}</Muted> : null}
      {row.emailSentAt ? null : (
        <Button
          label={action.pending ? t('emailSending') : t('emailRetry')}
          variant="secondary"
          size="sm"
          icon="mail-outline"
          loading={action.pending}
          onPress={() => void action.run(() => bmsApi.retryManualCouponEmail(row.id), { success: true, onSuccess: () => invalidate(['discountCouponRedeem']) })}
        />
      )}
    </Card>
  )
}

export default function CouponRedeem() {
  const t = useT('ManualCoupons')
  const params = useLocalSearchParams<{ couponId?: string; kind?: string; productId?: string; tenantId?: string; quantity?: string }>()
  const language = useLanguageKey()
  const query = useView('bms', ['discountCouponRedeem', language], () => bmsApi.discountCouponRedeem())
  const refresh = useRefresh(query)
  const pick = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
  const initial: Initial = {
    couponId: pick(params.couponId),
    kind: pick(params.kind),
    productId: pick(params.productId),
    tenantId: pick(params.tenantId),
    quantity: pick(params.quantity),
  }
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <QueryView query={query}>
        {(view) => (
          <Screen {...refresh}>
            <Muted>{t('description')}</Muted>
            <RedeemForm key={view.currency} view={view} initial={initial} />
            <Section title={t('history')}>
              {view.history.length === 0 ? <Muted>{t('emptyHistory')}</Muted> : null}
              {view.history.map((row) => (
                <HistoryCard key={row.id} row={row} />
              ))}
            </Section>
          </Screen>
        )}
      </QueryView>
    </>
  )
}
