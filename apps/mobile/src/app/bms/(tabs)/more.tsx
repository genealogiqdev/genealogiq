import { useQueryClient } from '@tanstack/react-query'
import { AccountPanel } from '@/features/account/AccountPanel'
import { useGo } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { Card, Divider, ListRow, Screen } from '@/ui'

export default function More() {
  const t = useT('Sidebar')
  const tn = useT('Nav')
  const tf = useT('Feedback')
  const go = useGo()
  const client = useQueryClient()
  return (
    <Screen>
      <AccountPanel
        system="bms"
        // Prices and prerequisite lists follow the language's currency: drop them so they reload.
        onLocaleChange={() => void client.invalidateQueries({ queryKey: ['bms'] })}
      />
      <Card>
        <ListRow icon="person-outline" title={tn('profile')} onPress={() => go.push('/bms/profile')} />
        <Divider />
        <ListRow icon="business-outline" title={t('items.companyData')} onPress={() => go.push('/bms/company')} />
        <Divider />
        <ListRow icon="people-circle-outline" title={t('items.systemUsers')} onPress={() => go.push('/bms/users')} />
      </Card>
      <Card>
        <ListRow icon="chatbubble-ellipses-outline" title={tf('links.sendFeedback')} onPress={() => go.push('/bms/feedback', { type: 'feedback' })} />
        <Divider />
        <ListRow icon="bug-outline" title={tf('links.reportBug')} onPress={() => go.push('/bms/feedback', { type: 'bug' })} />
      </Card>
    </Screen>
  )
}
