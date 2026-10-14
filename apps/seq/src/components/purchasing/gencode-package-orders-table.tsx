import { getLocale, getTranslations } from 'next-intl/server'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@genealogiq/ui/table'
import type { GenCodePackageOrder } from '@/queries/purchasing'

export async function GenCodePackageOrdersTable({ orders }: { orders: GenCodePackageOrder[] }) {
  const t = await getTranslations('GenCodePackages')
  const locale = await getLocale()
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'short' })
  const status = {
    PENDING: t('orders.pending'), PAID: t('orders.paid'),
    FAILED: t('orders.failed'), EXPIRED: t('orders.expired'),
  }
  if (orders.length === 0) return <p className="text-muted-foreground">{t('orders.empty')}</p>

  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>{t('orders.requestedAt')}</TableHead>
        <TableHead>{t('quantity')}</TableHead>
        <TableHead>{t('orders.discount')}</TableHead>
        <TableHead>{t('total')}</TableHead>
        <TableHead>{t('orders.status')}</TableHead>
        <TableHead>{t('orders.expiresAt')}</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {orders.map((order) => {
          const money = new Intl.NumberFormat(locale, { style: 'currency', currency: order.currency })
          return (
            <TableRow key={order.id}>
              <TableCell>{date.format(order.createdAt)}</TableCell>
              <TableCell>{t('units', { count: order.quantity })}</TableCell>
              <TableCell>{order.discountAmount > 0 ? <>{money.format(order.discountAmount)}<span className="block text-xs text-muted-foreground">{order.discountCode}</span></> : '—'}</TableCell>
              <TableCell className="tabular-nums">{money.format(order.totalAmount)}</TableCell>
              <TableCell>{status[order.status]}</TableCell>
              <TableCell>{order.creditExpiresAt ? date.format(order.creditExpiresAt) : '—'}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
