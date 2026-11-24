import { useState } from 'react'
import type { SubscriptionFormValues } from '@/api/bms'
import type { ActionResponse } from '@/api/client'
import { useT } from '@/i18n'
import { Button, Field, Muted, Section, SwitchRow } from '@/ui'
import { FormError, NumField, ReadOnlyNote } from './fields'
import { useFormSubmit, useRules, type Errors } from './lib'

const QUOTAS = ['treeMaxMembers', 'bioMaxChars', 'mediaMaxImages', 'mediaMaxVideos', 'documentsMax', 'geoPlacesMax', 'memorialsMax', 'petsMax', 'qrCodeMax'] as const
const PRICES = [
  { currency: 'USD', annual: 'priceUsd', monthly: 'monthlyPriceUsd', hint: 'priceUsd' },
  { currency: 'BRL', annual: 'priceBrl', monthly: 'monthlyPriceBrl', hint: 'priceBrl' },
  { currency: 'MXN', annual: 'priceMxn', monthly: 'monthlyPriceMxn', hint: 'priceMxn' },
] as const

interface Props {
  initial: SubscriptionFormValues
  canEdit: boolean
  submitLabel: string
  save: (values: SubscriptionFormValues) => Promise<ActionResponse>
  onSaved: (message?: string) => void | Promise<void>
}

/** A consumer plan: term, per-currency prices and feature quotas (web: subscription-form). */
export function SubscriptionForm({ initial, canEdit, submitLabel, save, onSaved }: Props) {
  const t = useT('Subscriptions')
  const rules = useRules()
  const form = useFormSubmit()
  const [values, setValues] = useState(initial)
  const set = (patch: Partial<SubscriptionFormValues>) => setValues((current) => ({ ...current, ...patch }))
  const disabled = !canEdit

  function submit() {
    const errors: Errors = {
      code: rules.min(values.code, 2) ?? rules.max(values.code, 32) ?? (/^[A-Z0-9_]+$/.test(values.code) ? undefined : rules.t('codeFormat')),
      name: rules.min(values.name, 4) ?? rules.max(values.name, 64),
      description: rules.max(values.description ?? '', 256),
      termLength: !Number.isInteger(values.termLength) ? rules.t('mustBeWholeNumber') : values.termLength < 0 ? rules.t('termLengthMin') : undefined,
    }
    for (const price of PRICES) {
      errors[price.annual] = rules.price(values[price.annual])
      errors[price.monthly] = rules.price(values[price.monthly])
    }
    for (const quota of QUOTAS) {
      errors[quota] = !Number.isInteger(values[quota]) ? rules.t('mustBeWholeNumber') : values[quota] < 0 ? rules.t('mustBeZeroOrGreater') : undefined
    }
    if (form.invalid(errors)) return
    void form.submit(
      () => save(values),
      (response) => onSaved(response.message),
    )
  }

  return (
    <>
      {canEdit ? null : <ReadOnlyNote />}
      <FormError message={form.error} />
      <Field
        label={t('fields.code')}
        value={values.code}
        onChangeText={(code) => set({ code: code.toUpperCase() })}
        placeholder={t('placeholders.code')}
        hint={t('hints.code')}
        error={form.errors.code}
        maxLength={32}
        autoCapitalize="characters"
        autoCorrect={false}
        disabled={disabled}
      />
      <Field label={t('fields.name')} value={values.name} onChangeText={(name) => set({ name })} error={form.errors.name} maxLength={64} disabled={disabled} />
      <Field label={t('fields.description')} value={values.description ?? ''} onChangeText={(description) => set({ description })} error={form.errors.description} maxLength={256} multiline disabled={disabled} />
      <NumField label={t('fields.termLength')} value={values.termLength} onChange={(termLength) => set({ termLength })} error={form.errors.termLength} hint={t('hints.termLength')} integer disabled={disabled} />

      <Section title={t('prices.title')}>
        {PRICES.map((price) => (
          <Section key={price.currency}>
            <NumField
              label={`${t('fields.annual')} (${price.currency})`}
              value={values[price.annual]}
              onChange={(value) => set({ [price.annual]: value })}
              error={form.errors[price.annual]}
              disabled={disabled}
            />
            <NumField
              label={`${t('fields.monthly')} (${price.currency})`}
              value={values[price.monthly]}
              onChange={(value) => set({ [price.monthly]: value })}
              error={form.errors[price.monthly]}
              disabled={disabled}
            />
            <Muted>{t(`hints.${price.hint}`)}</Muted>
          </Section>
        ))}
      </Section>

      <Section title={t('quotas.title')}>
        {QUOTAS.map((quota) => (
          <NumField
            key={quota}
            label={t(`fields.${quota}`)}
            value={values[quota]}
            onChange={(value) => set({ [quota]: value })}
            error={form.errors[quota]}
            hint={t.has(`hints.${quota}`) ? t(`hints.${quota}`) : undefined}
            integer
            disabled={disabled}
          />
        ))}
      </Section>

      <SwitchRow label={t('active')} value={values.isActive} onChange={(isActive) => set({ isActive })} disabled={disabled} />
      {canEdit ? <Button label={submitLabel} onPress={submit} loading={form.pending} fullWidth /> : null}
    </>
  )
}
