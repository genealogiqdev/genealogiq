import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { View } from 'react-native'
import { seqApi } from '@/api/seq'
import { maskCnpj } from '@/features/seq/util'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { Badge, Card, Divider, Heading, KeyValue, ListRow, Muted, QueryView, Row, Screen, StatCard } from '@/ui'

const STATES = ['available', 'assigned', 'activated', 'expired'] as const

export default function SeqBusinessCustomer() {
  const t = useT('BusinessCustomers')
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useView('seq', ['businessCustomer', id], () => seqApi.businessCustomer(id))
  return (
    <>
      <Stack.Screen options={{ title: query.data ? query.data.company.tradeName || query.data.company.name : t('edit') }} />
      <QueryView query={query}>
        {({ company, codes, sales }) => (
          <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
            <Card>
              <Row className="justify-between">
                <Heading className="flex-1">{company.name}</Heading>
                <Badge label={t(company.isActive ? 'active' : 'inactiveStatus')} color={company.isActive ? 'success' : 'danger'} />
              </Row>
              {company.tradeName ? <Muted>{company.tradeName}</Muted> : null}
              <KeyValue label={t('fields.taxId')} value={maskCnpj(company.taxId)} />
              <KeyValue label={t('fields.segment')} value={t.has(`segments.${company.segment}`) ? t(`segments.${company.segment}`) : company.segment} />
              <KeyValue label={t('fields.contactName')} value={company.contactName} />
              <KeyValue label={t('fields.email')} value={company.email} />
              <KeyValue label={t('fields.phone')} value={company.phone ? `+${company.phoneCountryCode} ${company.phone}` : ''} />
              {company.notes ? <Muted>{company.notes}</Muted> : null}
            </Card>

            {company.isActive ? null : <Muted>{t('inactive')}</Muted>}

            <View className="flex-row flex-wrap gap-3">
              {STATES.map((state) => (
                <StatCard key={state} label={t(`codeStates.${state}`)} value={codes.filter((code) => code.state === state).length} />
              ))}
            </View>

            <Card>
              <ListRow title={t('companyDetails')} icon="create-outline" onPress={() => router.push(`/seq/customers/business/${company.id}/edit`)} />
              <Divider />
              <ListRow
                title={t('salesTitle')}
                subtitle={sales.length === 0 ? t('noSales') : undefined}
                icon="cart-outline"
                onPress={() => router.push(`/seq/customers/business/${company.id}/sales`)}
              />
              <Divider />
              <ListRow title={t('inventoryTitle')} icon="qr-code-outline" onPress={() => router.push(`/seq/customers/business/${company.id}/codes`)} />
            </Card>
          </Screen>
        )}
      </QueryView>
    </>
  )
}
