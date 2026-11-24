import { useState } from 'react'
import { View } from 'react-native'
import { appApi, type ProfileEditView } from '@/api/app'
import { useT } from '@/i18n'
import { useLocale } from '@/i18n/locale'
import { toDateInput } from '@/lib/format'
import { Button, Card, DateField, Field, Heading, Muted, SelectField, SwitchRow, useAction, useNotify } from '@/ui'
import { AvatarPicker } from './AvatarPicker'
import { countryOptions, stateOptions } from './countries'
import { useGenderOptions, type Gender } from './MemorialForm'

type EditProfile = ProfileEditView['profile']

const TEXT_KEYS = [
  'firstName', 'lastName', 'maidenName', 'nickname',
  'birthPlace', 'birthState', 'birthCountry',
  'deathPlace', 'deathState', 'deathCountry', 'deathCause',
  'phoneCountryCode', 'phone',
  'website', 'instagram', 'linkedin', 'fb', 'x', 'tiktok', 'youtube', 'otherSocial',
  'notes',
] as const
type TextKey = (typeof TEXT_KEYS)[number]

const ADDRESS_KEYS = ['zip', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'country'] as const
type AddressKey = (typeof ADDRESS_KEYS)[number]

const SOCIAL: readonly { key: TextKey; label: string; other?: boolean }[] = [
  { key: 'website', label: 'website' },
  { key: 'instagram', label: 'instagram' },
  { key: 'linkedin', label: 'linkedin' },
  { key: 'fb', label: 'facebook' },
  { key: 'x', label: 'x' },
  { key: 'tiktok', label: 'tiktok' },
  { key: 'youtube', label: 'youtube' },
  { key: 'otherSocial', label: 'otherSocial', other: true },
]

interface Values {
  text: Record<TextKey, string>
  address: Record<AddressKey, string>
  gender: Gender | null
  birthDate: string
  deathDate: string
  avatarUrl: string | null
  isPublicProfile: boolean
}

function initialValues(profile: EditProfile): Values {
  const text = Object.fromEntries(TEXT_KEYS.map((key) => [key, (profile[key] as string | null) ?? ''])) as Record<TextKey, string>
  const address = Object.fromEntries(ADDRESS_KEYS.map((key) => [key, profile.address?.[key] ?? (key === 'country' ? 'BR' : '')])) as Record<AddressKey, string>
  const gender = profile.gender === 'MALE' || profile.gender === 'FEMALE' || profile.gender === 'OTHER' ? profile.gender : null
  return {
    text,
    address,
    gender,
    birthDate: toDateInput(profile.birthDate),
    deathDate: toDateInput(profile.deathDate),
    avatarUrl: profile.avatarUrl,
    isPublicProfile: profile.isPublicProfile,
  }
}

interface ProfileEditFormProps {
  profile: EditProfile
  /** A memorial (death section, `updateMemorial`) or the signed-in user's own profile (`updateProfile`). */
  memorial: boolean
  onSaved: () => void | Promise<void>
}

