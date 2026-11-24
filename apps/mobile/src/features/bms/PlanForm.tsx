import { useState } from 'react'
import type { PartnerPlanFormValues } from '@/api/bms'
import type { ActionResponse } from '@/api/client'
import { useT } from '@/i18n'
import { Button, Field, Muted, Section, SwitchRow } from '@/ui'
import { FormError, NumField, ReadOnlyNote } from './fields'
import { CURRENCIES, useFormSubmit, useRules, type Errors } from './lib'

const SUFFIX = { USD: 'Usd', BRL: 'Brl', MXN: 'Mxn' } as const

interface Props {
  initial: PartnerPlanFormValues
  canEdit: boolean
  submitLabel: string
  save: (values: PartnerPlanFormValues) => Promise<ActionResponse>
  onSaved: (message?: string) => void | Promise<void>
}

/** A partner plan and its price book, edited together (web: partner-plan-fields). */
export function PlanForm({ initial, canEdit, submitLabel, save, onSaved }: Props) {
  const t = useT('PartnerPlans')
  const rules = useRules()
  const form = useFormSubmit()
  const [values, setValues] = useState(initial)
  const set = (patch: Partial<PartnerPlanFormValues>) => setValues((current) => ({ ...current, ...patch }))
  const disabled = !canEdit

  function submit() {
    const errors: Errors = {
      name: rules.min(values.name, 3) ?? rules.max(values.name, 32),
      code: rules.min(values.code, 3) ?? rules.max(values.code, 24) ?? (/^[A-Z0-9_]+$/.test(values.code) ? undefined : rules.t('upperSnakeOnly')),
      description: rules.max(values.description, 256),
      annualAllowance: rules.positiveWhole(values.annualAllowance),
      rolloverRate: !Number.isFinite(values.rolloverRate) || values.rolloverRate < 0 ? rules.t('mustBeZeroOrGreater') : values.rolloverRate > 1 ? rules.t('atMostOne') : undefined,
      rolloverValidityMonths: rules.whole(values.rolloverValidityMonths),
      graceDays: rules.whole(values.graceDays),
      committedReservationMonths: rules.whole(values.committedReservationMonths),
      activationTrialMonths: rules.whole(values.activationTrialMonths),
      activationTrialPlanCode:
        rules.max(values.activationTrialPlanCode, 24) ??
        (values.activationTrialMonths > 0 && !values.activationTrialPlanCode ? rules.t('trialNeedsPlanCode') : undefined),
      installmentCount: rules.whole(values.installmentCount),
    }
    for (const currency of CURRENCIES) {
      const suffix = SUFFIX[currency]
      const cash = values[`cash${suffix}`]
      const instalment = values[`installment${suffix}`]
      errors[`cash${suffix}`] = rules.money(cash)
      errors[`installment${suffix}`] = rules.money(instalment) ?? (instalment > 0 && !(cash > 0) ? rules.t('monthlyNeedsAnnual') : undefined)
      errors[`unitRef${suffix}`] = rules.money(values[`unitRef${suffix}`])
    }
    if (!errors.cashBrl && !(values.cashUsd > 0) && !(values.cashBrl > 0) && !(values.cashMxn > 0)) errors.cashBrl = rules.t('atLeastOnePrice')
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
      <Field label={t('form.name')} value={values.name} onChangeText={(name) => set({ name })} error={form.errors.name} maxLength={32} disabled={disabled} />
      <Field
        label={t('form.code')}
        value={values.code}
        onChangeText={(code) => set({ code: code.toUpperCase() })}
        error={form.errors.code}
        maxLength={24}
        autoCapitalize="characters"
        autoCorrect={false}
        disabled={disabled}
      />
      <Field label={t('form.description')} value={values.description} onChangeText={(description) => set({ description })} error={form.errors.description} maxLength={256} multiline disabled={disabled} />

      <Section title={t('form.termsSection')}>
        <NumField label={t('form.annualAllowance')} value={values.annualAllowance} onChange={(annualAllowance) => set({ annualAllowance })} error={form.errors.annualAllowance} integer disabled={disabled} />
        <NumField label={t('form.rolloverRate')} value={values.rolloverRate} onChange={(rolloverRate) => set({ rolloverRate })} error={form.errors.rolloverRate} hint={t('form.rolloverRateHint')} disabled={disabled} />
        <NumField
          label={t('form.rolloverValidity')}
          value={values.rolloverValidityMonths}
          onChange={(rolloverValidityMonths) => set({ rolloverValidityMonths })}
          error={form.errors.rolloverValidityMonths}
          hint={t('form.rolloverValidityHint')}
          integer
          disabled={disabled}
        />
        <NumField label={t('form.graceDays')} value={values.graceDays} onChange={(graceDays) => set({ graceDays })} error={form.errors.graceDays} hint={t('form.graceDaysHint')} integer disabled={disabled} />
        <NumField
          label={t('form.committedMonths')}
          value={values.committedReservationMonths}
          onChange={(committedReservationMonths) => set({ committedReservationMonths })}
          error={form.errors.committedReservationMonths}
          hint={t('form.committedMonthsHint')}
          integer
          disabled={disabled}
        />
        <NumField
          label={t('form.trialMonths')}
          value={values.activationTrialMonths}
          onChange={(activationTrialMonths) => set({ activationTrialMonths })}
          error={form.errors.activationTrialMonths}
          hint={t('form.trialMonthsHint')}
          integer
          disabled={disabled}
        />
        <Field
          label={t('form.trialPlanCode')}
          value={values.activationTrialPlanCode}
          onChangeText={(code) => set({ activationTrialPlanCode: code.toUpperCase() })}
          error={form.errors.activationTrialPlanCode}
          maxLength={24}
          autoCapitalize="characters"
          autoCorrect={false}
          disabled={disabled}
        />
      </Section>

      <Section title={t('form.priceSection')}>
        <Muted>{t('form.priceHint')}</Muted>
        <NumField
          label={t('form.installmentCount')}
          value={values.installmentCount}
          onChange={(installmentCount) => set({ installmentCount })}
          error={form.errors.installmentCount}
          hint={t('form.installmentCountHint')}
          integer
          disabled={disabled}
        />
        {CURRENCIES.map((currency) => {
          const suffix = SUFFIX[currency]
          return (
            <Section key={currency}>
              <NumField label={t('form.cash', { currency })} value={values[`cash${suffix}`]} onChange={(value) => set({ [`cash${suffix}`]: value })} error={form.errors[`cash${suffix}`]} disabled={disabled} />
              <NumField
                label={t('form.installment', { currency, count: Number.isFinite(values.installmentCount) ? values.installmentCount : 0 })}
                value={values[`installment${suffix}`]}
                onChange={(value) => set({ [`installment${suffix}`]: value })}
                error={form.errors[`installment${suffix}`]}
                disabled={disabled}
              />
              <NumField
                label={t('form.unitRef', { currency, allowance: Number.isFinite(values.annualAllowance) ? values.annualAllowance : 0 })}
                value={values[`unitRef${suffix}`]}
                onChange={(value) => set({ [`unitRef${suffix}`]: value })}
                error={form.errors[`unitRef${suffix}`]}
                disabled={disabled}
              />
            </Section>
          )
        })}
      </Section>

      <SwitchRow label={t('status.active')} value={values.isActive} onChange={(isActive) => set({ isActive })} disabled={disabled} />
      {canEdit ? <Button label={submitLabel} onPress={submit} loading={form.pending} fullWidth /> : null}
    </>
  )
}
