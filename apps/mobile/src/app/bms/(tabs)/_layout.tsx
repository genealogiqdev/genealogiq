import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router/js-tabs'
import type { ComponentProps } from 'react'
import { useT } from '@/i18n'
import { usePalette } from '@/theme'

type IconName = ComponentProps<typeof Ionicons>['name']

const TABS: { name: string; icon: IconName }[] = [
  { name: 'dashboard', icon: 'grid-outline' },
  { name: 'customers', icon: 'people-outline' },
  { name: 'sales', icon: 'trending-up-outline' },
  { name: 'products', icon: 'pricetags-outline' },
  { name: 'more', icon: 'ellipsis-horizontal-circle-outline' },
]

export default function BmsTabs() {
  const t = useT('Mobile.bms')
  const palette = usePalette('bms')
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.fg,
        headerTitleStyle: { fontFamily: 'Inter_600SemiBold' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: palette.bg },
        tabBarActiveTintColor: palette.fg,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(`tabs.${tab.name}`),
            tabBarAccessibilityLabel: t(`tabs.${tab.name}`),
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} size={size} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  )
}
