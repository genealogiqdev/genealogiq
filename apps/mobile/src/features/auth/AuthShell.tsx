import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Pressable, Text as RNText, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SYSTEMS, type SystemId } from '@/config'
import { useT } from '@/i18n'
import { BRAND_GRADIENT } from '@/theme'
import { KeyboardScrollView, Muted, Sheet, Title } from '@/ui'

const SYSTEM_ICONS: Record<SystemId, keyof typeof Ionicons.glyphMap> = {
  app: 'leaf-outline',
  seq: 'qr-code-outline',
  bms: 'briefcase-outline',
}

/** Brand header + rounded content card shared by every signed-out screen. */
export function AuthShell({ system, title, subtitle, children }: { system: SystemId; title: string; subtitle?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <View className="flex-1 bg-background">
      <LinearGradient
        colors={[BRAND_GRADIENT[system][0], BRAND_GRADIENT[system][1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + 28, paddingBottom: 56, paddingHorizontal: 24 }}
      >
        <Image
          source={require('../../../assets/images/wordmark-on-dark.png')}
          style={{ width: 190, height: 33 }}
          contentFit="contain"
          accessibilityLabel="Genealogiq"
        />
      </LinearGradient>
      <View className="-mt-8 flex-1 overflow-hidden rounded-t-3xl bg-background">
        <KeyboardScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-5">
            <View className="gap-1">
              <Title>{title}</Title>
              {subtitle ? <Muted>{subtitle}</Muted> : null}
            </View>
            {children}
          </View>
        </KeyboardScrollView>
      </View>
    </View>
  )
}

function SystemBadge({ system, size = 40 }: { system: SystemId; size?: number }) {
  return (
    <LinearGradient
      colors={[BRAND_GRADIENT[system][0], BRAND_GRADIENT[system][1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size * 0.32, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={SYSTEM_ICONS[system]} size={size * 0.5} color="#FFFFFF" />
    </LinearGradient>
  )
}

/** The three systems as a dropdown. Choosing one re-themes the screen. */
export function SystemPicker({ value, onChange }: { value: SystemId; onChange: (system: SystemId) => void }) {
  const t = useT('Mobile')
  const [open, setOpen] = useState(false)
  return (
    <View className="gap-1.5">
      <RNText className="text-sm font-medium text-foreground">{t('auth.system')}</RNText>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t('auth.system')}: ${t(`systems.${value}.name`)}`}
        accessibilityHint={t('auth.chooseSystem')}
        className="min-h-14 flex-row items-center gap-3 rounded-2xl border border-field-border bg-field px-3 py-2 active:opacity-80"
      >
        <SystemBadge system={value} size={36} />
        <View className="flex-1">
          <RNText className="text-base font-semibold text-field-foreground">{t(`systems.${value}.name`)}</RNText>
          <Muted numberOfLines={1}>{t(`systems.${value}.tagline`)}</Muted>
        </View>
        <Ionicons name="chevron-down" size={18} color="#8A93A3" />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('auth.chooseSystem')}>
        <View accessibilityRole="radiogroup" className="gap-2">
          {SYSTEMS.map((system) => {
            const selected = system === value
            return (
              <Pressable
                key={system}
                onPress={() => {
                  onChange(system)
                  setOpen(false)
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t(`systems.${system}.name`)}
                className={`flex-row items-center gap-3 rounded-2xl border p-3 ${selected ? 'border-accent bg-surface' : 'border-border bg-surface-secondary'}`}
              >
                <SystemBadge system={system} />
                <View className="flex-1">
                  <RNText className="text-base font-semibold text-foreground">{t(`systems.${system}.name`)}</RNText>
                  <Muted>{t(`systems.${system}.tagline`)}</Muted>
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={22} color={BRAND_GRADIENT[system][0]} /> : null}
              </Pressable>
            )
          })}
        </View>
      </Sheet>
    </View>
  )
}
