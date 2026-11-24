import { Stack } from 'expo-router'
import { useState } from 'react'
import { bmsApi, type GenCodeOrderRow, type GenCodePackageRow } from '@/api/bms'
import { SearchBox } from '@/features/bms/fields'
import { useGo, useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Badge, Button, Card, Heading, KeyValue, Muted, QueryView, Row, Screen, Section, Text, confirm, useAction } from '@/ui'

const ORDER_COLOR: Record<GenCodeOrderRow['status'], 'success' | 'warning' | 'danger' | 'default'> = {
  PAID: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  EXPIRED: 'default',
}

function PackageCard({ row, isAdmin }: { row: GenCodePackageRow; isAdmin: boolean }) {
  const t = useT('GenCodePackages')
  const ts = useT('Subscriptions')
  const tc = useT('Common')
  const go = useGo()
  const action = useAction()
  const invalidate = useBmsInvalidate()
  const synced = !!row.stripeProductId && !!row.stripePriceId

  async function sync() {
    const yes = await confirm({ title: ts('stripe.confirmTitle'), message: row.name, confirmLabel: t('product.sync'), cancelLabel: tc('cancel') })
    if (yes) await action.run(() => bmsApi.syncGenCodePackageWithStripe(row.id), { success: true, onSuccess: () => invalidate(['gencodes'], ['gencodesNew'], ['discountCouponNew']) })
  }

  return (
    <Card>
      <Row className="justify-between">
        <Heading className="flex-1">{row.name}</Heading>
        <Badge label={row.isActive ? t('product.active') : t('product.inactive')} color={row.isActive ? 'success' : 'danger'} />
      </Row>
      <Muted>{t('product.description')}</Muted>
      <KeyValue label={t('product.unitPrice')} value={formatMoney(row.unitPrice, row.currency)} />
      <KeyValue label={t('product.minimum')} value={t('product.units', { count: row.minimumQuantity })} />
      <KeyValue label={t('product.validity')} value={t('product.validityValue')} />
      <KeyValue label={t('product.stripe')} value={<Badge label={synced ? t('product.synced') : t('product.notSynced')} color={synced ? 'success' : 'warning'} />} />
      {isAdmin ? (
        <Row>
          <Button label={action.pending ? t('product.syncing') : t('product.sync')} variant="secondary" size="sm" icon="sync-outline" loading={action.pending} onPress={() => void sync()} />
          {row.isActive ? <Button label={t('newOrder')} size="sm" icon="add" onPress={() => go.push('/bms/gencodes/new', { packageId: row.id })} /> : null}
        </Row>
      ) : null}
    </Card>
  )
}

export default function GenCodes() {
  const t = useT('GenCodePackages')
  const query = useView('bms', ['gencodes'], () => bmsApi.gencodes())
  const refresh = useRefresh(query)
  const [search, setSearch] = useState('')
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <QueryView query={query}>
        {(data) => {
          const needle = search.trim().toLowerCase()
          const orders = needle ? data.orders.filter((order) => order.tenant.name.toLowerCase().includes(needle)) : data.orders
          return (
            <Screen {...refresh}>
              <Muted>{t('description')}</Muted>
              {data.packages.map((row) => (
                <PackageCard key={row.id} row={row} isAdmin={data.isAdmin} />
              ))}
              <Section title={t('ordersTitle')}>
                <Muted>{t('ordersDescription')}</Muted>
                <SearchBox value={search} onChange={setSearch} placeholder={t('table.search')} />
                {orders.length === 0 ? <Muted className="py-6 text-center">{t('table.empty')}</Muted> : null}
                {orders.map((order) => (
                  <Card key={order.id}>
                    <Row className="justify-between">
                      <Text className="flex-1 font-semibold">{order.tenant.name}</Text>
                      <Badge label={t(`status.${order.status}`)} color={ORDER_COLOR[order.status] ?? 'default'} />
                    </Row>
                    <Muted>{order.package.name}</Muted>
                    <KeyValue label={t('table.quantity')} value={formatNumber(order.quantity)} />
                    <KeyValue label={t('table.unitPrice')} value={formatMoney(order.unitPrice, order.currency)} />
                    {order.discountAmount > 0 ? (
                      <KeyValue label={t('table.discount')} value={`${formatMoney(order.discountAmount, order.currency)}${order.discountCode ? ` · ${order.discountCode}` : ''}`} />
                    ) : null}
                    <KeyValue label={t('table.total')} value={formatMoney(order.totalAmount, order.currency)} />
                    <KeyValue label={t('table.createdAt')} value={formatDate(order.createdAt)} />
                    {order.creditExpiresAt ? <KeyValue label={t('table.validUntil')} value={formatDate(order.creditExpiresAt)} /> : null}
                  </Card>
                ))}
              </Section>
            </Screen>
          )
        }}
      </QueryView>
    </>
  )
}