/** The full profile form of the web edit page, for a memorial or the user's own living profile. */
export function ProfileEditForm({ profile, memorial, onSaved }: ProfileEditFormProps) {
  const t = useT('Memorialized')
  const te = useT('Errors')
  const ta = useT('Common')
  const locale = useLocale((state) => state.locale)
  const notify = useNotify()
  const { run, pending } = useAction()
  const genders = useGenderOptions()
  const countries = countryOptions(locale)
  const [form, setForm] = useState<Values>(() => initialValues(profile))
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [uploading, setUploading] = useState(false)

  const setText = (key: TextKey, value: string) => setForm((current) => ({ ...current, text: { ...current.text, [key]: value } }))
  const setAddress = (key: AddressKey, value: string) => setForm((current) => ({ ...current, address: { ...current.address, [key]: value } }))

  async function save() {
    if (uploading) {
      notify.info(t('avatar.waitUploading'))
      return
    }
    const next: Record<string, string> = {}
    const required: TextKey[] = ['firstName', 'lastName', 'birthCountry', 'birthPlace', 'birthState', ...(memorial ? (['deathCountry', 'deathPlace', 'deathState'] as const) : [])]
    for (const key of required) if (!form.text[key].trim()) next[key] = te('required')
    if (!form.gender) next.gender = te('required')
    if (!form.birthDate) next.birthDate = te('required')
    if (memorial && !form.deathDate) next.deathDate = te('required')
    else if (memorial && form.birthDate && form.deathDate < form.birthDate) next.deathDate = te('deathBeforeBirth')
    setErrors(next)
    if (Object.keys(next).length > 0) {
      notify.error(t('toasts.fixFields'))
      return
    }

    const text = Object.fromEntries(TEXT_KEYS.map((key) => [key, form.text[key].trim()]))
    const payload = {
      ...text,
      gender: form.gender,
      avatarUrl: form.avatarUrl,
      birthDate: form.birthDate,
      deathDate: form.deathDate || null,
      address: Object.fromEntries(ADDRESS_KEYS.map((key) => [key, form.address[key].trim()])),
      isPublicProfile: form.isPublicProfile,
    }
    await run(() => (memorial ? appApi.updateMemorial(profile.id, payload) : appApi.updateProfile(payload)), {
      success: t('toasts.saved'),
      onSuccess: onSaved,
    })
  }

  const textField = (key: TextKey, label: string, options: { placeholder?: string; required?: boolean; multiline?: boolean; maxLength?: number } = {}) => (
    <Field
      label={label}
      value={form.text[key]}
      onChangeText={(value) => setText(key, value)}
      placeholder={options.placeholder}
      error={errors[key]}
      required={options.required}
      multiline={options.multiline}
      maxLength={options.maxLength ?? 100}
    />
  )

  /** A select for countries with a fixed state list, free text otherwise. */
  const stateField = (key: 'birthState' | 'deathState', country: string) => {
    const options = stateOptions(country)
    return options.length > 0 ? (
      <SelectField label={t('fields.state')} value={form.text[key] || null} options={options} onChange={(value) => setText(key, value)} placeholder={t('placeholders.state')} error={errors[key]} searchable />
    ) : (
      textField(key, t('fields.state'), { placeholder: t('placeholders.state'), required: true })
    )
  }

  const today = new Date()
  const addressStates = stateOptions(form.address.country)

  return (
    <View className="gap-4">
      <Card>
        <Heading>{t('sections.identity')}</Heading>
        <AvatarPicker
          value={form.avatarUrl}
          onChange={(url) => setForm((current) => ({ ...current, avatarUrl: url }))}
          name={`${form.text.firstName} ${form.text.lastName}`.trim()}
          payload={{ profileId: profile.id }}
          onUploadingChange={setUploading}
          removable
        />
        {textField('firstName', t('fields.firstName'), { placeholder: t('placeholders.firstName'), required: true })}
        {textField('lastName', t('fields.lastName'), { placeholder: t('placeholders.lastName'), required: true })}
        {textField('maidenName', t('fields.maidenName'), { placeholder: t('placeholders.maidenName') })}
        {textField('nickname', t('fields.nickname'), { placeholder: t('placeholders.nickname') })}
        <SelectField<Gender> label={t('fields.gender')} value={form.gender} options={genders} onChange={(value) => setForm((current) => ({ ...current, gender: value }))} placeholder={t('placeholders.notSpecified')} error={errors.gender} />
      </Card>

      {!memorial ? (
        <Card>
          <SwitchRow
            label={t('privacy.label')}
            description={t('privacy.description')}
            value={form.isPublicProfile}
            onChange={(value) => setForm((current) => ({ ...current, isPublicProfile: value }))}
          />
        </Card>
      ) : null}

      <Card>
        <Heading>{t('sections.birth')}</Heading>
        <DateField label={t('fields.date')} value={form.birthDate} onChange={(value) => setForm((current) => ({ ...current, birthDate: value }))} placeholder={t('date.pick')} error={errors.birthDate} maximumDate={today} />
        <SelectField
          label={t('fields.country')}
          value={form.text.birthCountry || null}
          options={countries}
          onChange={(value) => setForm((current) => ({ ...current, text: { ...current.text, birthCountry: value, birthState: '' } }))}
          placeholder={t('placeholders.country')}
          error={errors.birthCountry}
          searchable
        />
        {stateField('birthState', form.text.birthCountry)}
        {textField('birthPlace', t('fields.city'), { placeholder: t('placeholders.city'), required: true })}
      </Card>

      {memorial ? (
        <Card>
          <Heading>{t('sections.death')}</Heading>
          <DateField
            label={t('fields.date')}
            value={form.deathDate}
            onChange={(value) => setForm((current) => ({ ...current, deathDate: value }))}
            placeholder={t('date.pick')}
            error={errors.deathDate}
            maximumDate={today}
            minimumDate={form.birthDate ? new Date(`${form.birthDate}T12:00:00`) : undefined}
          />
          <SelectField
            label={t('fields.country')}
            value={form.text.deathCountry || null}
            options={countries}
            onChange={(value) => setForm((current) => ({ ...current, text: { ...current.text, deathCountry: value, deathState: '' } }))}
            placeholder={t('placeholders.country')}
            error={errors.deathCountry}
            searchable
          />
          {stateField('deathState', form.text.deathCountry)}
          {textField('deathPlace', t('fields.city'), { placeholder: t('placeholders.city'), required: true })}
          {textField('deathCause', t('fields.deathCause'), { placeholder: t('placeholders.deathCause'), maxLength: 200 })}
        </Card>
      ) : (
        <>
          <Card>
            <Heading>{t('sections.contact')}</Heading>
            <Muted>{t('notes.notPublic')}</Muted>
            <Field label={t('fields.countryCode')} value={form.text.phoneCountryCode} onChangeText={(value) => setText('phoneCountryCode', value)} keyboardType="phone-pad" maxLength={5} />
            <Field label={t('fields.phone')} value={form.text.phone} onChangeText={(value) => setText('phone', value)} keyboardType="phone-pad" maxLength={30} autoComplete="tel" />
          </Card>
          <Card>
            <Heading>{t('sections.address')}</Heading>
            <Muted>{t('notes.notPublic')}</Muted>
            <SelectField
              label={ta('address.country')}
              value={form.address.country || null}
              options={countries}
              onChange={(value) => setForm((current) => ({ ...current, address: { ...current.address, country: value, state: '' } }))}
              placeholder={ta('address.selectPlaceholder')}
              searchable
            />
            <Field label={ta('address.zipCode')} value={form.address.zip} onChangeText={(value) => setAddress('zip', value)} autoComplete="postal-code" maxLength={20} />
            <Field label={ta('address.street')} value={form.address.street} onChangeText={(value) => setAddress('street', value)} maxLength={150} />
            <Field label={ta('address.number')} value={form.address.number} onChangeText={(value) => setAddress('number', value)} maxLength={20} />
            <Field label={ta('address.complement')} value={form.address.complement} onChangeText={(value) => setAddress('complement', value)} maxLength={100} />
            <Field label={ta('address.neighborhood')} value={form.address.neighborhood} onChangeText={(value) => setAddress('neighborhood', value)} maxLength={100} />
            <Field label={ta('address.city')} value={form.address.city} onChangeText={(value) => setAddress('city', value)} maxLength={100} />
            {addressStates.length > 0 ? (
              <SelectField label={ta('address.state')} value={form.address.state || null} options={addressStates} onChange={(value) => setAddress('state', value)} placeholder={ta('address.selectPlaceholder')} searchable />
            ) : (
              <Field label={ta('address.state')} value={form.address.state} onChangeText={(value) => setAddress('state', value)} maxLength={100} />
            )}
          </Card>
        </>
      )}

      <Card>
        <Heading>{t('sections.social')}</Heading>
        {SOCIAL.map((entry) => (
          <Field
            key={entry.key}
            label={t(`fields.${entry.label}`)}
            value={form.text[entry.key]}
            onChangeText={(value) => setText(entry.key, value)}
            placeholder={entry.other ? t('placeholders.otherLink') : entry.key === 'website' ? undefined : t('placeholders.handleOrUrl')}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={250}
          />
        ))}
      </Card>

      <Card>
        <Heading>{t('sections.notes')}</Heading>
        <Muted>{t('notes.notPublic')}</Muted>
        {textField('notes', t('sections.notes'), { placeholder: t('placeholders.notes'), multiline: true, maxLength: 1000 })}
      </Card>

      <Button label={ta('save')} loading={pending} disabled={uploading} onPress={() => void save()} fullWidth size="lg" />
    </View>
  )
}
