import { View } from 'react-native'
import { bmsApi } from '@/api/bms'
import { BarChart, DonutChart } from '@/features/shared/charts'
import { useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatMoney, formatNumber } from '@/lib/format'
import { useView } from '@/lib/query'
import { Card, Heading, KeyValue, Muted, QueryView, Screen, StatCard, Text } from '@/ui'

// The dashboard figures are stored and reported in US dollars, as on the web.
const usd = (value: number) => formatMoney(value, 'USD')
const compact = (value: number) => (value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value)))

export default function Dashboard() {
  const t = useT('Dashboard')
  const query = useView('bms', ['dashboard'], () => bmsApi.dashboard())
  const refresh = useRefresh(query)
  return (
    <QueryView query={query}>
      {(data) => (
        <Screen {...refresh}>
          <View className="flex-row flex-wrap gap-3">
            <StatCard label={t('monthlySales')} value={formatNumber(data.monthlyCount)} hint={t('salesThisMonth')} icon="cart-outline" />
            <StatCard label={t('monthlyRevenue')} value={usd(data.monthlyRevenue)} hint={t('revenueThisMonth')} icon="cash-outline" />
            <StatCard label={t('annualSales')} value={formatNumber(data.yearlyCount)} hint={t('salesThisYear')} icon="cart-outline" />
            <StatCard label={t('annualRevenue')} value={usd(data.yearlyRevenue)} hint={t('revenueThisYear')} icon="cash-outline" />
            <StatCard label={t('totalSales')} value={formatNumber(data.totalCount)} hint={t('allTimeSales')} icon="cart-outline" />
            <StatCard label={t('totalRevenue')} value={usd(data.totalRevenue)} hint={t('allTimeRevenue')} icon="cash-outline" />
          </View>

          <Card>
            <Heading>{t('charts.monthlyRevenue')}</Heading>
            <Muted>{t('charts.last12ActiveSales')}</Muted>
            <BarChart
              data={data.monthlyRevenueChart.map((item) => ({ label: item.month, value: item.revenue }))}
              formatValue={compact}
              emptyLabel={t('charts.noSalesLast12')}
            />
          </Card>

          <Card>
            <Heading>{t('charts.newCustomers')}</Heading>
            <Muted>{t('charts.newCustomersDesc')}</Muted>
            <BarChart data={data.customerGrowthChart.map((item) => ({ label: item.month, value: item.count }))} emptyLabel="—" />
          </Card>

          <Card>
            <Heading>{t('charts.revenueByProduct')}</Heading>
            <DonutChart
              data={data.revenueByPackageChart.map((item) => ({ label: item.name, value: item.revenue }))}
              formatValue={usd}
              emptyLabel={t('charts.noSalesData')}
            />
          </Card>

          <Card>
            <Heading>{t('charts.topSellers')}</Heading>
            <Muted>{t('charts.topSellersDesc')}</Muted>
            {data.topSellersChart.length === 0 ? (
              <Muted>{t('charts.noSalesLast12')}</Muted>
            ) : (
              data.topSellersChart.map((seller, index) => (
                <View key={`${seller.name}-${index}`} className="flex-row items-center justify-between gap-3 py-1.5">
                  <View className="flex-1">
                    <Text numberOfLines={1}>{seller.name}</Text>
                    <Muted>{formatNumber(seller.count)}</Muted>
                  </View>
                  <Text>{usd(seller.revenue)}</Text>
                </View>
              ))
            )}
          </Card>

          <Card>
            <KeyValue label={t('entities.customers')} value={formatNumber(data.customers)} />
            <KeyValue label={t('entities.systemUsers')} value={formatNumber(data.systemUsers)} />
            <KeyValue label={t('entities.subscriptions')} value={formatNumber(data.subscriptions)} />
            <KeyValue label={t('entities.products')} value={formatNumber(data.packages)} />
          </Card>
        </Screen>
      )}
    </QueryView>
  )
}
