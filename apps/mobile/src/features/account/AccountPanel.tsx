import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { View } from 'react-native'
import { useSession } from '@/auth/session'
import { SUPPORTED_LOCALES, SYSTEMS, SYSTEM_META, type Locale, type SystemId } from '@/config'
import { useT } from '@/i18n'
import { useLocale } from '@/i18n/locale'
import { useThemePreference, type SchemePreference } from '@/theme'
import { Avatar, Badge, Button, Card, Heading, ListRow, Muted, Row, Segmented, SelectField, Text, confirm } from '@/ui'

const LOCALE_LABELS: Record<Locale, string> = {
  'en-US': 'English',
  'es-MX': 'Español',
  'pt-BR': 'Português',
}
// Same order as the web language switcher.
const LOCALE_ORDER: Locale[] = ['en-US', 'es-MX', 'pt-BR']

interface AccountPanelProps {
  system: SystemId
  /** Called after the language changes so a system can persist it server-side. */
  onLocaleChange?: (locale: Locale) => void
}

/**
 * Identity, system switcher, language, appearance and sign-out. Shown at the
 * top of each system's account/"More" screen.
 */
export function AccountPanel({ system, onLocaleChange }: AccountPanelProps) {
  const t = useT('Mobile')
  const router = useRouter()
  const queryClient = useQueryClient()
  const sessions = useSession((state) => state.sessions)
  const switchTo = useSession((state) => state.switchTo)
  const signOut = useSession((state) => state.signOut)
  const locale = useLocale((state) => state.locale)
  const setLocale = useLocale((state) => state.setLocale)
  const preference = useThemePreference((state) => state.preference)
  const setPreference = useThemePreference((state) => state.setPreference)
  const user = sessions[system]?.user

  async function open(target: SystemId) {
    if (target === system) return
    await switchTo(target)
    router.replace(sessions[target] ? SYSTEM_META[target].home : '/sign-in')
  }

  async function leave() {
    const systemName = t(`systems.${system}.name`)
    const confirmed = await confirm({
      title: t('account.signOut'),
      message: t('account.signOutConfirm', { system: systemName }),
      confirmLabel: t('account.signOut'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    })
    if (!confirmed) return
    await signOut(system)
    // Cached screens belong to the account that just left.
    queryClient.removeQueries({ queryKey: [system] })
    router.replace('/sign-in')
  }

  return (
    <View className="gap-4">
      {user ? (
        <Card>
          <Row>
            <Avatar uri={user.image} name={user.name} size={52} />
            <View className="flex-1">
              <Heading>{user.name}</Heading>
              <Muted>{user.email}</Muted>
            </View>
          </Row>
        </Card>
      ) : null}

      <Card>
        <Heading>{t('account.switchSystem')}</Heading>
        {SYSTEMS.map((target) => (
          <ListRow
            key={target}
            title={t(`systems.${target}.name`)}
            subtitle={sessions[target] ? sessions[target]!.user.email : t('account.signInTo', { system: t(`systems.${target}.name`) })}
            icon={target === 'app' ? 'leaf-outline' : target === 'seq' ? 'qr-code-outline' : 'briefcase-outline'}
            right={target === system ? <Badge label={t('account.signedIn')} color="accent" /> : undefined}
            chevron={target !== system}
            onPress={target === system ? undefined : () => void open(target)}
          />
        ))}
      </Card>

      <Card>
        <SelectField
          label={t('account.language')}
          value={locale}
          options={LOCALE_ORDER.filter((entry) => SUPPORTED_LOCALES.includes(entry)).map((entry) => ({ value: entry, label: LOCALE_LABELS[entry] }))}
          onChange={(next) => {
            setLocale(next)
            onLocaleChange?.(next)
          }}
        />
        <Text className="mt-2 text-sm font-medium">{t('account.appearance')}</Text>
        <Segmented<SchemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: t('account.themeSystem') },
            { value: 'light', label: t('account.themeLight') },
            { value: 'dark', label: t('account.themeDark') },
          ]}
        />
      </Card>

      <Button label={t('account.signOut')} variant="danger-soft" icon="log-out-outline" onPress={() => void leave()} fullWidth />
    </View>
  )
}
