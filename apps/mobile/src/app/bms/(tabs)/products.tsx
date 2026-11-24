import { useGo } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { Card, Divider, ListRow, Screen } from '@/ui'

export default function ProductsHub() {
  const t = useT('Sidebar')
  const tg = useT('GenCodePackages')
  const go = useGo()
  return (
    <Screen>
      <Card>
        <ListRow icon="layers-outline" title={t('items.partnerPlans')} onPress={() => go.push('/bms/plans')} />
        <Divider />
        <ListRow icon="qr-code-outline" title={t('items.gencodePackages')} subtitle={tg('description')} onPress={() => go.push('/bms/gencodes')} />
        <Divider />
        <ListRow icon="card-outline" title={t('items.subscriptions')} onPress={() => go.push('/bms/subscriptions')} />
        <Divider />
        <ListRow icon="add-circle-outline" title={t('items.extraUnits')} onPress={() => go.push('/bms/extra-unit-prices')} />
      </Card>
    </Screen>
  )
}
