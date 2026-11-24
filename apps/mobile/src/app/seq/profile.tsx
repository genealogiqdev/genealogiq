import { useQueryClient } from '@tanstack/react-query'
import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { ApiError } from '@/api/client'
import { seqApi, seqHttp, type ProfileView } from '@/api/seq'
import { useSession } from '@/auth/session'
import { FormFields, useAddressSpecs, useForm, type Spec } from '@/features/seq/forms'
import { EMAIL, addressInput, addressValues, dateOnly, digitsOnly, maskCpf, nullable, text } from '@/features/seq/util'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { PermissionDeniedError, pickMedia, uploadFile } from '@/lib/upload'
import { Avatar, Button, Card, Field, Heading, Muted, PasswordField, QueryView, Row, Screen, Section, Sheet, confirm, useAction, useNotify } from '@/ui'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

type Dialog = 'email' | 'password' | 'delete' | null

function AvatarCard({ view }: { view: ProfileView }) {
  const t = useT('Profile')
  const tc = useT('Mobile.common')
  const ta = useT('Actions.profile')
  const notify = useNotify()
  const invalidate = useInvalidate('seq')
  const updateUser = useSession((state) => state.updateUser)
  const [busy, setBusy] = useState(false)

  async function change() {
    setBusy(true)
    try {
      const [file] = await pickMedia()
      if (!file) return
      if (file.kind !== 'image') {
        notify.error(t('avatar.invalidType'))
        return
      }
      if (file.size > MAX_AVATAR_BYTES) {
        notify.error(t('avatar.tooLarge'))
        return
      }
      const url = await uploadFile('seq', seqHttp.profileUpload(), file)
      const result = await seqApi.updateAvatar(url)
      if (!result.ok) {
        notify.error(result.message || t('avatar.uploadFailed'))
        return
      }
      await updateUser('seq', { image: url })
      await invalidate(['profile'], ['me'])
      notify.success(ta('avatarUpdated'))
    } catch (failure) {
      if (failure instanceof PermissionDeniedError) notify.error(tc('permissionDenied'))
      else if (failure instanceof ApiError) notify.error(failure)
      else notify.error(t('avatar.uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <Row>
        <Avatar uri={view.image || null} name={view.fullName} size={64} />
        <View className="flex-1">
          <Heading>{view.fullName}</Heading>
          <Muted>{view.email}</Muted>
        </View>
      </Row>
      <Button label={t('avatar.change')} icon="camera-outline" variant="secondary" onPress={() => void change()} loading={busy} fullWidth />
    </Card>
  )
}

function AccountDialog({ kind, onClose }: { kind: Exclude<Dialog, null>; onClose: () => void }) {
  const t = useT('Mobile.seq.profile')
  const te = useT('Errors')
  const tc = useT('Mobile.common')
  const router = useRouter()
  const queryClient = useQueryClient()
  const signOut = useSession((state) => state.signOut)
  const { run, pending } = useAction()
  const [email, setEmail] = useState('')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [errors, setErrors] = useState<{ email?: string; current?: string; next?: string }>({})

  async function submit() {
    const found: typeof errors = {}
    if (!current) found.current = te('required')
    if (kind === 'email') {
      if (!email.trim()) found.email = te('required')
      else if (!EMAIL.test(email.trim())) found.email = te('invalidEmail')
    }
    if (kind === 'password') {
      if (!next) found.next = te('required')
      else if (next.length < 8) found.next = te('minChars', { count: 8 })
    }
    setErrors(found)
    if (found.email || found.current || found.next) return

    if (kind === 'email') {
      await run(() => seqApi.requestEmailChange(email.trim().toLowerCase(), current), { success: true, onSuccess: onClose })
    } else if (kind === 'password') {
      await run(() => seqApi.changePassword(current, next), { success: true, onSuccess: onClose })
    } else {
      const accepted = await confirm({ title: t('deleteAccount'), message: t('deleteAccountWarning'), confirmLabel: t('deleteAccount'), cancelLabel: tc('cancel'), destructive: true })
      if (!accepted) return
      await run(() => seqApi.deleteAccount(current), {
        onSuccess: async () => {
          onClose()
          // The account is gone: discard its token and everything cached for it.
          await signOut('seq')
          queryClient.removeQueries({ queryKey: ['seq'] })
          router.replace('/sign-in')
        },
      })
    }
  }

  return (
    <Sheet visible onClose={() => (pending ? undefined : onClose())} title={t(kind === 'email' ? 'changeEmail' : kind === 'password' ? 'changePassword' : 'deleteAccount')}>
      <Muted>{t(kind === 'email' ? 'changeEmailHint' : kind === 'password' ? 'changePasswordHint' : 'deleteAccountWarning')}</Muted>
      {kind === 'email' ? (
        <Field
          label={t('newEmail')}
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          disabled={pending}
        />
      ) : null}
      <PasswordField label={t('currentPassword')} value={current} onChangeText={setCurrent} error={errors.current} autoComplete="current-password" disabled={pending} />
      {kind === 'password' ? (
        <PasswordField label={t('newPassword')} value={next} onChangeText={setNext} error={errors.next} autoComplete="new-password" disabled={pending} />
      ) : null}
      <Button
        label={t(kind === 'email' ? 'changeEmail' : kind === 'password' ? 'changePassword' : 'deleteAccount')}
        variant={kind === 'delete' ? 'danger' : 'primary'}
        onPress={() => void submit()}
        loading={pending}
        fullWidth
      />
    </Sheet>
  )
}

function ProfileForm({ view, refresh, refreshing }: { view: ProfileView; refresh: () => Promise<unknown>; refreshing: boolean }) {
  const t = useT('Profile')
  const tc = useT('Common')
  const te = useT('Errors')
  const tm = useT('Mobile.seq.profile')
  const invalidate = useInvalidate('seq')
  const updateUser = useSession((state) => state.updateUser)
  const user = view.user
  const form = useForm({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    nationalId: user?.nationalId ? maskCpf(user.nationalId) : '',
    birthDate: dateOnly(user?.birthDate),
    phoneCountryCode: user?.phoneCountryCode ?? '55',
    phone: user?.phone ?? '',
    ...addressValues(user?.address),
  })
  const address = useAddressSpecs()
  const [dialog, setDialog] = useState<Dialog>(null)
  const personal: Spec[] = [
    { key: 'firstName', label: t('fields.firstName'), required: true, min: 2 },
    { key: 'lastName', label: t('fields.lastName'), required: true, min: 2 },
    { key: 'nationalId', label: t('fields.cpf'), kind: 'number', mask: maskCpf, placeholder: '000.000.000-00', max: 14 },
    { key: 'birthDate', label: t('fields.birthDate'), kind: 'date' },
    { key: 'phoneCountryCode', label: t('fields.countryCode'), kind: 'number', required: true, requiredMessage: te('countryCodeRequired'), max: 4 },
    { key: 'phone', label: t('fields.phone'), kind: 'phone' },
  ]

  async function save() {
    if (!form.validate([...personal, ...address])) return
    const values = form.values
    await form.submit(
      () =>
        seqApi.updateProfile({
          firstName: text(values, 'firstName'),
          lastName: text(values, 'lastName'),
          nationalId: digitsOnly(text(values, 'nationalId')) || null,
          birthDate: nullable(values, 'birthDate'),
          phoneCountryCode: text(values, 'phoneCountryCode'),
          phone: nullable(values, 'phone'),
          address: addressInput(values),
        }),
      {
        success: true,
        onSuccess: async () => {
          await updateUser('seq', { name: `${text(values, 'firstName')} ${text(values, 'lastName')}`.trim() })
          await invalidate(['profile'], ['me'], ['users'])
        },
      },
    )
  }

  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
      <AvatarCard view={view} />

      <Section title={t('sections.personal.title')}>
        <Muted>{t('sections.personal.description')}</Muted>
        <FormFields specs={personal} form={form} />
      </Section>
      <Section title={t('sections.address')}>
        <FormFields specs={address} form={form} />
      </Section>
      <Button label={form.pending ? tc('saving') : t('actions.save')} onPress={() => void save()} loading={form.pending} fullWidth />

      <Section title={t('sections.account.title')}>
        <Muted>{t('sections.account.description')}</Muted>
        <Field label={t('fields.email')} value={view.email} editable={false} disabled hint={t('sections.account.emailHint')} />
        <Button label={tm('changeEmail')} icon="mail-outline" variant="secondary" onPress={() => setDialog('email')} fullWidth />
        <Button label={tm('changePassword')} icon="key-outline" variant="secondary" onPress={() => setDialog('password')} fullWidth />
      </Section>

      <Section title={t('sections.danger.title')}>
        <Muted>{t('sections.danger.description')}</Muted>
        <Button label={tm('deleteAccount')} icon="trash-outline" variant="danger-soft" onPress={() => setDialog('delete')} fullWidth />
      </Section>

      {dialog ? <AccountDialog kind={dialog} onClose={() => setDialog(null)} /> : null}
    </Screen>
  )
}

export default function SeqProfile() {
  const t = useT('Profile')
  const query = useView('seq', ['profile'], () => seqApi.profile())
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <QueryView query={query}>{(view) => <ProfileForm view={view} refresh={query.refetch} refreshing={query.isRefetching} />}</QueryView>
    </>
  )
}
