import { Stack } from 'expo-router'
import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { bmsApi } from '@/api/bms'
import { couponDiscount, couponDuration } from '@/features/bms/coupons'
import { ListView, SearchBox, StatusBadge } from '@/features/bms/fields'
import { useGo, useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useView } from '@/lib/query'
import { Button, Card, KeyValue, Muted, QueryView, Row, Text } from '@/ui'

export default function Coupons() {
  const t = useT('DiscountCoupons')
  const go = useGo()
  const query = useView('bms', ['discountCoupons'], () => bmsApi.discountCoupons())
  const refresh = useRefresh(query)
  const [search, setSearch] = useState('')
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const all = query.data?.coupons ?? []
    return needle ? all.filter((row) => row.code.toLowerCase().includes(needle)) : all
  }, [query.data, search])
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <QueryView query={query}>
        {(data) => (
          <ListView
            data={rows}
            keyOf={(row) => row.id}
            emptyTitle={t('table.empty')}
            {...refresh}
            header={
              <View className="gap-3">
                <SearchBox value={search} onChange={setSearch} placeholder={t('table.searchByCode')} />
                {data.isAdmin ? (
                  <Row>
                    <View className="flex-1">
                      <Button label={t('actions.apply')} variant="secondary" size="sm" onPress={() => go.push('/bms/coupons/redeem')} />
                    </View>
                    <View className="flex-1">
                      <Button label={t('new')} icon="add" size="sm" onPress={() => go.push('/bms/coupons/new')} />
                    </View>
                  </Row>
                ) : null}
              </View>
            }
            render={(row) => (
              <Card onPress={() => go.push(`/bms/coupons/${row.id}`)}>
                <Row className="justify-between">
                  <Text className="flex-1 font-semibold">{row.code}</Text>
                  <StatusBadge active={row.isActive} />
                </Row>
                {row.description ? <Muted>{row.description}</Muted> : null}
                <KeyValue label={t('table.discount')} value={couponDiscount(row, t)} />
                <KeyValue label={t('table.duration')} value={couponDuration(row, t)} />
                <KeyValue label={t('table.maxUses')} value={row.maxRedemptions === null ? t('table.unlimited') : String(row.maxRedemptions)} />
                <KeyValue label={t('table.expires')} value={row.redeemBy ? formatDate(row.redeemBy) : t('table.never')} />
                <KeyValue label={t('fields.redemptionMode')} value={t(row.redemptionMode === 'manual' ? 'redemptionMode.manual' : 'redemptionMode.stripe')} />
              </Card>
            )}
          />
        )}
      </QueryView>
    </>
  )
}
