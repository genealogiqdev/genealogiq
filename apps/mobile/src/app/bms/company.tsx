import { Stack } from 'expo-router'
import { useState } from 'react'
import { bmsApi, type CompanyFormValues, type CompanyView } from '@/api/bms'
import { AddressFields, EMPTY_ADDRESS, FormError, PhoneFields, ReadOnlyNote } from '@/features/bms/fields'
import { useFormSubmit, useRefresh, useRules } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Button, Field, QueryView, Screen, Section, SwitchRow, useNotify } from '@/ui'

function CompanyEditor({ view, refresh }: { view: CompanyView; refresh: { refreshing: boolean; onRefresh: () => void } }) {
  const t = useT('Company')
  const rules = useRules()
  const notify = useNotify()
  const invalidate = useBmsInvalidate()
  const form = useFormSubmit()
  const { company, canEdit } = view
  const disabled = !canEdit
  const [values, setValues] = useState<CompanyFormValues>({
    legalName: company.legalName,
    tradeName: company.tradeName,
    taxId: company.taxId,
    stateRegistration: company.stateRegistration ?? '',
    municipalRegistration: company.municipalRegistration ?? '',
    email: company.email,
    phoneCountryCode: company.phoneCountryCode,
    phone: company.phone,
    isActive: company.isActive,
    address: { ...EMPTY_ADDRESS, ...(company.address ?? {}) },
  })
  const set = (patch: Partial<CompanyFormValues>) => setValues((current) => ({ ...current, ...patch }))

  function save() {
    const invalid = form.invalid({
      legalName: rules.min(values.legalName, 2),
      tradeName: rules.min(values.tradeName, 2),
      taxId: rules.required(values.taxId),
      email: rules.email(values.email),
      phoneCountryCode: values.phoneCountryCode ? undefined : rules.t('countryCodeRequired'),
      phone: rules.required(values.phone),
    })
    if (invalid) return
    void form.submit(
      () => bmsApi.updateCompany(company.id, { ...values, email: values.email.trim() }),
      async (response) => {
        notify.success(response.message ?? t('toasts.updated'))
        await invalidate(['company'])
      },
    )
  }

  return (
    <Screen {...refresh}>
      {canEdit ? null : <ReadOnlyNote />}
      <FormError message={form.error} />
      <Field label={t('fields.legalName')} value={values.legalName} onChangeText={(legalName) => set({ legalName })} error={form.errors.legalName} disabled={disabled} />
      <Field label={t('fields.tradeName')} value={values.tradeName} onChangeText={(tradeName) => set({ tradeName })} error={form.errors.tradeName} disabled={disabled} />
      <Field label={t('fields.cnpj')} value={values.taxId} onChangeText={(taxId) => set({ taxId })} error={form.errors.taxId} keyboardType="numbers-and-punctuation" disabled={disabled} />
      <Field label={t('fields.stateRegistration')} value={values.stateRegistration ?? ''} onChangeText={(stateRegistration) => set({ stateRegistration })} disabled={disabled} />
      <Field label={t('fields.municipalRegistration')} value={values.municipalRegistration ?? ''} onChangeText={(municipalRegistration) => set({ municipalRegistration })} disabled={disabled} />
      <Field label={t('fields.email')} value={values.email} onChangeText={(email) => set({ email })} error={form.errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} disabled={disabled} />
      <PhoneFields
        code={values.phoneCountryCode}
        phone={values.phone}
        onCode={(phoneCountryCode) => set({ phoneCountryCode })}
        onPhone={(phone) => set({ phone })}
        codeLabel={t('fields.countryCode')}
        phoneLabel={t('fields.phone')}
        errors={form.errors}
        disabled={disabled}
      />
      <SwitchRow label={t('fields.active')} value={values.isActive} onChange={(isActive) => set({ isActive })} disabled={disabled} />
      <Section title={t('sections.address')}>
        <AddressFields value={values.address} onChange={(address) => set({ address })} disabled={disabled} />
      </Section>
      {canEdit ? <Button label={t('save')} onPress={save} loading={form.pending} fullWidth /> : null}
    </Screen>
  )
}

export default function Company() {
  const t = useT('Company')
  const query = useView('bms', ['company'], () => bmsApi.company())
  const refresh = useRefresh(query)
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <QueryView query={query}>{(view) => <CompanyEditor view={view} refresh={refresh} />}</QueryView>
    </>
  )
}
