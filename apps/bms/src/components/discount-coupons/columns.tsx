'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@genealogiq/ui/badge'
import { DataTableColumnHeader } from '@genealogiq/ui/data-table-column-header'
import { RowActions } from '@genealogiq/ui/row-actions'
import { toggleDiscountCouponActive } from '@/actions/discount-coupon.actions'

// Loose translator type so getColumns can stay a plain function (not a hook).
// The caller (discount-coupons-data-table) passes useTranslations('DiscountCoupons').
type Translator = (key: string, values?: Record<string, string | number | Date>) => string

export type DiscountCouponRow = {
  id:               string
  code:             string
  description:      string | null
  discountType:     string
  redemptionMode:   string
  percentOff:       number | null
  amountOffUsd:     number | null
  amountOffBrl:     number | null
  amountOffMxn:     number | null
  duration:         string
  durationInMonths: number | null
  maxRedemptions:   number | null
  redeemBy:         Date | null
  isActive:         boolean
  createdAt:        Date
}

// A percentage is one number. A fixed amount is one per currency, and the list
// shows every currency the coupon is actually good in — an operator scanning
// this needs to see that FIXED50 works in reais but not in pesos.
function formatDiscount(row: DiscountCouponRow, t: Translator, locale: string) {
  if (row.discountType === 'percent') {
    return t('discount.percent', { value: row.percentOff ?? 0 })
  }
  const amounts = ([
    ['USD', row.amountOffUsd],
    ['BRL', row.amountOffBrl],
    ['MXN', row.amountOffMxn],
  ] as const).filter(([, v]) => v !== null && v > 0)

  if (amounts.length === 0) return '—'
  return amounts
    .map(([code, v]) => new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(v!))
    .join(' · ')
}

function formatDuration(row: DiscountCouponRow, t: Translator) {
  if (row.duration === 'once')    return t('durationLabel.once')
  if (row.duration === 'forever') return t('durationLabel.forever')
  return t('durationLabel.repeating', { months: row.durationInMonths ?? '?' })
}

function ActionsCell({ row, t }: { row: { original: DiscountCouponRow }; t: Translator }) {
  const coupon = row.original

  return (
    <RowActions
      menuLabel={t('actions.openMenu')}
      items={[
        ...(coupon.redemptionMode === 'manual' && coupon.isActive ? [{ kind: 'link' as const, label: t('actions.apply'), href: `/sales/discount-coupons/redeem?couponId=${encodeURIComponent(coupon.id)}` }] : []),
        { kind: 'link', label: t('actions.editDescription'), href: `/sales/discount-coupons/${coupon.id}` },
        {
          kind: 'action',
          label: coupon.isActive ? t('actions.deactivate') : t('actions.reactivate'),
          run: () => toggleDiscountCouponActive(coupon.id),
          successMessage: coupon.isActive ? t('toasts.deactivated') : t('toasts.reactivated'),
        },
      ]}
    />
  )
}

export function getColumns(_currentUserRole: string, t: Translator, locale: string): ColumnDef<DiscountCouponRow>[] {
  return [
    {
      accessorKey: 'code',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.code')} />,
      cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
    },
    {
      accessorKey: 'description',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.description')} />,
      cell: ({ row }) => row.original.description ?? '—',
    },
    {
      id: 'discount',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.discount')} />,
      cell: ({ row }) => formatDiscount(row.original, t, locale),
    },
    {
      id: 'duration',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.duration')} />,
      cell: ({ row }) => formatDuration(row.original, t),
    },
    {
      accessorKey: 'maxRedemptions',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.maxUses')} />,
      cell: ({ row }) => row.original.maxRedemptions ?? t('table.unlimited'),
    },
    {
      accessorKey: 'redeemBy',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.expires')} />,
      cell: ({ row }) =>
        row.original.redeemBy
          ? new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(row.original.redeemBy)
          : t('table.never'),
    },
    {
      accessorKey: 'isActive',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.status')} />,
      cell: ({ row }) =>
        row.original.isActive
          ? <Badge variant="default">{t('status.active')}</Badge>
          : <Badge variant="destructive">{t('status.inactive')}</Badge>,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.createdAt')} />,
      cell: ({ row }) =>
        new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(row.original.createdAt),
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => <ActionsCell row={row} t={t} />,
    },
  ]
}
