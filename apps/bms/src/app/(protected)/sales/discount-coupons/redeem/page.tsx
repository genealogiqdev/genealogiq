import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { currencyForLocale } from '@genealogiq/core'
import { verifyAdmin } from '@/lib/dal'
import { getManualCouponOptions, getManualCouponHistory } from '@/queries/manual-coupons'
import { ManualCouponForm } from '@/components/discount-coupons/manual-coupon-form'
import { CouponEmailStatus } from '@/components/discount-coupons/coupon-email-status'

export default async function RedeemCouponPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await verifyAdmin()
  const locale = await getLocale()
  const t = await getTranslations('ManualCoupons')
  const [options, history, query] = await Promise.all([
    getManualCouponOptions(currencyForLocale(locale).toUpperCase()), getManualCouponHistory(), searchParams,
  ])
  const initial = Object.fromEntries(['couponId', 'kind', 'productId', 'tenantId', 'quantity'].map((key) => [key, typeof query[key] === 'string' ? query[key] : undefined]))
  const date = (value: Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(value)

  return <div className="flex flex-col gap-6">
    <div>
      <Link href="/sales/discount-coupons" className="text-sm text-muted-foreground hover:underline">{t('back')}</Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('description')}</p>
    </div>
    <ManualCouponForm options={options} initial={initial} />
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{t('history')}</h2>
      {!history.length ? <p className="text-sm text-muted-foreground">{t('emptyHistory')}</p> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr>
              {[t('reference'), t('product'), t('recipient'), t('record')].map((label) => <th className="p-3 font-medium" key={label}>{label}</th>)}
            </tr></thead>
            <tbody>{history.map((r) => {
              const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: r.currency }).format(value)
              return <tr key={r.id} className="border-t align-top">
                <td className="p-3"><p className="font-medium">{r.reference}</p><p className="text-muted-foreground">{r.code} · {t(`sources.${r.source}`)}</p></td>
                <td className="p-3"><p>{r.product}</p><p className="text-muted-foreground">{t(`kinds.${r.kind}`)} · {r.quantity}</p>{r.endsAt && <p>{t('validUntil', { date: date(r.endsAt) })}</p>}</td>
                <td className="p-3">{r.recipient}<CouponEmailStatus id={r.id} sent={!!r.emailSentAt} /></td>
                <td className="p-3"><p>{date(r.createdAt)} · {r.operator}</p>
                  <details className="mt-1"><summary className="cursor-pointer">{t('amounts')}</summary>
                    <p>{t('subtotal')}: {money(r.subtotalAmount)}</p><p>{t('discount')}: {money(r.discountAmount)}</p>
                    <p>{t('total')}: {money(r.totalAmount)}</p>
                    {r.externalAmount != null && <p>{t('externalAmount', { currency: r.currency })}: {money(r.externalAmount)}</p>}
                  </details>
                </td>
              </tr>
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  </div>
}
