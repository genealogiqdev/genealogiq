import { useState } from 'react'
import type { AssignableRole, BmsRole, UserFormValues } from '@/api/bms'
import type { ActionResponse } from '@/api/client'
import { useT } from '@/i18n'
import { Button, DateField, Field, Section, SelectField, SwitchRow } from '@/ui'
import { AddressFields, FormError, PhoneFields, ReadOnlyNote } from './fields'
import { useFormSubmit, useRules, validCpf } from './lib'

export const ASSIGNABLE_ROLES: readonly AssignableRole[] = ['OWNER', 'ADMIN', 'COMERCIAL', 'FINANCE', 'USER']

interface Props {
  initial: UserFormValues
  roles: readonly AssignableRole[]
  /** The stored role when it is not assignable (SUPER_ADMIN): shown, never offered. */
  currentRole?: BmsRole
  canEdit: boolean
  submitLabel: string
  save: (values: UserFormValues) => Promise<ActionResponse>
  onSaved: (message?: string) => void | Promise<void>
}

/** A back-office operator (web: user-form). */
export function UserForm({ initial, roles, currentRole, canEdit, submitLabel, save, onSaved }: Props) {
  const t = useT('Users')
  const rules = useRules()
  const form = useFormSubmit()
  const [values, setValues] = useState(initial)
  const set = (patch: Partial<UserFormValues>) => setValues((current) => ({ ...current, ...patch }))
  const disabled = !canEdit
  const assignable = (roles as readonly string[]).includes(currentRole ?? values.role)

  function submit() {
    const invalid = form.invalid({
      firstName: rules.min(values.firstName, 2),
      lastName: rules.min(values.lastName, 2),
      email: rules.email(values.email),
      role: (roles as readonly string[]).includes(values.role) && assignable ? undefined : rules.t('invalidRole'),
      nationalId: values.nationalId && !validCpf(values.nationalId) ? rules.t('invalidCpf') : undefined,
      phoneCountryCode: values.phoneCountryCode ? undefined : rules.t('countryCodeRequired'),
    })
    if (invalid) return
    void form.submit(
      () => save({ ...values, email: values.email.trim() }),
      (response) => onSaved(response.message),
    )
  }

  return (
    <>
      {canEdit ? null : <ReadOnlyNote />}
      <FormError message={form.error} />
      <Field label={t('fields.firstName')} value={values.firstName} onChangeText={(firstName) => set({ firstName })} error={form.errors.firstName} disabled={disabled} />
      <Field label={t('fields.lastName')} value={values.lastName} onChangeText={(lastName) => set({ lastName })} error={form.errors.lastName} disabled={disabled} />
      <Field label={t('fields.email')} value={values.email} onChangeText={(email) => set({ email })} error={form.errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} disabled={disabled} />
      {assignable ? (
        <SelectField<AssignableRole>
          label={t('fields.role')}
          placeholder={t('placeholders.role')}
          value={values.role}
          options={roles.map((role) => ({ value: role, label: t(`roles.${role}`) }))}
          onChange={(role) => set({ role })}
          error={form.errors.role}
          disabled={disabled}
        />
      ) : (
        <Field label={t('fields.role')} value={t(`roles.${currentRole}`)} error={form.errors.role} disabled />
      )}
      {canEdit ? (
        <SelectField
          label={t('fields.gender')}
          value={values.gender ?? ''}
          options={[
            { value: 'Female', label: t('gender.female') },
            { value: 'Male', label: t('gender.male') },
          ]}
          onChange={(gender) => set({ gender })}
        />
      ) : null}
      <Field label={t('fields.cpf')} value={values.nationalId ?? ''} onChangeText={(nationalId) => set({ nationalId })} error={form.errors.nationalId} keyboardType="numbers-and-punctuation" disabled={disabled} />
      {canEdit ? (
        <DateField label={t('fields.birthDate')} value={values.birthDate ?? ''} onChange={(birthDate) => set({ birthDate })} maximumDate={new Date()} />
      ) : (
        <Field label={t('fields.birthDate')} value={values.birthDate ?? ''} disabled />
      )}
      <PhoneFields
        code={values.phoneCountryCode}
        phone={values.phone ?? ''}
        onCode={(phoneCountryCode) => set({ phoneCountryCode })}
        onPhone={(phone) => set({ phone })}
        codeLabel={t('fields.countryCode')}
        phoneLabel={t('fields.phone')}
        errors={form.errors}
        disabled={disabled}
      />
      <SwitchRow label={t('active')} value={values.isActive} onChange={(isActive) => set({ isActive })} disabled={disabled} />
      {/* Read-only roles receive no address. */}
      {canEdit ? (
        <Section title={t('sections.address')}>
          <AddressFields value={values.address} onChange={(address) => set({ address })} />
        </Section>
      ) : null}
      {canEdit ? <Button label={submitLabel} onPress={submit} loading={form.pending} fullWidth /> : null}
    </>
  )
}
