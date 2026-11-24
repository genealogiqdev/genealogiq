import { Stack, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { bmsApi, type GenCodesNewView } from '@/api/bms'
import { FormError, Note, NumField } from '@/features/bms/fields'
import { useFormSubmit, useGo, useLanguageKey, useRules } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatMoney } from '@/lib/format'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Button, Card, KeyValue, Muted, QueryView, Screen, SelectField, useNotify } from '@/ui'

function OrderForm({ view }: { view: GenCodesNewView }) {
  const t = useT('GenCodePackages')
  const tm = useT('ManualCoupons')
  const rules = useRules()
  const go = useGo()
  const notify = useNotify()
  const invalidate = useBmsInvalidate()
  const form = useFormSubmit()
  const first = view.packages.find((item) => item.id === view.initialPackageId) ?? view.packages[0]
  const [packageId, setPackageId] = useState(first?.id ?? '')
  const [tenantId, setTenantId] = useState('')
  const [quantity, setQuantity] = useState(first?.minimumQuantity ?? 1)
  const [couponId, setCouponId] = useState('')

  const item = view.packages.find((entry) => entry.id === packageId) ?? first
  const coupons = useMemo(
    () => view.coupons.filter((coupon) => coupon.productIds.length === 0 || (!!item && coupon.productIds.includes(item.id))),
    [view.coupons, item],
  )
  const coupon = coupons.find((entry) => entry.id === couponId)
  const manual = coupon?.redemptionMode === 'manual'
  const currency = item?.currency ?? 'BRL'
  const subtotalCents = Math.round((item?.unitPrice ?? 0) * 100) * (Number.isFinite(quantity) ? quantity : 0)
  const discountCents = coupon
    ? Math.min(subtotalCents, coupon.discountType === 'percent' ? Math.round((subtotalCents * coupon.value) / 100) : Math.round(coupon.value * 100))
    : 0
  const blocked = !!item && !item.stripePriceId && !manual

  function submit() {
    const invalid = form.invalid({
      packageId: rules.required(packageId),
      tenantId: rules.required(tenantId),
      quantity:
        rules.positiveWhole(quantity) ?? (item && quantity < item.minimumQuantity ? rules.t('minQuantity', { count: item.minimumQuantity }) : undefined),
    })
    if (invalid) return
    if (manual && couponId) {
      go.push('/bms/coupons/redeem', { couponId, kind: 'package', productId: packageId, tenantId, quantity: String(quantity) })
      return
    }
    void form.submit(
      () => bmsApi.sendGenCodePackageLink({ packageId, tenantId, quantity, discountCouponId: couponId || null }),
      async (response) => {
        notify.success(response.message ?? t('form.sent'))
        await invalidate(['gencodes'])
        go.replace('/bms/gencodes')
      },
    )
  }

  return (
    <Screen>
      <FormError message={form.error} />
      <SelectField
        label={t('form.product')}
        placeholder={t('form.pickProduct')}
        value={packageId}
        options={view.packages.map((entry) => ({ value: entry.id, label: `${entry.name} — ${formatMoney(entry.unitPrice, entry.currency)}` }))}
        onChange={(next) => {
          setPackageId(next)
          const selected = view.packages.find((entry) => entry.id === next)
          if (selected) setQuantity(selected.minimumQuantity)
          const current = view.coupons.find((entry) => entry.id === couponId)
          if (current?.productIds.length && !current.productIds.includes(next)) setCouponId('')
        }}
        error={form.errors.packageId}
      />
      <SelectField
        label={t('form.customer')}
        placeholder={t('form.pickCustomer')}
        value={tenantId}
        options={view.customers.map((customer) => ({
          value: customer.id,
          label: customer.name,
          description: `${customer.taxId} · ${t(`form.customerStatus.${customer.contractStatus}`)}`,
        }))}
        onChange={setTenantId}
        error={form.errors.tenantId}
        searchable
      />
      {view.customers.length === 0 ? <Muted>{t('form.noCustomers')}</Muted> : null}
      <NumField
        label={t('form.quantity')}
        value={quantity}
        onChange={setQuantity}
        error={form.errors.quantity}
        hint={item ? t('form.minimumHint', { count: item.minimumQuantity }) : undefined}
        integer
      />
      <SelectField
        label={t('form.coupon')}
        placeholder={t('form.noCoupon')}
        value={couponId}
        options={coupons.map((entry) => ({
          value: entry.id,
          label: entry.code,
          description: entry.discountType === 'percent' ? t('form.percentOff', { value: entry.value }) : t('form.amountOff', { value: formatMoney(entry.value, currency) }),
        }))}
        onChange={setCouponId}
        clearLabel={t('form.noCoupon')}
        onClear={() => setCouponId('')}
        error={form.errors.discountCouponId}
      />
      <Muted>{t('form.couponHint')}</Muted>

      <Card>
        <KeyValue label={t('form.unitPrice')} value={formatMoney(item?.unitPrice ?? 0, currency)} />
        {discountCents > 0 ? <KeyValue label={t('form.discount')} value={`− ${formatMoney(discountCents / 100, currency)}`} /> : null}
        <KeyValue label={t('form.total')} value={formatMoney((subtotalCents - discountCents) / 100, currency)} />
      </Card>
      {blocked ? <Note>{tm('needsCoupon')}</Note> : <Muted>{t('form.paymentNote')}</Muted>}
      <Button label={manual ? tm('review') : form.pending ? t('form.sending') : t('form.send')} onPress={submit} loading={form.pending} disabled={blocked} fullWidth />
      <Button label={t('form.cancel')} variant="ghost" onPress={go.back} disabled={form.pending} fullWidth />
    </Screen>
  )
}

export default function GenCodeOrderNew() {
  const t = useT('GenCodePackages')
  const { packageId } = useLocalSearchParams<{ packageId?: string }>()
  const language = useLanguageKey()
  const initial = typeof packageId === 'string' && packageId ? packageId : undefined
  const query = useView('bms', ['gencodesNew', language, initial ?? ''], () => bmsApi.gencodesNew(initial))
  return (
    <>
      <Stack.Screen options={{ title: t('form.title') }} />
      <QueryView query={query}>{(view) => <OrderForm view={view} />}</QueryView>
    </>
  )
}
