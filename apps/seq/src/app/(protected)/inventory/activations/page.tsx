import { getTranslations } from 'next-intl/server'
import { getLicenses, getLicenseSummary } from '@/queries/licenses'
import { LicensesDataTable } from '@/components/licenses/licenses-data-table'
import { StatCard } from '@/components/ui/stat-card'
import { Separator } from '@genealogiq/ui/separator'
import { StockPrintBatch } from '@/components/licenses/stock-print-batch'

export default async function LicensesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const validStatus =
    status === 'AVAILABLE' || status === 'SOLD' || status === 'ACTIVATED' ? status : undefined

  const [licenses, summary] = await Promise.all([
    getLicenses(validStatus),
    getLicenseSummary(),
  ])

  const t = await getTranslations('Licenses')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="scroll-m-20 text-4xl font-semibold tracking-tight text-balance">
          {t('title')}
        </h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-3xl">
        <StatCard label={t('summary.available')} value={summary.available} />
        <StatCard label={t('summary.sold')} value={summary.sold} valueClassName="text-amber-600" />
        <StatCard label={t('summary.activated')} value={summary.activated} valueClassName="text-green-600" />
      </div>

      <Separator />
      <StockPrintBatch />

      {/* Licenses (one row per printable QR code) */}
      <LicensesDataTable data={licenses} />
    </div>
  )
}
