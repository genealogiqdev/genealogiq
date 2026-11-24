import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import type { ColorValue } from 'react-native'
import { appApi } from '@/api/app'
import { RequireSession } from '@/auth/guard'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { headingFont, usePalette } from '@/theme'

type TabIcon = keyof typeof Ionicons.glyphMap

function AppTabs() {
  const t = useT('Mobile.app')
  const palette = usePalette('app')
  // The same read the web header uses for its bell badge.
  const header = useView('app', ['header'], appApi.header, { refetchInterval: 60_000 })
  const unread = header.data?.unreadCount ?? 0

  const icon = (name: TabIcon, focusedName: TabIcon) =>
    function TabBarIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
      return <Ionicons name={focused ? focusedName : name} size={size} color={color as string} />
    }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.fg,
        headerTitleStyle: { fontFamily: headingFont('app'), color: palette.fg },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: palette.bg },
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.muted,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('tabs.home'), tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="scan" options={{ title: t('tabs.scan'), tabBarIcon: icon('qr-code-outline', 'qr-code') }} />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarIcon: icon('notifications-outline', 'notifications'),
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: palette.danger, color: '#FFFFFF' },
          tabBarAccessibilityLabel: unread > 0 ? t('tabs.messagesUnread', { count: unread }) : t('tabs.messages'),
        }}
      />
      <Tabs.Screen name="account" options={{ title: t('tabs.account'), tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  )
}

/** The signed-in Genealogiq shell: Home, Scan, Messages and Account. */
export default function AppTabsLayout() {
  return (
    <RequireSession system="app">
      <AppTabs />
    </RequireSession>
  )
}
