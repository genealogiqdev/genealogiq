import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { appApi } from '@/api/app'
import type { ActionResponse } from '@/api/client'
import { useSession } from '@/auth/session'
import { useErrorMessage, useT } from '@/i18n'
import { Button, Field, Muted, PasswordField, Segmented, Text, confirm, useNotify } from '@/ui'
import { FormSheet } from './FormSheet'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8

type FieldErrors = Record<string, string | undefined>

interface FormState {
  errors: FieldErrors
  failure: string | null
  pending: boolean
}

const idle: FormState = { errors: {}, failure: null, pending: false }

/**
 * Submit handling shared by the account forms: client-side checks first, then
 * the server's own `fieldErrors` under each field and its message above the button.
 */
function useAccountForm() {
  const [state, setState] = useState<FormState>(idle)
  const errorMessage = useErrorMessage()

  async function submit(local: FieldErrors, call: () => Promise<ActionResponse>): Promise<(ActionResponse & { ok: true }) | null> {
    const problems = Object.fromEntries(Object.entries(local).filter(([, message]) => !!message))
    if (Object.keys(problems).length > 0) {
      setState({ errors: problems, failure: null, pending: false })
      return null
    }
    setState({ errors: {}, failure: null, pending: true })
    try {
      const response = await call()
      if (!response.ok) {
        const fields = response.fieldErrors ?? {}
        setState({
          errors: Object.fromEntries(Object.entries(fields).map(([key, messages]) => [key, messages?.[0]])),
          failure: response.message,
          pending: false,
        })
        return null
      }
      setState(idle)
      return response
    } catch (error) {
      setState({ errors: {}, failure: errorMessage(error), pending: false })
      return null
    }
  }

  return { ...state, submit, reset: () => setState(idle) }
}

function Failure({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <View className="rounded-xl border border-danger p-3" accessibilityRole="alert">
      <Text className="text-sm text-danger">{message}</Text>
    </View>
  )
}

interface SheetProps {
  visible: boolean
  onClose: () => void
}

export function ChangePasswordSheet({ visible, onClose }: SheetProps) {
  const t = useT('Auth')
  const te = useT('Errors')
  const tc = useT('Mobile.common')
  const notify = useNotify()
  const form = useAccountForm()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  function close() {
    setCurrentPassword('')
    setNewPassword('')
    form.reset()
    onClose()
  }

  async function save() {
    const response = await form.submit(
      {
        currentPassword: currentPassword ? undefined : te('required'),
        newPassword: newPassword.length < MIN_PASSWORD ? te('minChars', { count: MIN_PASSWORD }) : undefined,
      },
      () => appApi.changePassword({ currentPassword, newPassword }),
    )
    if (!response) return
    notify.success(response.message ?? tc('saved'))
    close()
  }

  return (
    <FormSheet visible={visible} onClose={close} title={t('changePasswordTitle')}>
      <Muted>{t('changePasswordDescription')}</Muted>
      <PasswordField
        label={t('currentPasswordLabel')}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        error={form.errors.currentPassword}
        required
        autoComplete="current-password"
        textContentType="password"
      />
      <PasswordField
        label={t('newPasswordLabel')}
        value={newPassword}
        onChangeText={setNewPassword}
        error={form.errors.newPassword}
        hint={t('passwordRuleLength')}
        required
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Failure message={form.failure} />
      <Button label={t('changePasswordSubmit')} loading={form.pending} onPress={() => void save()} fullWidth />
    </FormSheet>
  )
}

export function ChangeEmailSheet({ visible, onClose }: SheetProps) {
  const t = useT('Auth')
  const te = useT('Errors')
  const tc = useT('Mobile.common')
  const notify = useNotify()
  const form = useAccountForm()
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')

  function close() {
    setNewEmail('')
    setCurrentPassword('')
    form.reset()
    onClose()
  }

  async function save() {
    const email = newEmail.trim()
    const response = await form.submit(
      {
        newEmail: !email ? te('required') : !EMAIL.test(email) ? te('invalidEmail') : undefined,
        currentPassword: currentPassword ? undefined : te('required'),
      },
      () => appApi.requestEmailChange({ newEmail: email, currentPassword }),
    )
    if (!response) return
    notify.success(response.message ?? tc('saved'))
    close()
  }

  return (
    <FormSheet visible={visible} onClose={close} title={t('changeEmailTitle')}>
      <Muted>{t('changeEmailDescription')}</Muted>
      <Field
        label={t('newEmailLabel')}
        value={newEmail}
        onChangeText={setNewEmail}
        placeholder={t('newEmailPlaceholder')}
        error={form.errors.newEmail}
        required
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
      />
      <PasswordField
        label={t('currentPasswordLabel')}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        error={form.errors.currentPassword}
        required
        autoComplete="current-password"
        textContentType="password"
      />
      <Failure message={form.failure} />
      <Button label={t('changeEmailSubmit')} loading={form.pending} onPress={() => void save()} fullWidth />
    </FormSheet>
  )
}

