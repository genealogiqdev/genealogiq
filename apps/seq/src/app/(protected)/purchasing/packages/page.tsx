import { getTranslations } from 'next-intl/server'
import { getGenCodePackageOffer, getGenCodePackageOrders } from '@/queries/purchasing'
import { GenCodePackageStore } from '@/components/purchasing/gencode-package-store'
import { GenCodePackageOrdersTable } from '@/components/purchasing/gencode-package-orders-table'
import { PurchaseStatusToast } from '@/components/purchasing/purchase-status-toast'
import { Separator } from '@genealogiq/ui/separator'

export default async function PurchasingPackagesPage() {
  const [offer, orders] = await Promise.all([getGenCodePackageOffer(), getGenCodePackageOrders()])
  const t = await getTranslations('GenCodePackages')

  return (
    <div className="flex flex-col gap-6">
      <PurchaseStatusToast kind="package" />
      <div className="space-y-2">
        <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight text-balance">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      {offer ? <GenCodePackageStore offer={offer} /> : <p className="text-muted-foreground">{t('unavailable')}</p>}
      <Separator />
      <h2 className="text-2xl font-bold tracking-tight">{t('orders.title')}</h2>
      <GenCodePackageOrdersTable orders={orders} />
    </div>
  )
}
