import { Stack } from 'expo-router'
import { useMemo, useState } from 'react'
import { bmsApi, type ContractNewView, type PartnerCadence } from '@/api/bms'
import { FormError, Note } from '@/features/bms/fields'
import { useFormSubmit, useGo, useLanguageKey } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatMoney } from '@/lib/format'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Button, Muted, QueryView, Screen, Segmented, SelectField, Text, useNotify } from '@/ui'

function LinkForm({ view }: { view: ContractNewView }) {
  const t = useT('Contracts')
  const tc = useT('Common')
  const tm = useT('ManualCoupons')
  const go = useGo()
  const notify = useNotify()
  const invalidate = useBmsInvalidate()
  const form = useFormSubmit()
  const [tenantId, setTenantId] = useState('')
  const [planId, setPlanId] = useState('')
  const [cadence, setCadence] = useState<PartnerCadence>('cash')
  const [couponId, setCouponId] = useState('')

  const plan = view.plans.find((entry) => entry.id === planId)
  // A coupon restricted to other plans would be rejected at checkout, after the link went out.
  const coupons = useMemo(
    () => view.coupons.filter((coupon) => coupon.productIds.length === 0 || (!!planId && coupon.productIds.includes(planId))),
    [view.coupons, planId],
  )
  const manual = coupons.find((coupon) => coupon.id === couponId)?.redemptionMode === 'manual'
  const instalments = !!plan && plan.installmentCount != null && plan.installmentAmount != null
  const blocked = !!plan && !plan.stripeSynced && !manual

  function send() {
    if (manual) {
      go.push('/bms/coupons/redeem', { couponId, kind: 'partner', productId: planId, tenantId })
      return
    }
    void form.submit(
      () => bmsApi.sendPartnerPlanLink(tenantId, planId, cadence, couponId || null),
      async (response) => {
        notify.success(response.data?.email ? t('link.sent', { email: response.data.email }) : (response.message ?? t('link.sent', { email: '' })))
        await invalidate(['contracts'])
        go.replace('/bms/contracts')
      },
    )
  }

  return (
    <Screen>
      <FormError message={form.error} />
      <SelectField
        label={t('link.partner')}
        placeholder={t('link.pickPartner')}
        value={tenantId}
        options={view.tenants.map((tenant) => ({ value: tenant.id, label: tenant.name, description: tenant.taxId }))}
        onChange={setTenantId}
        searchable
      />
      <SelectField
        label={t('link.plan')}
        placeholder={t('link.pickPlan')}
        value={planId}
        options={view.plans.map((entry) => ({
          value: entry.id,
          label: `${entry.name} | ${formatMoney(entry.annualCashAmount, entry.currency)}`,
          description: t('link.units', { count: entry.annualAllowance }),
        }))}
        onChange={(next) => {
          setPlanId(next)
          setCouponId('')
          setCadence('cash')
        }}
      />
      {view.plans.length === 0 ? <Muted>{t('link.noPlans')}</Muted> : null}

      {plan ? (
        <>
          <Text className="text-sm font-medium">{t('link.cadence')}</Text>
          <Segmented<PartnerCadence>
            value={cadence}
            onChange={setCadence}
            options={[
              { value: 'cash', label: t('link.cash', { amount: formatMoney(plan.annualCashAmount, plan.currency) }) },
              ...(instalments
                ? [{ value: 'installment' as const, label: t('link.installments', { count: plan.installmentCount ?? 0, amount: formatMoney(plan.installmentAmount, plan.currency) }) }]
                : []),
            ]}
          />
        </>
      ) : null}

      <SelectField
        label={t('link.coupon')}
        placeholder={t('link.noCoupon')}
        value={couponId}
        options={coupons.map((coupon) => ({ value: coupon.id, label: coupon.code }))}
        onChange={setCouponId}
        clearLabel={t('link.noCoupon')}
        onClear={() => setCouponId('')}
      />

      {blocked ? <Note>{tm('needsCoupon')}</Note> : null}
      <Muted>{t('link.expiryNote')}</Muted>
      <Button
        label={manual ? tm('review') : form.pending ? t('link.sending') : t('link.send')}
        onPress={send}
        disabled={!tenantId || !planId || blocked}
        loading={form.pending}
        fullWidth
      />
      <Button label={tc('cancel')} variant="ghost" onPress={go.back} disabled={form.pending} fullWidth />
    </Screen>
  )
}

export default function ContractNew() {
  const t = useT('Contracts')
  // Plans, prices and coupons are resolved for the language's currency.
  const language = useLanguageKey()
  const query = useView('bms', ['contractNew', language], () => bmsApi.contractNew())
  return (
    <>
      <Stack.Screen options={{ title: t('link.newTitle') }} />
      <QueryView query={query}>{(view) => <LinkForm key={view.currency} view={view} />}</QueryView>
    </>
  )
}
