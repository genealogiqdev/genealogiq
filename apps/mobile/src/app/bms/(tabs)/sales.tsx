import { useGo, useMe, useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { Card, Divider, ListRow, QueryView, Screen } from '@/ui'

export default function SalesHub() {
  const t = useT('Sidebar')
  const tr = useT('SalesReports')
  const tm = useT('ManualCoupons')
  const tg = useT('PartnerGenCodes')
  const go = useGo()
  const me = useMe()
  const refresh = useRefresh(me)
  return (
    <QueryView query={me}>
      {(data) => (
        <Screen {...refresh}>
          <Card>
            <ListRow icon="document-text-outline" title={t('items.contracts')} onPress={() => go.push('/bms/contracts')} />
            {data.isConsumerAdmin ? (
              <>
                <Divider />
                <ListRow icon="qr-code-outline" title={t('items.partnerGenCodes')} subtitle={tg('description')} onPress={() => go.push('/bms/partner-gencodes')} />
              </>
            ) : null}
            <Divider />
            <ListRow icon="bar-chart-outline" title={tr('title')} subtitle={tr('subtitle')} onPress={() => go.push('/bms/reports')} />
            <Divider />
            <ListRow icon="pricetag-outline" title={t('items.discountCoupons')} onPress={() => go.push('/bms/coupons')} />
            {data.isAdmin ? (
              <>
                <Divider />
                <ListRow icon="checkmark-done-outline" title={tm('title')} onPress={() => go.push('/bms/coupons/redeem')} />
              </>
            ) : null}
          </Card>
        </Screen>
      )}
    </QueryView>
  )
}
