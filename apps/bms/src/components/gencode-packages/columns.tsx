'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@genealogiq/ui/badge'
import { DataTableColumnHeader } from '@genealogiq/ui/data-table-column-header'
import type { GenCodeOrderRow } from '@/queries/gencode-packages'

type Translator = (key: string, values?: Record<string, string | number | Date>) => string

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PAID: 'default',
  PENDING: 'outline',
  FAILED: 'destructive',
  EXPIRED: 'secondary',
}

export function getColumns(t: Translator, locale: string): ColumnDef<GenCodeOrderRow>[] {
  const date = (value: Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(value)
  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)

  return [
    {
      id: 'tenant',
      accessorFn: (row) => row.tenant.name,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.customer')} />,
      cell: ({ row }) => row.original.tenant.name,
    },
    {
      accessorKey: 'quantity',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('table.quantity')} className="justify-end" />
      ),
      cell: ({ row }) => <div className="text-right tabular-nums">{row.original.quantity}</div>,
    },
    {
      id: 'unitPrice',
      accessorFn: (row) => row.unitPrice,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('table.unitPrice')} className="justify-end" />
      ),
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          {money(row.original.unitPrice, row.original.currency)}
        </div>
      ),
    },
    {
      id: 'totalAmount',
      accessorFn: (row) => row.totalAmount,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('table.total')} className="justify-end" />
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums">
          {money(row.original.totalAmount, row.original.currency)}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.status')} />,
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status] ?? 'outline'}>
          {t(`status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'creditExpiresAt',
      accessorFn: (row) => row.creditExpiresAt?.getTime() ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.validUntil')} />,
      cell: ({ row }) => row.original.creditExpiresAt
        ? date(row.original.creditExpiresAt)
        : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.createdAt')} />,
      cell: ({ row }) => date(row.original.createdAt),
    },
  ]
}

