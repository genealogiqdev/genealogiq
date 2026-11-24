import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { authApi } from '@/api/auth'
import { useSession } from '@/auth/session'
import { AuthShell } from '@/features/auth/AuthShell'
import { systemFromParam } from '@/features/auth/links'
import { useErrorMessage, useT } from '@/i18n'
import { Button, Field, LinkText, Text } from '@/ui'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPassword() {
  const t = useT('Mobile')
  const router = useRouter()
  const errorMessage = useErrorMessage()
  const params = useLocalSearchParams<{ system?: string }>()
  const selected = useSession((state) => state.selected)
  const system = systemFromParam(params.system, selected)

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit() {
    if (!EMAIL.test(email.trim())) {
      setError(t('auth.invalidEmail'))
      return
    }
    setError(null)
    setPending(true)
    try {
      const result = await authApi.forgotPassword(system, email.trim())
      if (result.ok) setSent(true)
      else setError(result.message)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell system={system} title={t('auth.forgotTitle')} subtitle={`${t(`systems.${system}.name`)} · ${t('auth.forgotHint')}`}>
      {sent ? (
        <View className="rounded-xl bg-default p-4" accessibilityRole="alert">
          <Text>{t('auth.forgotSent')}</Text>
        </View>
      ) : (
        <View className="gap-4">
          <Field label={t('auth.email')} value={email} onChangeText={setEmail} error={error} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" returnKeyType="send" onSubmitEditing={() => void submit()} />
          <Button label={t('auth.sendLink')} onPress={() => void submit()} loading={pending} fullWidth size="lg" />
        </View>
      )}
      <LinkText label={t('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} className="self-center" />
    </AuthShell>
  )
}
