import '../../global.css'

import '@formatjs/intl-locale/polyfill-force'
import '@formatjs/intl-pluralrules/polyfill-force'
import '@formatjs/intl-pluralrules/locale-data/en'
import '@formatjs/intl-pluralrules/locale-data/pt'
import '@formatjs/intl-pluralrules/locale-data/es'

import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter'
import { Spectral_600SemiBold } from '@expo-google-fonts/spectral'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { HeroUINativeProvider } from 'heroui-native'
import { useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { ApiError } from '@/api/client'
import { useSession } from '@/auth/session'
import { I18nProvider, useCurrentSystem } from '@/i18n'
import { useLocale } from '@/i18n/locale'
import { useApplyTheme, useIsDark, usePalette, useThemePreference } from '@/theme'

void SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Permission and not-found answers will not change on retry.
      retry: (count, error) =>
        !(error instanceof ApiError && [401, 403, 404, 400].includes(error.status)) && count < 2,
    },
  },
})

function ThemedStack() {
  const system = useCurrentSystem()
  useApplyTheme(system)
  const palette = usePalette(system)
  const dark = useIsDark()
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.fg,
          headerShadowVisible: false,
        }}
      />
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Spectral_600SemiBold,
  })
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    void Promise.all([
      useSession.getState().hydrate(),
      useLocale.getState().hydrate(),
      useThemePreference.getState().hydrate(),
    ]).finally(() => setHydrated(true))
  }, [])

  const ready = fontsLoaded && hydrated
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync()
  }, [ready])

  if (!ready) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <HeroUINativeProvider>
              <ThemedStack />
            </HeroUINativeProvider>
          </I18nProvider>
        </QueryClientProvider>
    </GestureHandlerRootView>
  )
}