/** Password + a destructive confirmation; on success the local session and cache are discarded. */
export function DeleteAccountSheet({ visible, onClose }: SheetProps) {
  const t = useT('Auth')
  const te = useT('Errors')
  const tc = useT('Mobile.common')
  const tm = useT('Mobile.app')
  const router = useRouter()
  const notify = useNotify()
  const queryClient = useQueryClient()
  const signOut = useSession((state) => state.signOut)
  const form = useAccountForm()
  const [currentPassword, setCurrentPassword] = useState('')

  function close() {
    setCurrentPassword('')
    form.reset()
    onClose()
  }

  async function remove() {
    if (!currentPassword) {
      await form.submit({ currentPassword: te('required') }, () => Promise.resolve({ ok: true }))
      return
    }
    const confirmed = await confirm({
      title: t('deleteAccountTitle'),
      message: t('deleteAccountDescription'),
      confirmLabel: t('deleteAccountSubmit'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!confirmed) return
    const response = await form.submit({}, () => appApi.deleteAccount(currentPassword))
    if (!response) return
    setCurrentPassword('')
    onClose()
    await signOut('app')
    queryClient.removeQueries({ queryKey: ['app'] })
    notify.success(tm('account.deleted'))
    router.replace('/sign-in')
  }

  return (
    <FormSheet visible={visible} onClose={close} title={t('deleteAccountTitle')}>
      <Text className="text-danger">{t('deleteAccountDescription')}</Text>
      <PasswordField
        label={t('currentPasswordLabel')}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        error={form.errors.currentPassword}
        required
        autoComplete="current-password"
        textContentType="password"
      />
      <Failure message={form.failure} />
      <Button label={t('deleteAccountSubmit')} variant="danger" icon="trash-outline" loading={form.pending} onPress={() => void remove()} fullWidth />
      <Button label={tc('cancel')} variant="ghost" onPress={close} fullWidth />
    </FormSheet>
  )
}

type FeedbackType = 'bug' | 'contact'
const MAX_FEEDBACK = 2000

export function FeedbackSheet({ visible, onClose }: SheetProps) {
  const t = useT('Feedback')
  const te = useT('Errors')
  const notify = useNotify()
  const form = useAccountForm()
  const [type, setType] = useState<FeedbackType>('contact')
  const [message, setMessage] = useState('')

  function close() {
    setMessage('')
    form.reset()
    onClose()
  }

  async function send() {
    const text = message.trim()
    const response = await form.submit(
      { message: !text ? te('required') : text.length > MAX_FEEDBACK ? te('maxChars', { count: MAX_FEEDBACK }) : undefined },
      () => appApi.sendFeedback({ type, message: text, page: 'mobile:/account' }),
    )
    if (!response) return
    notify.success(type === 'bug' ? t('toasts.bugSent') : t('toasts.contactSent'))
    close()
  }

  return (
    <FormSheet visible={visible} onClose={close} title={type === 'bug' ? t('dialog.bugTitle') : t('dialog.contactTitle')}>
      <Segmented<FeedbackType>
        value={type}
        onChange={setType}
        options={[
          { value: 'contact', label: t('links.contact') },
          { value: 'bug', label: t('links.reportBug') },
        ]}
      />
      <Muted>{type === 'bug' ? t('dialog.bugDescription') : t('dialog.contactDescription')}</Muted>
      <Field
        label={t('fields.message')}
        value={message}
        onChangeText={setMessage}
        placeholder={t(`fields.messagePlaceholder.${type}`)}
        error={form.errors.message}
        multiline
        maxLength={MAX_FEEDBACK}
        required
      />
      <Failure message={form.failure} />
      <Button label={t('submit')} icon="send-outline" loading={form.pending} onPress={() => void send()} fullWidth />
    </FormSheet>
  )
}
