import { Stack } from 'expo-router'
import { RequireSession } from '@/auth/guard'
import { headingFont, usePalette } from '@/theme'

export default function SeqLayout() {
  const palette = usePalette('seq')
  return (
    <RequireSession system="seq">
      <Stack
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.fg,
          headerTitleStyle: { fontFamily: headingFont('seq'), color: palette.fg },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: palette.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </RequireSession>
  )
}
