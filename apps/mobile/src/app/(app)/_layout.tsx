import { Stack } from 'expo-router'
import { useEffect } from 'react'
import { useSession } from '@/auth/session'
import { useCurrentSystem, useT } from '@/i18n'
import { headingFont, usePalette } from '@/theme'
import { LoadingState } from '@/ui'

/**
 * Every Genealogiq screen. The stack is deliberately NOT wrapped in
 * `RequireSession`: public profiles and `/qr/[genCode]` open signed out. The
 * signed-in tabs live in `(tabs)`, and other signed-in-only screens call
 * `useRequireAppSession()`.
 */
export default function AppLayout() {
  const t = useT('Common')
  const palette = usePalette('app')
  const current = useCurrentSystem()
  const hasSession = useSession((state) => !!state.sessions.app)
  const active = useSession((state) => state.active)
  const switchTo = useSession((state) => state.switchTo)

  // A link can land here while another system is on screen: Genealogiq's
  // catalogue and theme must be the ones in use, with or without a session.
  const aligned = current === 'app' && (!hasSession || active === 'app')
  useEffect(() => {
    if (!aligned) void switchTo('app')
  }, [aligned, switchTo])

  if (!aligned) return <LoadingState />

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.fg,
        headerTitleStyle: { fontFamily: headingFont('app'), color: palette.fg },
        headerShadowVisible: false,
        headerBackTitle: t('back'),
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: palette.bg },
        title: '',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  )
}
