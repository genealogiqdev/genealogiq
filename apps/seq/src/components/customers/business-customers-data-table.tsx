'use client'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@genealogiq/ui/data-table'
import { DataTableColumnHeader } from '@genealogiq/ui/data-table-column-header'
import { Badge } from '@genealogiq/ui/badge'
import { Button } from '@genealogiq/ui/button'

export type BusinessCustomerRow = {
  id: string; name: string; tradeName: string; taxId: string; segment: string; contactName: string;
  email: string; phone: string; isActive: boolean; createdAt: Date; genCodesSold: number; available: number; assigned: number; activated: number;
}
export function BusinessCustomersDataTable({ data }: { data: BusinessCustomerRow[] }) {
  const t = useTranslations('BusinessCustomers')
  const names = ['name', 'taxId', 'segment', 'isActive', 'available', 'assigned', 'activated', 'genCodesSold'] as const
  const labels = Object.fromEntries(names.map(name => [name, t(`fields.${name}`)]))
  const columns: ColumnDef<BusinessCustomerRow>[] = names.map(name => ({
    accessorKey: name,
    accessorFn: name === 'name' ? row => `${row.name} ${row.tradeName} ${row.taxId} ${row.contactName} ${row.email}` : undefined,
    header: ({ column }) => <DataTableColumnHeader column={column} title={labels[name]} />,
    cell: ({ row }) => {
      const value = row.original[name]
      if (name === 'name') return <div><Link className="font-medium underline" href={`/customers/business/${row.original.id}`}>{row.original.name}</Link><p className="text-muted-foreground text-sm">{row.original.tradeName}</p></div>
      if (name === 'segment') return t(`segments.${value}`)
      if (name === 'isActive') return <Badge variant={value ? 'default' : 'destructive'}>{t(value ? 'active' : 'inactiveStatus')}</Badge>
      return String(value || (typeof value === 'number' ? 0 : '—'))
    },
  }))
  columns.push({ id: 'actions', enableHiding: false, cell: ({ row }) => <Button asChild variant="outline"><Link href={`/customers/business/${row.original.id}`}>{t('editAndSell')}</Link></Button> })
  return <DataTable columns={columns} data={data} columnLabels={labels} emptyMessage={t('empty')} />
}
