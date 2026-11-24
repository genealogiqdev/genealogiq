import { Stack, useLocalSearchParams } from 'expo-router'
import { bmsApi, type ContractStatus } from '@/api/bms'
import { useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatCents, formatDate } from '@/lib/format'
import { useView } from '@/lib/query'
import { Badge, Card, Heading, KeyValue, Muted, QueryView, Row, Screen, Section } from '@/ui'

const COLOR: Record<ContractStatus, 'success' | 'warning' | 'danger' | 'default'> = {
  ACTIVE: 'success',
  PENDING: 'default',
  PAST_DUE: 'warning',
  EXPIRED: 'danger',
  CANCELLED: 'danger',
}

export default function ContractDetail() {
  const t = useT('Contracts')
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useView('bms', ['contract', id], () => bmsApi.contract(id))
  const refresh = useRefresh(query)
  return (
    <>
      <Stack.Screen options={{ title: query.data?.tenant.name ?? t('title') }} />
      <QueryView query={query}>
        {(contract) => (
          <Screen {...refresh}>
            <Row className="justify-between">
              <Heading className="flex-1">{contract.tenant.name}</Heading>
              <Badge label={t(`status.${contract.status}`)} color={COLOR[contract.status] ?? 'default'} />
            </Row>
            <Muted>
              {contract.plan.name} · {t('table.allowanceValue', { count: contract.plan.annualAllowance })}
            </Muted>
            <Muted>{contract.tenant.email}</Muted>

            {contract.founderRolloverEligible ? (
              <Card>
                <Heading>{t('detail.founder')}</Heading>
                <Muted>{contract.founderRolloverUsed ? t('detail.founderUsed') : t('detail.founderAvailable')}</Muted>
              </Card>
            ) : null}

            <Section title={t('detail.cycles')}>
              {contract.cycles.length === 0 ? <Muted>{t('table.noCycle')}</Muted> : null}
              {contract.cycles.map((cycle) => (
                <Card key={cycle.id}>
                  <Row className="justify-between">
                    <Muted>{cycle.isRenewal ? t('detail.renewal') : t('detail.first')}</Muted>
                    <Badge label={t(`cycleStatus.${cycle.status}`)} color={cycle.status === 'ACTIVE' ? 'success' : 'default'} />
                  </Row>
                  <KeyValue label={t('detail.period')} value={`${formatDate(cycle.startAt)} → ${formatDate(cycle.endAt)}`} />
                  <KeyValue label={t('detail.grace')} value={formatDate(cycle.graceEndAt)} />
                  <KeyValue
                    label={t('table.amount')}
                    value={
                      cycle.amountPaid != null && cycle.currency
                        ? `${formatCents(cycle.amountPaid, cycle.currency)}${cycle.cadence && t.has(`cadence.${cycle.cadence}`) ? ` · ${t(`cadence.${cycle.cadence}`)}` : ''}`
                        : '—'
                    }
                  />
                </Card>
              ))}
            </Section>
          </Screen>
        )}
      </QueryView>
    </>
  )
}
