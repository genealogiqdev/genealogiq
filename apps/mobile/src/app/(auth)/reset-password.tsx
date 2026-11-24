import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { authApi } from '@/api/auth'
import { useSession } from '@/auth/session'
import { AuthShell } from '@/features/auth/AuthShell'
import { passwordProblem, safeInternalPath, systemFromParam } from '@/features/auth/links'
import { useErrorMessage, useT } from '@/i18n'
import { Button, LinkText, PasswordField, Text } from '@/ui'

/** Opened from the emailed reset link, and from the account-setup link sent to invited users. */
export default function ResetPassword() {
  const t = useT('Mobile')
  const router = useRouter()
  const errorMessage = useErrorMessage()
  const params = useLocalSearchParams<{ token?: string; system?: string; callbackUrl?: string }>()
  const selected = useSession((state) => state.selected)
  const system = systemFromParam(params.system, selected)
  const token = typeof params.token === 'string' ? params.token : ''
  const callbackUrl = safeInternalPath(params.callbackUrl)

  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    const problem = passwordProblem(system, password)
    if (problem) {
      setError(problem === 'short' ? t('auth.passwordTooShort') : t('auth.resetHintStrong'))
      return
    }
    setError(null)
    setPending(true)
    try {
      const result = await authApi.resetPassword(system, token, password, callbackUrl)
      if (!result.ok) {
        setError(result.fieldErrors?.password?.[0] ?? result.message)
        return
      }
      router.replace({ pathname: '/sign-in', params: { system, notice: 'resetDone', ...(callbackUrl ? { callbackUrl } : {}) } })
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell system={system} title={t('auth.resetTitle')} subtitle={t(`systems.${system}.name`)}>
      {token ? (
        <View className="gap-4">
          <PasswordField
            label={t('auth.newPassword')}
            value={password}
            onChangeText={setPassword}
            error={error}
            hint={system === 'app' ? t('auth.resetHint') : t('auth.resetHintStrong')}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          <Button label={t('auth.savePassword')} onPress={() => void submit()} loading={pending} fullWidth size="lg" />
        </View>
      ) : (
        <View className="gap-4">
          <View className="rounded-xl border border-danger p-3" accessibilityRole="alert">
            <Text className="text-sm text-danger">{t('auth.resetMissingToken')}</Text>
          </View>
          <Button label={t('auth.forgotTitle')} variant="secondary" onPress={() => router.replace({ pathname: '/forgot-password', params: { system } })} fullWidth />
        </View>
      )}
      <LinkText label={t('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} className="self-center" />
    </AuthShell>
  )
}
