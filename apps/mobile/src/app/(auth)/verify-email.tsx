import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { View } from 'react-native'
import { authApi } from '@/api/auth'
import { useSession } from '@/auth/session'
import { AuthShell } from '@/features/auth/AuthShell'
import { safeInternalPath, systemFromParam } from '@/features/auth/links'
import { useT } from '@/i18n'
import { Button, LoadingState, Text } from '@/ui'

/** Opened from the emailed confirmation link (new account, or a change of email address). */
export default function VerifyEmail() {
  const t = useT('Mobile')
  const router = useRouter()
  const params = useLocalSearchParams<{ token?: string; system?: string; callbackUrl?: string }>()
  const selected = useSession((state) => state.selected)
  const system = systemFromParam(params.system, selected)
  const token = typeof params.token === 'string' ? params.token : ''
  const callbackUrl = safeInternalPath(params.callbackUrl)

  // A token is single-use: run the confirmation exactly once per link.
  const confirmation = useQuery({
    queryKey: ['verify-email', system, token],
    queryFn: () => authApi.verifyEmail(system, token),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const succeeded = confirmation.data?.ok === true
  const failed = !token || confirmation.isError || confirmation.data?.ok === false

  return (
    <AuthShell system={system} title={t('auth.verifyTitle')} subtitle={t(`systems.${system}.name`)}>
      {!succeeded && !failed ? (
        <View className="h-32">
          <LoadingState />
        </View>
      ) : (
        <View className={`rounded-xl p-4 ${succeeded ? 'bg-default' : 'border border-danger'}`} accessibilityRole="alert">
          <Text className={succeeded ? '' : 'text-danger'}>
            {succeeded
              ? (confirmation.data?.message ?? t('auth.verifyDone'))
              : confirmation.data && !confirmation.data.ok
                ? confirmation.data.message
                : t('auth.verifyFailed')}
          </Text>
        </View>
      )}
      <Button
        label={t('auth.backToSignIn')}
        variant={succeeded ? 'primary' : 'secondary'}
        onPress={() => router.replace({ pathname: '/sign-in', params: { system, ...(callbackUrl ? { callbackUrl } : {}) } })}
        fullWidth
      />
    </AuthShell>
  )
}
