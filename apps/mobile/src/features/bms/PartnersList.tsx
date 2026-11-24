import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { bmsApi } from '@/api/bms'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useView } from '@/lib/query'
import { Card, Muted, QueryView, Row, Text } from '@/ui'
import { HeaderAction, ListView, SearchBox, StatusBadge } from './fields'
import { SEGMENT_KEY, useGo, useRefresh } from './lib'

/** Partner (B2B) customers, searchable by name or email. */
export function PartnersList({ top }: { top?: ReactElement | null }) {
  const t = useT('Customers')
  const tc = useT('Common')
  const go = useGo()
  const query = useView('bms', ['customers'], () => bmsApi.customers())
  const refresh = useRefresh(query)
  const [search, setSearch] = useState('')
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const all = query.data?.customers ?? []
    return needle ? all.filter((row) => `${row.name} ${row.email}`.toLowerCase().includes(needle)) : all
  }, [query.data, search])

  return (
    <QueryView query={query}>
      {(data) => (
        <ListView
          data={rows}
          keyOf={(row) => row.id}
          emptyTitle={t('table.empty')}
          {...refresh}
          header={
            <View className="gap-3">
              {top}
              <SearchBox value={search} onChange={setSearch} placeholder={tc('dataTable.searchPlaceholder')} />
              {data.isAdmin ? <HeaderAction label={t('new')} onPress={() => go.push('/bms/customers/new')} /> : null}
            </View>
          }
          render={(row) => (
            <Card onPress={() => go.push(`/bms/customers/${row.id}`)}>
              <Row className="justify-between">
                <Text className="flex-1 font-semibold" numberOfLines={2}>
                  {row.name}
                </Text>
                <StatusBadge active={row.isActive} />
              </Row>
              <Muted>
                {t(row.entityType === 'INDIVIDUAL' ? 'entityType.individual' : 'entityType.company')} · {t(`businessSegment.${SEGMENT_KEY[row.businessSegment] ?? 'funeralHome'}`)}
              </Muted>
              <Muted>{row.email}</Muted>
              <Muted>
                {t('table.createdAt')}: {formatDate(row.createdAt)}
              </Muted>
            </Card>
          )}
        />
      )}
    </QueryView>
  )
}
