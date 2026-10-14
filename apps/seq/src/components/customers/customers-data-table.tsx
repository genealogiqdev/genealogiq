'use client'

import { useTranslations, useLocale } from 'next-intl'
import { DataTable } from '@genealogiq/ui/data-table'
import { getColumns, type CustomerRow } from './columns'

interface CustomersDataTableProps {
  data: CustomerRow[]
  canManageAccess?: boolean
}

export function CustomersDataTable({ data, canManageAccess = false }: CustomersDataTableProps) {
  const t = useTranslations('Customers')
  const locale = useLocale()

  const columnLabels: Record<string, string> = {
    name:      t('table.name'),
    email:     t('table.email'),
    isActive:  t('table.status'),
    createdAt: t('table.createdAt'),
    premium:   t('table.plan'),
    genCodesSold: t('table.genCodesSold'),
  }

  return (
    <DataTable
      columns={getColumns(t, locale, canManageAccess)}
      data={data}
      emptyMessage={t('table.empty')}
      columnLabels={columnLabels}
    />
  )
}
