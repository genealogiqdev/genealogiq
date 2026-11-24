import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ApiError, login } from '@/api/client'
import { useSession } from '@/auth/session'
import { SYSTEMS, SYSTEM_META, type SystemId } from '@/config'
import { AuthShell, SystemPicker } from '@/features/auth/AuthShell'
import { safeInternalPath } from '@/features/auth/links'
import { useErrorMessage, useT } from '@/i18n'
import { Button, Field, LinkText, Muted, PasswordField, Row, Text } from '@/ui'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignIn() {
  const t = useT('Mobile')
  const router = useRouter()
  const errorMessage = useErrorMessage()
  const params = useLocalSearchParams<{ system?: string; callbackUrl?: string; notice?: string }>()

  const selected = useSession((state) => state.selected)
  const sessions = useSession((state) => state.sessions)
  // Only a system with a stored session counts as signed in.
  const active = useSession((state) => (state.active && state.sessions[state.active] ? state.active : null))
  const select = useSession((state) => state.select)
  const signIn = useSession((state) => state.signIn)
  const switchTo = useSession((state) => state.switchTo)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // A link such as sequoia.genealogiq.com.br/sign-in preselects its system.
  useEffect(() => {
    if (params.system && (SYSTEMS as readonly string[]).includes(params.system)) select(params.system as SystemId)
  }, [params.system, select])

  const callback = safeInternalPath(params.callbackUrl)
  if (active) return <Redirect href={callback && active === 'app' ? callback : SYSTEM_META[active].home} />

  const systemName = t(`systems.${selected}.name`)
  const alreadySignedIn = !!sessions[selected]

  async function submit() {
    const next: typeof errors = {}
    if (!email.trim()) next.email = t('auth.required')
    else if (!EMAIL.test(email.trim())) next.email = t('auth.invalidEmail')
    if (!password) next.password = t('auth.required')
    setErrors(next)
    setFailure(null)
    if (next.email || next.password) return

    setPending(true)
    try {
      const response = await login(selected, email.trim(), password)
      await signIn(selected, response)
      setPassword('')
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.code === 'wrongSystem'
          ? t('errors.wrongSystem', { system: systemName })
          : errorMessage(error),
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell system={selected} title={t('auth.signInTitle', { system: systemName })} subtitle={t('auth.chooseSystem')}>
      <SystemPicker
        value={selected}
        onChange={(system) => {
          select(system)
          setFailure(null)
        }}
      />

      {params.notice ? (
        <View className="rounded-xl bg-default p-3">
          <Text className="text-sm">{t(`auth.${params.notice}`)}</Text>
        </View>
      ) : null}

      {alreadySignedIn ? (
        <Button label={t('account.signedInAs', { name: sessions[selected]!.user.name })} icon="arrow-forward" onPress={() => void switchTo(selected)} fullWidth />
      ) : (
        <View className="gap-4">
          <Field
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
          />
          <PasswordField
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          {failure ? (
            <View className="rounded-xl border border-danger p-3" accessibilityRole="alert">
              <Text className="text-sm text-danger">{failure}</Text>
            </View>
          ) : null}
          <Button label={t('auth.signIn')} onPress={() => void submit()} loading={pending} fullWidth size="lg" />
          <LinkText label={t('auth.forgotPassword')} onPress={() => router.push('/forgot-password')} className="self-center" />
        </View>
      )}

      {SYSTEM_META[selected].canSignUp ? (
        <Row className="justify-center">
          <Muted>{t('auth.noAccount')}</Muted>
          <LinkText
            label={t('auth.signUp')}
            onPress={() => router.push({ pathname: '/sign-up', params: callback ? { callbackUrl: callback } : {} })}
          />
        </Row>
      ) : (
        <Muted className="text-center">{t('auth.invitedOnly', { system: systemName })}</Muted>
      )}
    </AuthShell>
  )
}
