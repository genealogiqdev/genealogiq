import { usePathname, useRouter } from 'expo-router'
import { View } from 'react-native'
import { useSession } from '@/auth/session'
import { useT } from '@/i18n'
import { Button, Card, Heading, Icon, Muted, Row } from '@/ui'

/** Shown to a signed-out visitor: sign in or create an account, then come back to this screen. */
export function SignUpPrompt({ callbackUrl, onNavigate }: { callbackUrl?: string; onNavigate?: () => void }) {
  const t = useT('Auth')
  const router = useRouter()
  const pathname = usePathname()
  const select = useSession((state) => state.select)
  const target = callbackUrl ?? pathname

  function go(path: '/sign-in' | '/sign-up') {
    select('app')
    onNavigate?.()
    router.push({ pathname: path, params: { system: 'app', callbackUrl: target } })
  }

  return (
    <Card>
      <Row>
        <Icon name="lock-open-outline" size={24} />
        <View className="flex-1">
          <Heading>{t('signupWallTitle')}</Heading>
          <Muted>{t('signupWallDescription')}</Muted>
        </View>
      </Row>
      <Button label={t('createAccount')} onPress={() => go('/sign-up')} fullWidth />
      <Button label={t('signIn')} variant="secondary" onPress={() => go('/sign-in')} fullWidth />
    </Card>
  )
}
