import { Stack } from 'expo-router'
import { bmsApi, type ContractStatus } from '@/api/bms'
import { HeaderAction, ListView } from '@/features/bms/fields'
import { useGo, useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatCents, formatDate } from '@/lib/format'
import { useView } from '@/lib/query'
import { Badge, Card, KeyValue, Muted, QueryView, Row, Text } from '@/ui'

const CONTRACT_COLOR: Record<ContractStatus, 'success' | 'warning' | 'danger' | 'default'> = {
  ACTIVE: 'success',
  PENDING: 'default',
  PAST_DUE: 'warning',
  EXPIRED: 'danger',
  CANCELLED: 'danger',
}

export default function Contracts() {
  const t = useT('Contracts')
  const go = useGo()
  const query = useView('bms', ['contracts'], () => bmsApi.contracts())
  const refresh = useRefresh(query)
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <QueryView query={query}>
        {(data) => (
          <ListView
            data={data.contracts}
            keyOf={(row) => row.id}
            emptyTitle={t('table.empty')}
            {...refresh}
            header={data.isAdmin ? <HeaderAction label={t('newButton')} onPress={() => go.push('/bms/contracts/new')} /> : undefined}
            render={(row) => (
              <Card onPress={() => go.push(`/bms/contracts/${row.id}`)}>
                <Row className="justify-between">
                  <Text className="flex-1 font-semibold" numberOfLines={2}>
                    {row.tenant.name}
                  </Text>
                  <Badge label={t(`status.${row.status}`)} color={CONTRACT_COLOR[row.status] ?? 'default'} />
                </Row>
                <Muted>
                  {row.plan.name} · {t('table.allowanceValue', { count: row.plan.annualAllowance })}
                </Muted>
                <KeyValue
                  label={t('table.cycle')}
                  value={row.currentCycle ? `${formatDate(row.currentCycle.startAt)} → ${formatDate(row.currentCycle.endAt)}` : t('table.noCycle')}
                />
                {row.currentCycle ? <Muted>{t('table.graceUntil', { date: formatDate(row.currentCycle.graceEndAt) })}</Muted> : null}
                <KeyValue label={t('table.renewals')} value={String(Math.max(0, row._count.cycles - 1))} />
                <KeyValue
                  label={t('table.amount')}
                  value={
                    row.amountPaid != null && row.currency
                      ? `${formatCents(row.amountPaid, row.currency)}${row.cadence && t.has(`cadence.${row.cadence}`) ? ` · ${t(`cadence.${row.cadence}`)}` : ''}`
                      : '—'
                  }
                />
                <KeyValue label={t('table.since')} value={formatDate(row.createdAt)} />
              </Card>
            )}
          />
        )}
      </QueryView>
    </>
  )
}
