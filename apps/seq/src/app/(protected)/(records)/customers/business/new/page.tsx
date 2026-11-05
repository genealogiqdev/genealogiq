import { getTranslations } from 'next-intl/server'
import { verifyTenantSession } from '@/lib/dal'
import { BusinessCustomerForm } from '@/components/customers/business-customer-form'
export default async function NewBusinessCustomerPage() {
  await verifyTenantSession()
  const t = await getTranslations('BusinessCustomers')
  return <div className="flex flex-col gap-6"><h1 className="text-4xl font-semibold">{t('new')}</h1><BusinessCustomerForm /></div>
}
