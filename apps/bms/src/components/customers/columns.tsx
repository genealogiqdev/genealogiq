'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@genealogiq/ui/badge'
import { DataTableColumnHeader } from '@genealogiq/ui/data-table-column-header'
import { RowActions } from '@genealogiq/ui/row-actions'
import { toggleCustomerActive, deleteCustomer, resendCustomerEmail } from '@/actions/customer.actions'

// Loose translator type so getColumns can stay a plain function (not a hook).
// The caller (customers-data-table) passes useTranslations('Customers').
type Translator = (key: string, values?: Record<string, string | number | Date>) => string

const SEGMENT_KEY: Record<string, string> = {
  FUNERAL_HOME: 'funeralHome',
  MARBLE_SHOP: 'marbleShop',
  CEMETERY: 'cemetery',
  URN_MANUFACTURER: 'urnManufacturer',
  PLAQUE_PRINTER: 'plaquePrinter',
}

export type CustomerRow = {
  id: string
  entityType: string
  businessSegment: string
  name: string
  email: string
  isActive: boolean
  createdAt: Date
}

function ActionsCell({ row, currentUserRole, t }: { row: { original: CustomerRow }; currentUserRole: string; t: Translator }) {
  const customer = row.original
  const canManage = currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'OWNER'

  return (
    <RowActions
      menuLabel={t('actions.openMenu')}
      items={[
        { kind: 'link', label: t('actions.edit'), href: `/customers/${customer.id}` },
        {
          kind: 'action',
          label: customer.isActive ? t('actions.deactivate') : t('actions.reactivate'),
          run: () => toggleCustomerActive(customer.id),
          successMessage: customer.isActive ? t('toasts.deactivated') : t('toasts.reactivated'),
        },
        {
          kind: 'action',
          label: t('actions.resendEmail'),
          run: () => resendCustomerEmail(customer.id),
          successMessage: t('toasts.emailResent'),
        },
      ]}
      remove={canManage ? {
        label: t('actions.delete'),
        run: () => deleteCustomer(customer.id),
        confirmDescription: t('toasts.deleteConfirm', { name: customer.name }),
        successMessage: t('toasts.deleted'),
      } : undefined}
    />
  )
}

export function getColumns(currentUserRole: string, t: Translator, locale: string): ColumnDef<CustomerRow>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.name')} />,
      cell: ({ row }) => row.original.name,
    },
    {
      accessorKey: 'entityType',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.type')} />,
      cell: ({ row }) =>
        row.original.entityType === 'INDIVIDUAL' ? t('entityType.individual') : t('entityType.company'),
    },
    {
      accessorKey: 'businessSegment',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.segment')} />,
      cell: ({ row }) => t(`businessSegment.${SEGMENT_KEY[row.original.businessSegment] ?? 'funeralHome'}`),
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.email')} />,
      cell: ({ row }) => row.original.email,
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
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.createdAt')} />,
      cell: ({ row }) =>
        new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(row.original.createdAt),
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => <ActionsCell row={row} currentUserRole={currentUserRole} t={t} />,
    },
  ]
}
