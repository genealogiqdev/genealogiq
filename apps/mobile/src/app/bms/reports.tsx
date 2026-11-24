import { Stack } from 'expo-router'
import { View } from 'react-native'
import { bmsApi } from '@/api/bms'
import { percent, useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatMoney, formatNumber } from '@/lib/format'
import { useView } from '@/lib/query'
import { Card, Heading, Icon, KeyValue, Muted, QueryView, Row, Screen, Section, StatCard, Text, Title } from '@/ui'

// Resale and channel values are recorded in US dollars, as on the web report.
const usd = (value: number) => formatMoney(value, 'USD')

export default function Reports() {
  const t = useT('SalesReports')
  const query = useView('bms', ['reports'], () => bmsApi.reports())
  const refresh = useRefresh(query)
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <QueryView query={query}>
        {({ funnel, trial, sellThrough, resellers, channels, revenueByPlan, staleAfterDays }) => (
          <Screen {...refresh}>
            <Muted>{t('subtitle')}</Muted>
            <View className="flex-row flex-wrap gap-3">
              <StatCard label={t('funnel.issued')} value={formatNumber(funnel.issued)} icon="cube-outline" />
              <StatCard label={t('funnel.sold')} value={formatNumber(funnel.sold)} hint={percent(funnel.sold, funnel.issued)} icon="cart-outline" />
              <StatCard label={t('funnel.activated')} value={formatNumber(funnel.activated)} hint={percent(funnel.activated, funnel.sold)} icon="checkmark-circle-outline" />
              <StatCard label={t('funnel.available')} value={formatNumber(funnel.available)} icon="file-tray-stacked-outline" />
              <StatCard
                label={t('funnel.lag')}
                value={funnel.medianLagDays ?? '—'}
                hint={funnel.medianLagDays === null ? undefined : t('funnel.lagUnit')}
                icon="timer-outline"
              />
              <StatCard
                label={t('funnel.trialConversion')}
                value={trial.rate === null ? '—' : `${Math.round(trial.rate * 100)}%`}
                hint={t('funnel.trialDetail', { converted: trial.converted, trialing: trial.stillTrialing })}
                icon="sparkles-outline"
              />
            </View>

            {funnel.stale > 0 ? (
              <Card className="border-warning">
                <Row>
                  <Icon name="warning-outline" size={18} />
                  <Text className="flex-1 text-sm font-medium">{t('stale.title')}</Text>
                </Row>
                <Title>{formatNumber(funnel.stale)}</Title>
                <Muted>{t('stale.description', { days: staleAfterDays })}</Muted>
              </Card>
            ) : null}

            <Section title={t('sellThrough.title')}>
              <Muted>{t('sellThrough.subtitle')}</Muted>
              {sellThrough.length === 0 ? <Muted>{t('empty')}</Muted> : null}
              {sellThrough.map((row) => (
                <Card key={row.tenantId}>
                  <Text className="font-semibold">{row.tenantName}</Text>
                  <KeyValue label={t('sellThrough.granted')} value={formatNumber(row.granted)} />
                  <KeyValue label={t('sellThrough.consumed')} value={formatNumber(row.consumed)} />
                  <KeyValue label={t('sellThrough.rate')} value={row.rate === null ? '—' : `${Math.round(row.rate * 100)}%`} />
                  <KeyValue label={t('sellThrough.lag')} value={row.medianLagDays === null ? '—' : `${row.medianLagDays}d`} />
                </Card>
              ))}
            </Section>

            <Section title={t('resellers.title')}>
              <Muted>{t('resellers.subtitle')}</Muted>
              {resellers.length === 0 ? <Muted>{t('empty')}</Muted> : null}
              {resellers.map((row) => (
                <Card key={row.tenantId}>
                  <Text className="font-semibold">{row.tenantName}</Text>
                  <KeyValue label={t('resellers.issued')} value={formatNumber(row.issued)} />
                  <KeyValue label={t('resellers.sold')} value={formatNumber(row.sold)} />
                  <KeyValue label={t('resellers.activated')} value={formatNumber(row.activated)} />
                  <KeyValue label={t('resellers.rate')} value={percent(row.activated, row.sold)} />
                  <KeyValue label={t('resellers.stale')} value={row.stale ? formatNumber(row.stale) : '—'} />
                  <KeyValue label={t('resellers.resaleValue')} value={usd(row.resaleValue)} />
                  {row.valueMissing > 0 ? <Muted>{t('resellers.valueMissing', { count: row.valueMissing })}</Muted> : null}
                </Card>
              ))}
            </Section>

            <Section title={t('channels.title')}>
              <Muted>{t('channels.subtitle')}</Muted>
              {channels.length === 0 ? <Muted>{t('empty')}</Muted> : null}
              {channels.map((channel) => (
                <Card key={channel.channel}>
                  <Muted>{t(`channels.${channel.channel}`)}</Muted>
                  <Row className="items-baseline justify-between">
                    <Title>{formatNumber(channel.count)}</Title>
                    <Muted>{usd(channel.value)}</Muted>
                  </Row>
                </Card>
              ))}
            </Section>

            <Section title={t('revenue.title')}>
              <Muted>{t('revenue.subtitle')}</Muted>
              {revenueByPlan.length === 0 ? <Muted>{t('empty')}</Muted> : null}
              {/* One card per plan per currency: amounts in different currencies are never added together. */}
              {revenueByPlan.map((row) => (
                <Card key={`${row.planName}-${row.currency}`}>
                  <Row className="justify-between">
                    <Text className="flex-1 font-semibold">{row.planName}</Text>
                    <Muted>{row.currency}</Muted>
                  </Row>
                  <KeyValue label={t('revenue.sales')} value={formatNumber(row.cycles)} />
                  <KeyValue label={t('revenue.units')} value={formatNumber(row.allowance)} />
                  <KeyValue label={t('revenue.total')} value={formatMoney(row.revenue, row.currency)} />
                </Card>
              ))}
              <Muted>{t('revenue.caveat')}</Muted>
            </Section>

            <Card>
              <Heading>{t('funnel.trialConversion')}</Heading>
              <KeyValue label={t('sellThrough.granted')} value={formatNumber(trial.granted)} />
              <Muted>{t('funnel.trialDetail', { converted: trial.converted, trialing: trial.stillTrialing })}</Muted>
            </Card>
          </Screen>
        )}
      </QueryView>
    </>
  )
}
