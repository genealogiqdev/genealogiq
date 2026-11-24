import type { DiscountCouponRow } from '@/api/bms'
import type { Translate } from '@/i18n'
import { formatMoney } from '@/lib/format'

/** A percentage is one number; a fixed amount lists every currency the coupon is good in. */
export function couponDiscount(row: DiscountCouponRow, t: Translate): string {
  if (row.discountType === 'percent') return t('discount.percent', { value: Number(row.percentOff ?? 0) })
  const amounts = (
    [
      ['USD', row.amountOffUsd],
      ['BRL', row.amountOffBrl],
      ['MXN', row.amountOffMxn],
    ] as const
  ).filter(([, value]) => value !== null && Number(value) > 0)
  return amounts.length === 0 ? '—' : amounts.map(([currency, value]) => formatMoney(value, currency)).join(' · ')
}

export function couponDuration(row: DiscountCouponRow, t: Translate): string {
  if (row.duration === 'once') return t('durationLabel.once')
  if (row.duration === 'forever') return t('durationLabel.forever')
  return t('durationLabel.repeating', { months: row.durationInMonths ?? '?' })
}
