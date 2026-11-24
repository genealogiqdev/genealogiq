import { Stack } from 'expo-router'
import { bmsApi, type PartnerPlanPrice } from '@/api/bms'
import { HeaderAction, ListView, StatusBadge } from '@/features/bms/fields'
import { useGo, useRefresh } from '@/features/bms/lib'
import { useT, type Translate } from '@/i18n'
import { formatMoney, formatNumber } from '@/lib/format'
import { useView } from '@/lib/query'
import { Card, KeyValue, Muted, QueryView, Row, Text } from '@/ui'

const priceSynced = (price: PartnerPlanPrice) => !!price.stripeCashPriceId && (price.installmentAmount === null || !!price.stripeInstallmentPriceId)

function syncLabel(prices: PartnerPlanPrice[], t: Translate): string {
  if (prices.length === 0) return t('sync.unpriced')
  const synced = prices.filter(priceSynced).length
  if (synced === 0) return t('sync.none')
  return synced === prices.length ? t('sync.all') : t('sync.partial', { synced, total: prices.length })
}

export default function Plans() {
  const t = useT('PartnerPlans')
  const go = useGo()
  const query = useView('bms', ['plans'], () => bmsApi.plans())
  const refresh = useRefresh(query)
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <QueryView query={query}>
        {(data) => (
          <ListView
            data={data.plans}
            keyOf={(plan) => plan.id}
            emptyTitle={t('table.empty')}
            {...refresh}
            header={data.isAdmin ? <HeaderAction label={t('newButton')} onPress={() => go.push('/bms/plans/new')} /> : undefined}
            render={(plan) => (
              <Card onPress={() => go.push(`/bms/plans/${plan.id}`)}>
                <Row className="justify-between">
                  <Text className="flex-1 font-semibold">{plan.name}</Text>
                  <StatusBadge active={plan.isActive} />
                </Row>
                <Muted>{plan.code}</Muted>
                <KeyValue label={t('table.allowance')} value={formatNumber(plan.annualAllowance)} />
                {plan.prices.map((price) => (
                  <KeyValue
                    key={price.id}
                    label={`${t('table.cash')} (${price.currency})`}
                    value={`${price.annualCashAmount === null ? '—' : formatMoney(price.annualCashAmount, price.currency)}${
                      price.installmentAmount !== null && price.installmentCount ? ` · ${price.installmentCount}× ${formatMoney(price.installmentAmount, price.currency)}` : ''
                    }`}
                  />
                ))}
                <KeyValue label={t('table.stripe')} value={syncLabel(plan.prices, t)} />
                <KeyValue label={t('table.contracts')} value={formatNumber(plan._count.subscriptions)} />
              </Card>
            )}
          />
        )}
      </QueryView>
    </>
  )
}
