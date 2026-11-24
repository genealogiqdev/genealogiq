import { Stack } from 'expo-router'
import { GenCodeEntry } from '@/features/app/GenCodeEntry'
import { useT } from '@/i18n'
import { Card, Muted, Screen } from '@/ui'

/** Manual GenCode entry (web `/activate`). Public: the landing screen asks for an account when needed. */
export default function Activate() {
  const t = useT('Auth')
  return (
    <Screen>
      <Stack.Screen options={{ title: t('activateTitle') }} />
      <Muted>{t('activateDescription')}</Muted>
      <Card>
        <GenCodeEntry />
      </Card>
    </Screen>
  )
}
