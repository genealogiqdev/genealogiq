'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { RowActions } from '@genealogiq/ui/row-actions'
import { DataTableColumnHeader } from '@genealogiq/ui/data-table-column-header'
import { QrCodeDownloadDialog } from './qr-code-download-dialog'

// Loose translator type so getColumns can stay a plain function (not a hook).
// The caller (memorialized-data-table) passes useTranslations('Memorialized').
type Translator = (key: string, values?: Record<string, string | number | Date>) => string

export type MemorializedRow = {
  id:        string
  firstName: string
  lastName:  string
  birthDate: Date | null
  deathDate: Date | null
  profileUrl: string
}

function formatDate(d: Date | null | undefined, locale: string): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(d))
}

function ActionsCell({ row, t }: { row: { original: MemorializedRow }; t: Translator }) {
  const profile = row.original

  return (
    <RowActions
      menuLabel={t('actions.openMenu')}
      items={[
        { kind: 'link', label: t('actions.view'), href: `/memorialized/${profile.id}` },
      ]}
    />
  )
}

export function getColumns(t: Translator, locale: string): ColumnDef<MemorializedRow>[] {
  return [
    {
      id: 'name',
      accessorFn: (row) => `${row.firstName} ${row.lastName}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.name')} />,
      cell: ({ row }) => `${row.original.firstName} ${row.original.lastName}`,
    },
    {
      accessorKey: 'birthDate',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.birthDate')} />,
      cell: ({ row }) => formatDate(row.original.birthDate, locale),
    },
    {
      accessorKey: 'deathDate',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('table.deathDate')} />,
      cell: ({ row }) => formatDate(row.original.deathDate, locale),
    },
    {
      id: 'qrcode',
      header: t('table.qrCode'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <QrCodeDownloadDialog
          name={`${row.original.firstName} ${row.original.lastName}`.trim()}
          profileUrl={row.original.profileUrl}
        />
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => <ActionsCell row={row} t={t} />,
    },
  ]
}
