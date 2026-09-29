import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { verifySession } from '@/lib/dal'
import { getGenCodeOrders, getGenCodePackages } from '@/queries/gencode-packages'
import { GenCodePackageCard } from '@/components/gencode-packages/package-card'
import { GenCodeOrdersDataTable } from '@/components/gencode-packages/orders-data-table'

export default async function GenCodePackagesPage() {
  await verifySession()
  const [packages, orders, t] = await Promise.all([
    getGenCodePackages(),
    getGenCodeOrders(),
    getTranslations('GenCodePackages'),
  ])
  if (packages.length === 0) notFound()

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight text-balance">
          {t('title')}
        </h1>
        <p className="mt-2 text-muted-foreground">{t('description')}</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        {packages.map((packageRow) => (
          <GenCodePackageCard key={packageRow.id} packageRow={packageRow} />
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('ordersTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('ordersDescription')}</p>
        </div>
        <GenCodeOrdersDataTable data={orders} />
      </section>
    </div>
  )
}

