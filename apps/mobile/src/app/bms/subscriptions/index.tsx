import { Stack } from 'expo-router'
import { bmsApi } from '@/api/bms'
import { HeaderAction, ListView, StatusBadge } from '@/features/bms/fields'
import { useGo, useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatDate, formatMoney } from '@/lib/format'
import { useView } from '@/lib/query'
import { Card, KeyValue, Muted, QueryView, Row, Text } from '@/ui'

export default function Subscriptions() {
  const t = useT('Subscriptions')
  const go = useGo()
  const query = useView('bms', ['subscriptions'], () => bmsApi.subscriptions())
  const refresh = useRefresh(query)
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <QueryView query={query}>
        {(data) => (
          <ListView
            data={data.subscriptions}
            keyOf={(row) => row.id}
            emptyTitle={t('table.empty')}
            {...refresh}
            header={data.isAdmin ? <HeaderAction label={t('new')} onPress={() => go.push('/bms/subscriptions/new')} /> : undefined}
            render={(row) => (
              <Card onPress={() => go.push(`/bms/subscriptions/${row.id}`)}>
                <Row className="justify-between">
                  <Text className="flex-1 font-semibold">{row.name}</Text>
                  <StatusBadge active={row.isActive} />
                </Row>
                <Muted>{row.code}</Muted>
                {row.description ? <Muted>{row.description}</Muted> : null}
                {/* The list price is the plan's US-dollar price, as in the web table. */}
                <KeyValue label={t('table.price')} value={row.priceUsd > 0 ? formatMoney(row.priceUsd, 'USD') : t('free')} />
                <KeyValue label={t('table.term')} value={row.termLength === 0 ? t('lifetime') : String(row.termLength)} />
                <KeyValue label={t('table.createdAt')} value={formatDate(row.createdAt)} />
              </Card>
            )}
          />
        )}
      </QueryView>
    </>
  )
}
