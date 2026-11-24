import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { seqApi } from '@/api/seq'
import { ListScreen } from '@/features/seq/ListScreen'
import { maskCnpj } from '@/features/seq/util'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useView } from '@/lib/query'
import { Badge, Button, Card, Field, Heading, Muted, Row, Segmented } from '@/ui'

type Tab = 'consumers' | 'business'

function Toolbar({ tab, onTab, search, onSearch }: { tab: Tab; onTab: (tab: Tab) => void; search: string; onSearch: (text: string) => void }) {
  const t = useT('Customers')
  const tb = useT('BusinessCustomers')
  const tc = useT('Mobile.common')
  const router = useRouter()
  return (
    <>
      <Segmented<Tab>
        value={tab}
        onChange={onTab}
        options={[
          { value: 'consumers', label: tb('consumersTab') },
          { value: 'business', label: tb('businessTab') },
        ]}
      />
      <Button
        label={tab === 'consumers' ? t('new') : tb('new')}
        icon="add"
        onPress={() => router.push(tab === 'consumers' ? '/seq/customers/new' : '/seq/customers/business/new')}
        fullWidth
      />
      <Field value={search} onChangeText={onSearch} placeholder={tc('search')} autoCorrect={false} autoCapitalize="none" accessibilityLabel={tc('search')} />
    </>
  )
}

function Consumers({ search }: { search: string }) {
  const t = useT('Customers')
  const ta = useT('PremiumAccess')
  const router = useRouter()
  const query = useView('seq', ['customers'], () => seqApi.customers())
  const needle = search.trim().toLowerCase()
  return (
    <ListScreen
      query={query}
      items={(data) => data.customers.filter((row) => !needle || `${row.firstName} ${row.lastName} ${row.email ?? ''}`.toLowerCase().includes(needle))}
      keyOf={(row) => row.id}
      emptyTitle={t('table.empty')}
      emptyIcon="people-outline"
      renderItem={(row) => (
        <Card onPress={() => router.push(`/seq/customers/${row.id}`)}>
          <Row className="justify-between">
            <Heading className="flex-1">{`${row.firstName} ${row.lastName}`.trim()}</Heading>
            <Badge label={t(row.isActive ? 'status.active' : 'status.inactive')} color={row.isActive ? 'success' : 'danger'} />
          </Row>
          {row.email ? <Muted>{row.email}</Muted> : null}
          <Row className="flex-wrap">
            <Badge label={row.access.planName} color={row.access.planCode === 'PREMIUM' ? 'accent' : 'default'} />
            {row.access.expiresAt ? <Muted>{t('premiumUntil', { date: formatDate(row.access.expiresAt, { utc: true }) })}</Muted> : null}
          </Row>
          <Muted>{ta('soldCount', { count: row.genCodesSold })}</Muted>
        </Card>
      )}
    />
  )
}

function Businesses({ search }: { search: string }) {
  const t = useT('BusinessCustomers')
  const router = useRouter()
  const query = useView('seq', ['businessCustomers'], () => seqApi.businessCustomers())
  const needle = search.trim().toLowerCase()
  const digits = needle.replace(/\D/g, '')
  return (
    <ListScreen
      query={query}
      items={(data) =>
        data.companies.filter(
          (row) => !needle || `${row.name} ${row.tradeName} ${row.email} ${row.contactName}`.toLowerCase().includes(needle) || (!!digits && row.taxId.includes(digits)),
        )
      }
      keyOf={(row) => row.id}
      emptyTitle={t('empty')}
      emptyIcon="business-outline"
      renderItem={(row) => (
        <Card onPress={() => router.push(`/seq/customers/business/${row.id}`)}>
          <Row className="justify-between">
            <Heading className="flex-1">{row.tradeName || row.name}</Heading>
            <Badge label={t(row.isActive ? 'active' : 'inactiveStatus')} color={row.isActive ? 'success' : 'danger'} />
          </Row>
          <Muted>{`${maskCnpj(row.taxId)} · ${t.has(`segments.${row.segment}`) ? t(`segments.${row.segment}`) : row.segment}`}</Muted>
          <Muted>
            {`${t('fields.genCodesSold')}: ${row.genCodesSold} · ${t('fields.available')}: ${row.available} · ${t('fields.assigned')}: ${row.assigned} · ${t('fields.activated')}: ${row.activated}`}
          </Muted>
        </Card>
      )}
    />
  )
}

export default function SeqCustomers() {
  const [tab, setTab] = useState<Tab>('consumers')
  const [search, setSearch] = useState('')
  return (
    <View className="flex-1 bg-background">
      <View className="gap-3 px-4 pt-4">
        <Toolbar tab={tab} onTab={setTab} search={search} onSearch={setSearch} />
      </View>
      {tab === 'consumers' ? <Consumers search={search} /> : <Businesses search={search} />}
    </View>
  )
}
