import { Stack } from 'expo-router'
import { useState } from 'react'
import { bmsApi, type CouponProductOption, type DiscountCouponFormValues, type DiscountCouponNewView } from '@/api/bms'
import { FormError, NumField, ReadOnlyNote } from '@/features/bms/fields'
import { parseNumber, useFormSubmit, useGo, useLanguageKey, useRules } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatMoney } from '@/lib/format'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Button, Card, CheckRow, DateField, Field, Muted, QueryView, Screen, Section, SelectField, useNotify } from '@/ui'

type Mode = 'stripe' | 'manual'
type Duration = DiscountCouponFormValues['duration']
type DiscountType = DiscountCouponFormValues['discountType']

const KIND_KEY: Record<CouponProductOption['kind'], string> = {
  'partner-plan': 'partnerPlan',
  'gencode-package': 'gencodePackage',
  consumer: 'consumer',
}

function CouponForm({ view }: { view: DiscountCouponNewView }) {
  const t = useT('DiscountCoupons')
  const tc = useT('Common')
  const tm = useT('Mobile.bms')
  const rules = useRules()
  const go = useGo()
  const notify = useNotify()
  const invalidate = useBmsInvalidate()
  const form = useFormSubmit()
  const [mode, setMode] = useState<Mode>('stripe')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [discountType, setDiscountType] = useState<DiscountType>('percent')
  const [percentOff, setPercentOff] = useState(10)
  const [amounts, setAmounts] = useState({ amountOffUsd: 0, amountOffBrl: 0, amountOffMxn: 0 })
  const [duration, setDuration] = useState<Duration>('once')
  const [months, setMonths] = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [redeemBy, setRedeemBy] = useState('')
  const [appliesTo, setAppliesTo] = useState<string[]>([])
  const manual = mode === 'manual'
  // Stripe coupons can only be restricted to products Stripe knows about.
  const products = view.products.filter((product) => manual || product.stripeSynced)

  function submit() {
    const cleanCode = code.trim().toUpperCase()
    const monthCount = months.trim() ? parseNumber(months) : null
    const maxUses = maxRedemptions.trim() ? parseNumber(maxRedemptions) : null
    const amountValues = [amounts.amountOffUsd, amounts.amountOffBrl, amounts.amountOffMxn]
    const invalid = form.invalid({
      code: rules.min(cleanCode, 3) ?? rules.max(cleanCode, 32) ?? (/^[A-Z0-9_-]+$/.test(cleanCode) ? undefined : rules.t('couponCodeFormat')),
      description: rules.max(description, 255),
      percentOff:
        manual && (discountType !== 'percent' || percentOff !== 100 || duration !== 'once')
          ? rules.t('manualCouponTerms')
          : discountType !== 'percent'
            ? undefined
            : !Number.isFinite(percentOff) || percentOff <= 0
              ? rules.t('greaterThanZero')
              : percentOff > 100
                ? rules.t('percentMax')
                : undefined,
      amountOffUsd:
        discountType !== 'amount'
          ? undefined
          : amountValues.some((value) => !Number.isFinite(value) || value < 0)
            ? rules.t('mustBeZeroOrGreater')
            : amountValues.every((value) => value <= 0)
              ? rules.t('atLeastOneAmount')
              : undefined,
      durationInMonths:
        duration !== 'repeating' ? undefined : monthCount === null ? rules.t('durationInMonthsRequired') : rules.positiveWhole(monthCount),
      maxRedemptions: maxUses === null ? undefined : rules.positiveWhole(maxUses),
    })
    if (invalid) return
    const data: DiscountCouponFormValues = {
      code: cleanCode,
      description: description.trim() || null,
      discountType,
      redemptionMode: mode,
      percentOff: discountType === 'percent' ? percentOff : 0,
      amountOffUsd: discountType === 'amount' ? amounts.amountOffUsd : 0,
      amountOffBrl: discountType === 'amount' ? amounts.amountOffBrl : 0,
      amountOffMxn: discountType === 'amount' ? amounts.amountOffMxn : 0,
      duration,
      durationInMonths: duration === 'repeating' ? monthCount : null,
      maxRedemptions: maxUses,
      // Valid through the end of the chosen day on this device.
      redeemBy: redeemBy ? new Date(`${redeemBy}T23:59:59`).toISOString() : null,
      appliesTo,
    }
    void form.submit(
      () => bmsApi.createDiscountCoupon(data),
      async (response) => {
        if (response.message) notify.success(response.message)
        await invalidate(['discountCoupons'], ['discountCouponRedeem'], ['contractNew'], ['gencodesNew'])
        go.replace('/bms/coupons')
      },
    )
  }

  if (!view.canSubmit) {
    return (
      <Screen>
        <ReadOnlyNote />
      </Screen>
    )
  }

  return (
    <Screen>
      <FormError message={form.error} />
      <SelectField<Mode>
        label={t('fields.redemptionMode')}
        value={mode}
        options={[
          { value: 'stripe', label: t('redemptionMode.stripe') },
          { value: 'manual', label: t('redemptionMode.manual') },
        ]}
        onChange={(next) => {
          setMode(next)
          setAppliesTo([])
          if (next === 'manual') {
            setDiscountType('percent')
            setPercentOff(100)
            setDuration('once')
            setMonths('')
          }
        }}
      />
      {manual ? <Muted>{t('hints.manual')}</Muted> : null}
      <Field
        label={t('fields.code')}
        value={code}
        onChangeText={(next) => setCode(next.toUpperCase())}
        placeholder={t('placeholders.code')}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={32}
        error={form.errors.code}
        required
      />
      <Field label={t('fields.description')} value={description} onChangeText={setDescription} placeholder={t('placeholders.descriptionCreate')} maxLength={255} error={form.errors.description} />
      <SelectField<DiscountType>
        label={t('fields.discountType')}
        value={discountType}
        disabled={manual}
        options={[
          { value: 'percent', label: t('discountType.percent') },
          { value: 'amount', label: tm('fixedAmount') },
        ]}
        onChange={setDiscountType}
      />
      {discountType === 'percent' ? (
        <NumField label={t('fields.percent')} value={percentOff} onChange={setPercentOff} error={form.errors.percentOff} disabled={manual} />
      ) : (
        <>
          <NumField label={tm('amountIn', { currency: 'USD' })} value={amounts.amountOffUsd} onChange={(amountOffUsd) => setAmounts((current) => ({ ...current, amountOffUsd }))} error={form.errors.amountOffUsd} />
          <NumField label={tm('amountIn', { currency: 'BRL' })} value={amounts.amountOffBrl} onChange={(amountOffBrl) => setAmounts((current) => ({ ...current, amountOffBrl }))} error={form.errors.amountOffBrl} />
          <NumField label={tm('amountIn', { currency: 'MXN' })} value={amounts.amountOffMxn} onChange={(amountOffMxn) => setAmounts((current) => ({ ...current, amountOffMxn }))} error={form.errors.amountOffMxn} />
        </>
      )}
      <SelectField<Duration>
        label={t('fields.duration')}
        value={duration}
        disabled={manual}
        options={[
          { value: 'once', label: t('durationOption.once') },
          { value: 'forever', label: t('durationOption.forever') },
          { value: 'repeating', label: t('durationOption.repeating') },
        ]}
        onChange={setDuration}
      />
      {duration === 'repeating' ? (
        <Field label={t('fields.durationInMonths')} value={months} onChangeText={setMonths} keyboardType="number-pad" error={form.errors.durationInMonths} />
      ) : null}
      <Field
        label={t('fields.maxRedemptions')}
        value={maxRedemptions}
        onChangeText={setMaxRedemptions}
        placeholder={t('placeholders.maxRedemptions')}
        keyboardType="number-pad"
        error={form.errors.maxRedemptions}
      />
      <DateField label={t('fields.expiresOn')} value={redeemBy} onChange={setRedeemBy} minimumDate={new Date()} error={form.errors.redeemBy} />

      <Section title={t('fields.appliesTo')}>
        <Muted>{t('hints.appliesTo')}</Muted>
        <Card>
          {products.length === 0 ? <Muted>{tc('dataTable.noResults')}</Muted> : null}
          {products.map((product) => (
            <CheckRow
              key={`${product.kind}-${product.id}`}
              label={`${product.name} — ${t(`productKind.${KIND_KEY[product.kind]}`)} · ${t('packageMeta', { quantity: product.quantity, price: formatMoney(product.price, product.currency) })}`}
              value={appliesTo.includes(product.id)}
              onChange={(checked) => setAppliesTo((current) => (checked ? [...current, product.id] : current.filter((id) => id !== product.id)))}
            />
          ))}
        </Card>
        {form.errors.appliesTo ? <Muted className="text-danger">{form.errors.appliesTo}</Muted> : null}
      </Section>

      <Button label={form.pending ? tc('creating') : t('create')} onPress={submit} loading={form.pending} fullWidth />
      <Button label={tc('cancel')} variant="ghost" onPress={go.back} disabled={form.pending} fullWidth />
    </Screen>
  )
}

export default function CouponNew() {
  const t = useT('DiscountCoupons')
  const language = useLanguageKey()
  const query = useView('bms', ['discountCouponNew', language], () => bmsApi.discountCouponNew())
  return (
    <>
      <Stack.Screen options={{ title: t('new') }} />
      <QueryView query={query}>{(view) => <CouponForm key={view.currency} view={view} />}</QueryView>
    </>
  )
}
