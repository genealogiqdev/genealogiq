import { useQueryClient } from '@tanstack/react-query'
import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { bmsApi, bmsHttp, type ProfileFormValues, type ProfileView } from '@/api/bms'
import { useSession } from '@/auth/session'
import { AddressFields, EMPTY_ADDRESS, FormError, PhoneFields } from '@/features/bms/fields'
import { useFormSubmit, useRefresh, useRules, validCpf } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { PermissionDeniedError, pickMedia, uploadFile } from '@/lib/upload'
import { Avatar, Button, Card, DateField, Field, Heading, KeyValue, Muted, PasswordField, QueryView, Screen, Section, Sheet, confirm, useNotify } from '@/ui'

type Dialog = 'email' | 'password' | 'delete' | null

function AccountDialogs({ dialog, close }: { dialog: Dialog; close: () => void }) {
  const t = useT('Account')
  const tm = useT('Mobile')
  const tc = useT('Common')
  const rules = useRules()
  const router = useRouter()
  const client = useQueryClient()
  const notify = useNotify()
  const form = useFormSubmit()
  const signOut = useSession((state) => state.signOut)
  const [newEmail, setNewEmail] = useState('')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  function reset() {
    setNewEmail('')
    setCurrent('')
    setNext('')
    form.setError(null)
    form.setErrors({})
    close()
  }

  function changeEmail() {
    if (form.invalid({ newEmail: rules.email(newEmail), currentPassword: rules.required(current) })) return
    void form.submit(
      () => bmsApi.requestEmailChange(newEmail.trim().toLowerCase(), current),
      (response) => {
        notify.success(response.message ?? tc('toasts.saved'))
        reset()
      },
    )
  }

  function changePassword() {
    if (form.invalid({ currentPassword: rules.required(current), newPassword: next.length >= 8 ? undefined : tm('auth.passwordTooShort') })) return
    void form.submit(
      () => bmsApi.changePassword(current, next),
      (response) => {
        notify.success(response.message ?? tc('toasts.saved'))
        reset()
      },
    )
  }

  async function deleteAccount() {
    if (form.invalid({ currentPassword: rules.required(current) })) return
    const yes = await confirm({
      title: t('deleteAccount.title'),
      message: t('deleteAccount.description'),
      confirmLabel: t('deleteAccount.submit'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!yes) return
    await form.submit(
      () => bmsApi.deleteAccount(current),
      async () => {
        // The account is gone: discard its token and everything cached for it.
        await signOut('bms')
        client.removeQueries({ queryKey: ['bms'] })
        router.replace('/sign-in')
      },
    )
  }

  return (
    <>
      <Sheet visible={dialog === 'email'} onClose={reset} title={t('changeEmail.title')}>
        <Muted>{t('changeEmail.description')}</Muted>
        <FormError message={form.error} />
        <Field
          label={t('changeEmail.newEmail')}
          value={newEmail}
          onChangeText={setNewEmail}
          placeholder={t('changeEmail.newEmailPlaceholder')}
          error={form.errors.newEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <PasswordField label={t('currentPassword')} value={current} onChangeText={setCurrent} error={form.errors.currentPassword} />
        <Button label={form.pending ? t('changeEmail.submitting') : t('changeEmail.trigger')} onPress={changeEmail} loading={form.pending} />
      </Sheet>

      <Sheet visible={dialog === 'password'} onClose={reset} title={t('changePassword.title')}>
        <Muted>{t('changePassword.description')}</Muted>
        <FormError message={form.error} />
        <PasswordField label={t('currentPassword')} value={current} onChangeText={setCurrent} error={form.errors.currentPassword} />
        <PasswordField label={t('newPassword')} value={next} onChangeText={setNext} error={form.errors.newPassword} hint={tm('auth.resetHintStrong')} />
        <Button label={form.pending ? t('changePassword.submitting') : t('changePassword.trigger')} onPress={changePassword} loading={form.pending} />
      </Sheet>

      <Sheet visible={dialog === 'delete'} onClose={reset} title={t('deleteAccount.title')}>
        <Muted>{t('deleteAccount.description')}</Muted>
        <FormError message={form.error} />
        <PasswordField label={t('currentPassword')} value={current} onChangeText={setCurrent} error={form.errors.currentPassword} />
        <Button label={form.pending ? t('deleteAccount.submitting') : t('deleteAccount.submit')} variant="danger" onPress={() => void deleteAccount()} loading={form.pending} />
      </Sheet>
    </>
  )
}

function ProfileEditor({ view, refresh }: { view: ProfileView; refresh: { refreshing: boolean; onRefresh: () => void } }) {
  const t = useT('Profile')
  const ta = useT('Account')
  const tc = useT('Common')
  const tm = useT('Mobile.common')
  const rules = useRules()
  const notify = useNotify()
  const invalidate = useBmsInvalidate()
  const updateUser = useSession((state) => state.updateUser)
  const form = useFormSubmit()
  const [uploading, setUploading] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [values, setValues] = useState<ProfileFormValues>({
    firstName: view.values?.firstName ?? '',
    lastName: view.values?.lastName ?? '',
    nationalId: view.values?.nationalId ?? '',
    birthDate: view.values?.birthDate ?? '',
    phoneCountryCode: view.values?.phoneCountryCode ?? '55',
    phone: view.values?.phone ?? '',
    address: { ...EMPTY_ADDRESS, ...(view.values?.address ?? {}) },
  })
  const set = (patch: Partial<ProfileFormValues>) => setValues((current) => ({ ...current, ...patch }))

  async function changeAvatar() {
    try {
      const [file] = await pickMedia()
      if (!file) return
      setUploading(true)
      const url = await uploadFile('bms', bmsHttp.profileUpload(), file)
      const response = await bmsApi.updateAvatar(url)
      if (!response.ok) {
        notify.error(response.message)
        return
      }
      if (response.message) notify.success(response.message)
      await invalidate(['profile'], ['me'])
      // The stored session shows the avatar on the More tab; read the saved URL back from the server.
      const fresh = await bmsApi.profile()
      await updateUser('bms', { image: fresh.image })
    } catch (failure) {
      notify.error(failure instanceof PermissionDeniedError ? tm('permissionDenied') : failure)
    } finally {
      setUploading(false)
    }
  }

  function save() {
    const invalid = form.invalid({
      firstName: rules.min(values.firstName, 2),
      lastName: rules.min(values.lastName, 2),
      nationalId: values.nationalId && !validCpf(values.nationalId) ? rules.t('invalidCpf') : undefined,
      phoneCountryCode: values.phoneCountryCode ? undefined : rules.t('countryCodeRequired'),
    })
    if (invalid) return
    void form.submit(
      () => bmsApi.updateProfile(values),
      async (response) => {
        notify.success(response.message ?? tc('toasts.saved'))
        await updateUser('bms', { name: `${values.firstName} ${values.lastName}`.trim() })
        await invalidate(['profile'], ['me'], ['users'])
      },
    )
  }

  return (
    <Screen {...refresh}>
      <Card>
        <View className="items-center gap-3">
          <Avatar uri={view.image} name={view.fullName} size={88} />
          <Heading>{view.fullName}</Heading>
          <Button label={t('changeAvatar')} variant="secondary" size="sm" icon="camera-outline" loading={uploading} onPress={() => void changeAvatar()} />
        </View>
      </Card>

      <Section title={t('personal.title')}>
        <Muted>{t('personal.description')}</Muted>
        <FormError message={form.error} />
        <Field label={t('fields.firstName')} value={values.firstName} onChangeText={(firstName) => set({ firstName })} error={form.errors.firstName} autoComplete="given-name" />
        <Field label={t('fields.lastName')} value={values.lastName} onChangeText={(lastName) => set({ lastName })} error={form.errors.lastName} autoComplete="family-name" />
        <Field label={t('fields.cpf')} value={values.nationalId ?? ''} onChangeText={(nationalId) => set({ nationalId })} error={form.errors.nationalId} keyboardType="numbers-and-punctuation" />
        <DateField label={t('fields.birthDate')} value={values.birthDate ?? ''} onChange={(birthDate) => set({ birthDate })} maximumDate={new Date()} />
        <PhoneFields
          code={values.phoneCountryCode}
          phone={values.phone ?? ''}
          onCode={(phoneCountryCode) => set({ phoneCountryCode })}
          onPhone={(phone) => set({ phone })}
          codeLabel={t('fields.countryCode')}
          phoneLabel={t('fields.phone')}
          errors={form.errors}
        />
      </Section>
      <Section title={t('fields.address')}>
        <AddressFields value={values.address} onChange={(address) => set({ address })} />
      </Section>
      <Button label={form.pending ? tc('saving') : tc('save')} onPress={save} loading={form.pending} fullWidth />

      <Section title={t('security.title')}>
        <Card>
          <Muted>{t('security.description')}</Muted>
          <KeyValue label={t('security.email')} value={view.email} />
          <Muted>{t('security.emailHint')}</Muted>
          <Button label={ta('changeEmail.trigger')} variant="secondary" icon="mail-outline" onPress={() => setDialog('email')} />
          <Button label={ta('changePassword.trigger')} variant="secondary" icon="key-outline" onPress={() => setDialog('password')} />
        </Card>
      </Section>

      <Section title={t('danger.title')}>
        <Card>
          <Muted>{t('danger.description')}</Muted>
          <Button label={ta('deleteAccount.trigger')} variant="danger-soft" icon="trash-outline" onPress={() => setDialog('delete')} />
        </Card>
      </Section>

      <AccountDialogs key={dialog ?? 'closed'} dialog={dialog} close={() => setDialog(null)} />
    </Screen>
  )
}

export default function Profile() {
  const t = useT('Profile')
  const query = useView('bms', ['profile'], () => bmsApi.profile())
  const refresh = useRefresh(query)
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <QueryView query={query}>{(view) => <ProfileEditor view={view} refresh={refresh} />}</QueryView>
    </>
  )
}
