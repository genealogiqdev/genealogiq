import { notFound } from 'next/navigation'
import { verifyAdmin } from '@/lib/dal'
import { getEligibleGenCodeCustomers, getGenCodePackage } from '@/queries/gencode-packages'
import { NewGenCodeOrderForm } from '@/components/gencode-packages/new-order-form'

export default async function NewGenCodeOrderPage() {
  await verifyAdmin()
  const [packageRow, customers] = await Promise.all([
    getGenCodePackage(),
    getEligibleGenCodeCustomers(),
  ])
  if (!packageRow || !packageRow.isActive || !packageRow.stripePriceId) notFound()

  return <NewGenCodeOrderForm packageRow={packageRow} customers={customers} />
}

