import { useState } from 'react'
import { View } from 'react-native'
import type { ActionResponse } from '@/api/client'
import type { FormPayload } from '@/api/app'
import { useT } from '@/i18n'
import { toDateInput } from '@/lib/format'
import { Button, Card, CheckRow, DateField, Field, Heading, Muted, SelectField, useAction, useNotify, type Option } from '@/ui'
import { AvatarPicker } from './AvatarPicker'

type PetGender = 'MALE' | 'FEMALE'

export interface PetInitial {
  firstName: string
  species: string | null
  breed: string | null
  gender: string | null
  birthDate: string | null
  deathDate: string | null
  avatarUrl: string | null
  ownerIds: string[]
}

interface PetFormProps {
  /** Present when editing: uploads are authorised against the pet itself. */
  profileId?: string
  initial: PetInitial
  ownerOptions: readonly { id: string; name: string }[]
  submitLabel: string
  successMessage: string
  submit: (data: FormPayload) => Promise<ActionResponse<unknown>>
  onSaved: (response: ActionResponse<unknown> & { ok: true }) => void | Promise<void>
}

/** Pet identity, dates, photo and owners: the fields of the web pet create and edit forms. */
export function PetForm({ profileId, initial, ownerOptions, submitLabel, successMessage, submit, onSaved }: PetFormProps) {
  const t = useT('Pets')
  const te = useT('Errors')
  const notify = useNotify()
  const { run, pending } = useAction()
  const [form, setForm] = useState(() => ({
    firstName: initial.firstName,
    species: initial.species ?? '',
    breed: initial.breed ?? '',
    gender: (initial.gender === 'MALE' || initial.gender === 'FEMALE' ? initial.gender : null) as PetGender | null,
    birthDate: toDateInput(initial.birthDate),
    deathDate: toDateInput(initial.deathDate),
    avatarUrl: initial.avatarUrl,
    ownerIds: initial.ownerIds,
  }))
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [uploading, setUploading] = useState(false)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }))

  const genders: Option<PetGender>[] = [
    { value: 'MALE', label: t('gender.male') },
    { value: 'FEMALE', label: t('gender.female') },
  ]

  function toggleOwner(id: string, selected: boolean) {
    set('ownerIds', selected ? [...form.ownerIds.filter((owner) => owner !== id), id] : form.ownerIds.filter((owner) => owner !== id))
  }

  async function save() {
    if (uploading) {
      notify.info(t('avatar.waitUploading'))
      return
    }
    const next: Record<string, string> = {}
    if (!form.firstName.trim()) next.firstName = te('required')
    if (form.ownerIds.length === 0) next.ownerIds = t('errors.needOwner')
    if (form.birthDate && form.deathDate && form.deathDate < form.birthDate) next.deathDate = te('deathBeforeBirth')
    setErrors(next)
    if (Object.keys(next).length > 0) {
      notify.error(next.ownerIds ?? next.deathDate ?? next.firstName)
      return
    }
    await run(
      () =>
        submit({
          firstName: form.firstName.trim(),
          species: form.species.trim() || null,
          breed: form.breed.trim() || null,
          gender: form.gender,
          birthDate: form.birthDate || null,
          deathDate: form.deathDate || null,
          avatarUrl: form.avatarUrl,
          ownerIds: form.ownerIds,
        }),
      { success: successMessage, onSuccess: onSaved },
    )
  }

  const today = new Date()

  return (
    <View className="gap-4">
      <Card>
        <AvatarPicker
          value={form.avatarUrl}
          onChange={(url) => set('avatarUrl', url)}
          name={form.firstName}
          payload={profileId ? { profileId } : { scope: 'create-pet' }}
          onUploadingChange={setUploading}
          removable
        />
        <Field label={t('fields.name')} value={form.firstName} onChangeText={(value) => set('firstName', value)} placeholder={t('placeholders.name')} error={errors.firstName} required maxLength={64} autoCapitalize="words" />
        <Field label={t('fields.species')} value={form.species} onChangeText={(value) => set('species', value)} placeholder={t('placeholders.species')} maxLength={40} />
        <Field label={t('fields.breed')} value={form.breed} onChangeText={(value) => set('breed', value)} placeholder={t('placeholders.breed')} maxLength={60} />
        <SelectField<PetGender>
          label={t('fields.gender')}
          value={form.gender}
          options={genders}
          onChange={(value) => set('gender', value)}
          placeholder={t('placeholders.notSpecified')}
          clearLabel={t('placeholders.notSpecified')}
          onClear={() => set('gender', null)}
        />
        <DateField label={t('fields.birthDate')} value={form.birthDate} onChange={(value) => set('birthDate', value)} placeholder={t('date.pick')} maximumDate={today} />
        <DateField
          label={t('fields.deathDate')}
          value={form.deathDate}
          onChange={(value) => set('deathDate', value)}
          placeholder={t('date.pick')}
          error={errors.deathDate}
          maximumDate={today}
          minimumDate={form.birthDate ? new Date(`${form.birthDate}T12:00:00`) : undefined}
        />
      </Card>

      <Card>
        <Heading>{t('sections.owners')}</Heading>
        <Muted>{t('owners.description')}</Muted>
        {ownerOptions.map((owner) => (
          <CheckRow key={owner.id} label={owner.name} value={form.ownerIds.includes(owner.id)} onChange={(selected) => toggleOwner(owner.id, selected)} />
        ))}
        {errors.ownerIds ? <Muted className="text-danger">{errors.ownerIds}</Muted> : null}
      </Card>

      <Button label={submitLabel} loading={pending} disabled={uploading} onPress={() => void save()} fullWidth size="lg" />
    </View>
  )
}
