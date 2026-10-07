import { notFound } from 'next/navigation'
import { verifyAdmin } from '@/lib/dal'
import { getGenCodeCustomers, getGenCodePackages } from '@/queries/gencode-packages'
import { getSelectableCoupons } from '@/queries/discount-coupons'
import { NewGenCodeOrderForm } from '@/components/gencode-packages/new-order-form'

export default async function NewGenCodeOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ packageId?: string | string[] }>
}) {
  await verifyAdmin()
  const [packages, customers, coupons, query] = await Promise.all([
    getGenCodePackages({ sellableOnly: true, includeUnsynced: true }),
    getGenCodeCustomers(),
    getSelectableCoupons('brl'),
    searchParams,
  ])
  if (packages.length === 0) notFound()

  return (
    <NewGenCodeOrderForm
      packages={packages}
      customers={customers}
      coupons={coupons}
      initialPackageId={typeof query.packageId === 'string' ? query.packageId : undefined}
    />
  )
}

