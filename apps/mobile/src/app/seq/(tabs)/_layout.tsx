import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import type { ComponentProps } from 'react'
import { useT } from '@/i18n'
import { headingFont, usePalette } from '@/theme'

type IconName = ComponentProps<typeof Ionicons>['name']

const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: unknown; size: number }) {
    return <Ionicons name={name} color={typeof color === 'string' ? color : undefined} size={size} />
  }

export default function SeqTabs() {
  const palette = usePalette('seq')
  const t = useT()
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.fg,
        headerTitleStyle: { fontFamily: headingFont('seq'), color: palette.fg },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: palette.bg },
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.muted,
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: t('Dashboard.title'), tabBarIcon: icon('speedometer-outline') }} />
      <Tabs.Screen name="gencodes" options={{ title: t('Sidebar.items.myGenCodes'), tabBarLabel: t('Mobile.seq.tabs.genCodes'), tabBarIcon: icon('qr-code-outline') }} />
      <Tabs.Screen name="customers" options={{ title: t('Customers.title'), tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="buy" options={{ title: t('Mobile.seq.tabs.buy'), tabBarIcon: icon('cart-outline') }} />
      <Tabs.Screen name="more" options={{ title: t('Mobile.seq.tabs.more'), tabBarIcon: icon('menu-outline') }} />
    </Tabs>
  )
}
