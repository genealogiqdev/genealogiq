import { useState } from 'react'
import { View } from 'react-native'
import type { ActionResponse } from '@/api/client'
import type { FormPayload } from '@/api/app'
import { useT } from '@/i18n'
import { useLocale } from '@/i18n/locale'
import { Button, Card, DateField, Field, Heading, SelectField, useAction, useNotify, type Option } from '@/ui'
import { AvatarPicker } from './AvatarPicker'
import { countryOptions } from './countries'

export type Gender = 'MALE' | 'FEMALE' | 'OTHER'

export function useGenderOptions(withOther = true): Option<Gender>[] {
  const t = useT('Memorialized')
  return [
    { value: 'MALE', label: t('gender.male') },
    { value: 'FEMALE', label: t('gender.female') },
    ...(withOther ? [{ value: 'OTHER' as const, label: t('gender.other') }] : []),
  ]
}

interface Values {
  firstName: string
  lastName: string
  gender: Gender | null
  birthDate: string
  birthPlace: string
  birthCountry: string
  deathDate: string
  deathPlace: string
  deathCountry: string
  avatarUrl: string | null
}

const empty: Values = {
  firstName: '',
  lastName: '',
  gender: null,
  birthDate: '',
  birthPlace: '',
  birthCountry: '',
  deathDate: '',
  deathPlace: '',
  deathCountry: '',
  avatarUrl: null,
}

interface MemorialFormProps {
  submitLabel: string
  /** `createMemorial` or `activateGenCode`: both take the same payload and answer the new profile id. */
  submit: (data: FormPayload) => Promise<ActionResponse<{ id: string }>>
  onCreated: (id: string) => void | Promise<void>
  successMessage: string
}

/** The short memorial form shared by "new memorial" and GenCode activation. */
export function MemorialForm({ submitLabel, submit, onCreated, successMessage }: MemorialFormProps) {
  const t = useT('Memorialized')
  const te = useT('Errors')
  const locale = useLocale((state) => state.locale)
  const notify = useNotify()
  const { run, pending } = useAction()
  const genders = useGenderOptions()
  const countries = countryOptions(locale)
  const [form, setForm] = useState<Values>(empty)
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({})
  const [uploading, setUploading] = useState(false)
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setForm((current) => ({ ...current, [key]: value }))

  async function save() {
    if (uploading) {
      notify.info(t('avatar.waitUploading'))
      return
    }
    const next: typeof errors = {}
    if (!form.firstName.trim()) next.firstName = te('required')
    if (!form.lastName.trim()) next.lastName = te('required')
    if (!form.birthDate) next.birthDate = te('required')
    if (!form.deathDate) next.deathDate = te('required')
    else if (form.birthDate && form.deathDate < form.birthDate) next.deathDate = te('deathBeforeBirth')
    setErrors(next)
    if (Object.keys(next).length > 0) {
      notify.error(t('toasts.fixFields'))
      return
    }
    await run(
      () =>
        submit({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          gender: form.gender,
          birthDate: form.birthDate,
          birthPlace: form.birthPlace.trim() || undefined,
          birthCountry: form.birthCountry || undefined,
          deathDate: form.deathDate,
          deathPlace: form.deathPlace.trim() || undefined,
          deathCountry: form.deathCountry || undefined,
          avatarUrl: form.avatarUrl,
        }),
      {
        success: successMessage,
        onSuccess: async (response) => {
          if (response.data?.id) await onCreated(response.data.id)
        },
      },
    )
  }

  const today = new Date()

  return (
    <View className="gap-4">
      <Card>
        <AvatarPicker
          value={form.avatarUrl}
          onChange={(url) => set('avatarUrl', url)}
          name={`${form.firstName} ${form.lastName}`.trim()}
          payload={{ scope: 'create-memorial' }}
          onUploadingChange={setUploading}
          removable
        />
        <Field label={t('fields.firstName')} value={form.firstName} onChangeText={(value) => set('firstName', value)} placeholder={t('placeholders.firstName')} error={errors.firstName} required maxLength={100} autoCapitalize="words" />
        <Field label={t('fields.lastName')} value={form.lastName} onChangeText={(value) => set('lastName', value)} placeholder={t('placeholders.lastName')} error={errors.lastName} required maxLength={100} autoCapitalize="words" />
        <SelectField<Gender>
          label={t('fields.gender')}
          value={form.gender}
          options={genders}
          onChange={(value) => set('gender', value)}
          placeholder={t('placeholders.notSpecified')}
          clearLabel={t('placeholders.notSpecified')}
          onClear={() => set('gender', null)}
        />
      </Card>

      <Card>
        <Heading>{t('sections.birth')}</Heading>
        <DateField label={t('fields.date')} value={form.birthDate} onChange={(value) => set('birthDate', value)} placeholder={t('date.pick')} error={errors.birthDate} maximumDate={today} />
        <SelectField label={t('fields.country')} value={form.birthCountry || null} options={countries} onChange={(value) => set('birthCountry', value)} placeholder={t('placeholders.country')} searchable clearLabel={t('date.clear')} onClear={() => set('birthCountry', '')} />
        <Field label={t('fields.city')} value={form.birthPlace} onChangeText={(value) => set('birthPlace', value)} placeholder={t('placeholders.city')} maxLength={100} />
      </Card>

      <Card>
        <Heading>{t('sections.death')}</Heading>
        <DateField
          label={t('fields.date')}
          value={form.deathDate}
          onChange={(value) => set('deathDate', value)}
          placeholder={t('date.pick')}
          error={errors.deathDate}
          maximumDate={today}
          minimumDate={form.birthDate ? new Date(`${form.birthDate}T12:00:00`) : undefined}
        />
        <SelectField label={t('fields.country')} value={form.deathCountry || null} options={countries} onChange={(value) => set('deathCountry', value)} placeholder={t('placeholders.country')} searchable clearLabel={t('date.clear')} onClear={() => set('deathCountry', '')} />
        <Field label={t('fields.city')} value={form.deathPlace} onChangeText={(value) => set('deathPlace', value)} placeholder={t('placeholders.city')} maxLength={100} />
      </Card>

      <Button label={submitLabel} loading={pending} disabled={uploading} onPress={() => void save()} fullWidth size="lg" />
    </View>
  )
}
