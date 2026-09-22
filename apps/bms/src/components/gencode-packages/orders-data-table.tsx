'use client'

import { useLocale, useTranslations } from 'next-intl'
import { DataTable } from '@genealogiq/ui/data-table'
import type { GenCodeOrderRow } from '@/queries/gencode-packages'
import { getColumns } from './columns'

export function GenCodeOrdersDataTable({ data }: { data: GenCodeOrderRow[] }) {
  const t = useTranslations('GenCodePackages')
  const locale = useLocale()

  return (
    <DataTable
      columns={getColumns(t, locale)}
      data={data}
      filterColumn="tenant"
      filterPlaceholder={t('table.search')}
      emptyMessage={t('table.empty')}
      initialSorting={[{ id: 'createdAt', desc: true }]}
      columnLabels={{
        tenant: t('table.customer'),
        quantity: t('table.quantity'),
        unitPrice: t('table.unitPrice'),
        totalAmount: t('table.total'),
        status: t('table.status'),
        creditExpiresAt: t('table.validUntil'),
        createdAt: t('table.createdAt'),
      }}
    />
  )
}

