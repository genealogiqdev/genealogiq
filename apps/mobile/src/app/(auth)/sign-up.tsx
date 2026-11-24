import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { authApi } from '@/api/auth'
import { AuthShell } from '@/features/auth/AuthShell'
import { safeInternalPath } from '@/features/auth/links'
import { useErrorMessage, useT } from '@/i18n'
import { Button, Field, LinkText, Muted, PasswordField, Row, Text } from '@/ui'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Errors = Partial<Record<'firstName' | 'lastName' | 'email' | 'password', string>>

/** Genealogiq (consumer) registration. Staff and partner accounts are invitation-only. */
export default function SignUp() {
  const t = useT('Mobile')
  const router = useRouter()
  const errorMessage = useErrorMessage()
  const params = useLocalSearchParams<{ callbackUrl?: string }>()
  const callbackUrl = safeInternalPath(params.callbackUrl)

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }))

  async function submit() {
    const next: Errors = {}
    if (form.firstName.trim().length < 2) next.firstName = t('auth.nameTooShort')
    if (form.lastName.trim().length < 2) next.lastName = t('auth.nameTooShort')
    if (!EMAIL.test(form.email.trim())) next.email = t('auth.invalidEmail')
    if (form.password.length < 8) next.password = t('auth.passwordTooShort')
    setErrors(next)
    setFailure(null)
    if (Object.keys(next).length > 0) return

    setPending(true)
    try {
      const result = await authApi.signUp({ ...form, email: form.email.trim(), callbackUrl })
      if (!result.ok) {
        setFailure(result.message)
        const fields = result.fieldErrors ?? {}
        setErrors(Object.fromEntries(Object.entries(fields).map(([key, messages]) => [key, messages?.[0]])) as Errors)
        return
      }
      router.replace({ pathname: '/sign-in', params: { system: 'app', notice: 'signUpSent', ...(callbackUrl ? { callbackUrl } : {}) } })
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell system="app" title={t('auth.signUp')}>
      <View className="gap-4">
        <Field label={t('auth.firstName')} value={form.firstName} onChangeText={set('firstName')} error={errors.firstName} autoComplete="given-name" textContentType="givenName" />
        <Field label={t('auth.lastName')} value={form.lastName} onChangeText={set('lastName')} error={errors.lastName} autoComplete="family-name" textContentType="familyName" />
        <Field label={t('auth.email')} value={form.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
        <PasswordField label={t('auth.password')} value={form.password} onChangeText={set('password')} error={errors.password} hint={t('auth.resetHint')} autoComplete="new-password" textContentType="newPassword" />
        {failure ? (
          <View className="rounded-xl border border-danger p-3" accessibilityRole="alert">
            <Text className="text-sm text-danger">{failure}</Text>
          </View>
        ) : null}
        <Button label={t('auth.signUp')} onPress={() => void submit()} loading={pending} fullWidth size="lg" />
      </View>
      <Row className="justify-center">
        <Muted>{t('auth.haveAccount')}</Muted>
        <LinkText label={t('auth.signIn')} onPress={() => router.replace('/sign-in')} />
      </Row>
    </AuthShell>
  )
}
