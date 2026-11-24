import { Stack } from 'expo-router'
import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { bmsApi } from '@/api/bms'
import { HeaderAction, ListView, SearchBox, StatusBadge } from '@/features/bms/fields'
import { useGo, useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useView } from '@/lib/query'
import { Avatar, Badge, Card, Muted, QueryView, Row, Text } from '@/ui'

export default function Users() {
  const t = useT('Users')
  const tc = useT('Common')
  const go = useGo()
  const query = useView('bms', ['users'], () => bmsApi.users())
  const refresh = useRefresh(query)
  const [search, setSearch] = useState('')
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const all = query.data?.users ?? []
    return needle ? all.filter((row) => `${row.firstName} ${row.lastName} ${row.email}`.toLowerCase().includes(needle)) : all
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
                <SearchBox value={search} onChange={setSearch} placeholder={tc('dataTable.searchPlaceholder')} />
                {data.isAdmin ? <HeaderAction label={t('new')} onPress={() => go.push('/bms/users/new')} /> : null}
              </View>
            }
            render={(row) => {
              const name = `${row.firstName} ${row.lastName}`.trim()
              return (
                <Card onPress={() => go.push(`/bms/users/${row.id}`)}>
                  <Row>
                    <Avatar name={name} size={40} />
                    <View className="flex-1">
                      <Text className="font-semibold" numberOfLines={1}>
                        {name}
                      </Text>
                      <Muted numberOfLines={1}>{row.email}</Muted>
                    </View>
                    <StatusBadge active={row.isActive} />
                  </Row>
                  <Row className="justify-between">
                    <Badge label={t(`roles.${row.role}`)} />
                    <Muted>{formatDate(row.createdAt)}</Muted>
                  </Row>
                </Card>
              )
            }}
          />
        )}
      </QueryView>
    </>
  )
}
