import { Stack } from 'expo-router'
import { RequireSession } from '@/auth/guard'
import { usePalette } from '@/theme'

export default function BmsLayout() {
  const palette = usePalette('bms')
  return (
    <RequireSession system="bms">
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.fg,
          headerTitleStyle: { fontFamily: 'Inter_600SemiBold' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: palette.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </RequireSession>
  )
}
