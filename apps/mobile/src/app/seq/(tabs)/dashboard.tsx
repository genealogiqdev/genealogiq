import { View } from 'react-native'
import { seqApi, type DashboardView } from '@/api/seq'
import { BarChart, DonutChart } from '@/features/shared/charts'
import { useT } from '@/i18n'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { useView } from '@/lib/query'
import { Badge, Card, Heading, KeyValue, Muted, QueryView, Screen, StatCard, Title } from '@/ui'

// The web dashboard reports sale values in this currency; the view carries none of its own.
const SALES_CURRENCY = 'USD'

function CreditSummary({ credits }: { credits: DashboardView['credits'] }) {
  const t = useT('Credits')
  const { balance, bySource, contract, sellThrough, projectedRollover } = credits
  return (
    <View className="gap-3">
      <Card>
        <Muted>{t('available')}</Muted>
        <Title className="text-4xl">{formatNumber(balance.general)}</Title>
        {bySource.map((entry) => (
          <KeyValue key={entry.source} label={t.has(`source.${entry.source}`) ? t(`source.${entry.source}`) : entry.source} value={formatNumber(entry.quantity)} />
        ))}
        {balance.committed > 0 ? <Muted>{t('committedNote', { count: balance.committed })}</Muted> : null}
      </Card>
      <Card>
        <Muted>{t('nextExpiry')}</Muted>
        <Heading>{balance.nextExpiry ? formatDate(balance.nextExpiry) : '—'}</Heading>
        <Muted>{t('memorialsSafe')}</Muted>
      </Card>
      <Card>
        <Muted>{t('sellThrough')}</Muted>
        <Title className="text-4xl">{sellThrough.rate === null ? '—' : `${Math.round(sellThrough.rate * 100)}%`}</Title>
        <Muted>{t('sellThroughDetail', { consumed: sellThrough.consumed, granted: sellThrough.granted })}</Muted>
      </Card>
      <Card>
        <Muted>{t('contract')}</Muted>
        <Heading>{contract?.planName ?? '—'}</Heading>
        {contract ? (
          <View className="items-start gap-1">
            <Badge
              label={t.has(`status.${contract.status}`) ? t(`status.${contract.status}`) : contract.status}
              color={contract.status === 'ACTIVE' ? 'success' : 'danger'}
            />
            {contract.cycle ? <Muted>{t('cycleEnds', { date: formatDate(contract.cycle.endAt) })}</Muted> : null}
            {projectedRollover ? (
              <Muted>{t(projectedRollover.usedFounder ? 'rolloverFounder' : 'rolloverProjected', { count: projectedRollover.quantity })}</Muted>
            ) : null}
          </View>
        ) : (
          <Muted>{t('noContract')}</Muted>
        )}
      </Card>
    </View>
  )
}

export default function SeqDashboard() {
  const t = useT('Dashboard')
  const tm = useT('Mobile.seq.dashboard')
  const tg = useT('GenCode')
  const query = useView('seq', ['dashboard'], () => seqApi.dashboard())
  const money = (value: number) => formatMoney(value, SALES_CURRENCY)
  const compact = (value: number) => formatNumber(Math.round(value))

  return (
    <QueryView query={query}>
      {({ stats, credits }) => (
        <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
          <CreditSummary credits={credits} />

          <View className="flex-row flex-wrap gap-3">
            <StatCard label={t('availableQr')} value={formatNumber(stats.availableQRCodes)} hint={t('currentlyInStock')} icon="layers-outline" />
            <StatCard label={t('totalCustomers')} value={formatNumber(stats.totalCustomers)} hint={t('registeredCustomers')} icon="people-outline" />
            <StatCard label={t('qrSoldThisMonth')} value={formatNumber(stats.monthlyCount)} hint={t('salesThisMonth')} icon="cart-outline" />
            <StatCard label={t('monthlyRevenue')} value={money(stats.monthlyRevenue)} hint={t('revenueThisMonth')} icon="cash-outline" />
            <StatCard label={t('averageTicket')} value={money(stats.averageTicket)} hint={t('avgRevenuePerSale')} icon="trending-up-outline" />
          </View>

          <Card>
            <Heading>{t('monthlyRevenue')}</Heading>
            <Muted>{tm('last12Months')}</Muted>
            <BarChart data={stats.monthlyRevenueChart.map((row) => ({ label: row.month, value: row.revenue }))} formatValue={compact} emptyLabel={tm('noData')} />
          </Card>
          <Card>
            <Heading>{tm('revenueByChannel')}</Heading>
            <Muted>{tm('revenueByChannelHint')}</Muted>
            <DonutChart
              data={stats.revenueByChannelChart.map((row) => ({ label: tg.has(`soldVia.${row.name}`) ? tg(`soldVia.${row.name}`) : row.name, value: row.revenue }))}
              formatValue={money}
              emptyLabel={tm('noData')}
            />
          </Card>
          <Card>
            <Heading>{tm('newCustomers')}</Heading>
            <Muted>{tm('newCustomersHint')}</Muted>
            <BarChart data={stats.customerGrowthChart.map((row) => ({ label: row.month, value: row.count }))} emptyLabel={tm('noData')} />
          </Card>
          <Card>
            <Heading>{tm('qrConsumption')}</Heading>
            <Muted>{tm('qrConsumptionHint')}</Muted>
            <BarChart data={stats.qrConsumptionChart.map((row) => ({ label: row.month, value: row.count }))} emptyLabel={tm('noData')} />
          </Card>
        </Screen>
      )}
    </QueryView>
  )
}
