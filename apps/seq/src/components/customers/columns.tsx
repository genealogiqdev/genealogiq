'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@genealogiq/ui/badge'
import { DataTableColumnHeader } from '@genealogiq/ui/data-table-column-header'
import { RowActions } from '@genealogiq/ui/row-actions'
import { toggleCustomerActive, deleteCustomer, resendCustomerEmail } from '@/actions/customer.actions'
import { CustomerAccessControls } from './customer-access-controls'
import type { getCustomers } from '@/queries/customers'

// Loose translator type so getColumns can stay a plain function (not a hook).
// The caller (customers-data-table) passes useTranslations('Customers').
type Translator = (key: string, values?: Record<string, string | number | Date>) => string

export type CustomerRow = Awaited<ReturnType<typeof getCustomers>>[number]

function ActionsCell({ row, t }: { row: { original: CustomerRow }; t: Translator }) {
  const customer = row.original
  const fullName = `${customer.firstName} ${customer.lastName}`

  return (
    <RowActions
      menuLabel={t('actions.openMenu')}
      items={[
        { kind: 'link', label: t('actions.view'), href: `/customers/${customer.id}` },
        {
          kind: 'action',
          label: customer.isActive ? t('actions.deactivate') : t('actions.reactivate'),
          run: () => toggleCustomerActive(customer.id),
          successMessage: customer.isActive ? t('toasts.deactivated') : t('toasts.reactivated'),
        },
        ...(customer.email
          ? [
              {
                kind: 'action' as const,
                label: t('actions.resendEmail'),
                run: () => resendCustomerEmail(customer.id),
                successMessage: t('toasts.emailResent'),
              },
            ]
          : []),
      ]}
      remove={{
        label: t('actions.delete'),
        run: () => deleteCustomer(customer.id),
        confirmDescription: t('toasts.deleteConfirm', { name: fullName }),
        successMessage: t('toasts.deleted'),
      }}
    />
  )
}

export function getColumns(t: Translator, locale: string, canManageAccess = false): ColumnDef<CustomerRow>[] {
  return [
    {
      id: 'name',
      accessorFn: (row) => `${row.firstName} ${row.lastName}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.name')} />,
      cell: ({ row }) => `${row.original.firstName} ${row.original.lastName}`,
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.email')} />,
      cell: ({ row }) => row.original.email ?? '—',
    },
    {
      accessorKey: 'isActive',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.status')} />,
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="default">{t('status.active')}</Badge>
        ) : (
          <Badge variant="destructive">{t('status.inactive')}</Badge>
        ),
    },
    {
      id: 'premium',
      accessorFn: (row) => row.access.planCode,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.plan')} />,
      cell: ({ row }) => <div className="space-y-2 py-1">
        <Badge variant={row.original.access.planCode === 'PREMIUM' ? 'default' : 'secondary'}>{row.original.access.planName}</Badge>
        {row.original.access.expiresAt && <p className="text-xs text-muted-foreground">{t('premiumUntil', {
          date: new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone: 'UTC' }).format(row.original.access.expiresAt),
        })}</p>}
        {canManageAccess && <CustomerAccessControls appUserId={row.original.id} consumerName={`${row.original.firstName} ${row.original.lastName}`}
          grantId={row.original.access.grantId} canGrant={row.original.isActive && !!row.original.email} />}
      </div>,
    },
    {
      accessorKey: 'genCodesSold',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.genCodesSold')} />,
      cell: ({ row }) => row.original.genCodesSold,
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
