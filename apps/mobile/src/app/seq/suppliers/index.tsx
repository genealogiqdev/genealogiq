import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { seqApi } from '@/api/seq'
import { ListScreen } from '@/features/seq/ListScreen'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useView } from '@/lib/query'
import { Badge, Button, Card, Field, Heading, Muted, Row } from '@/ui'

export default function SeqSuppliers() {
  const t = useT('Suppliers')
  const tc = useT('Mobile.common')
  const router = useRouter()
  const [search, setSearch] = useState('')
  // Module-gated on the server: a 403 renders the shared no-permission state.
  const query = useView('seq', ['suppliers'], () => seqApi.suppliers())
  const needle = search.trim().toLowerCase()
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <ListScreen
        query={query}
        items={(data) => data.suppliers.filter((row) => !needle || `${row.name} ${row.email} ${row.category?.name ?? ''}`.toLowerCase().includes(needle))}
        keyOf={(row) => row.id}
        emptyTitle={t('table.empty')}
        emptyIcon="cube-outline"
        header={() => (
          <>
            <Button label={t('new')} icon="add" onPress={() => router.push('/seq/suppliers/new')} fullWidth />
            <Field value={search} onChangeText={setSearch} placeholder={tc('search')} autoCorrect={false} autoCapitalize="none" accessibilityLabel={tc('search')} />
            <View />
          </>
        )}
        renderItem={(row) => (
          <Card onPress={() => router.push(`/seq/suppliers/${row.id}`)}>
            <Row className="justify-between">
              <Heading className="flex-1">{row.name}</Heading>
              <Badge label={t(row.isActive ? 'status.active' : 'status.inactive')} color={row.isActive ? 'success' : 'danger'} />
            </Row>
            <Muted>{row.email}</Muted>
            <Muted>{`${t(row.entityType === 'INDIVIDUAL' ? 'entityType.individual' : 'entityType.company')}${row.category ? ` · ${row.category.name}` : ''} · ${formatDate(row.createdAt)}`}</Muted>
          </Card>
        )}
      />
    </>
  )
}
