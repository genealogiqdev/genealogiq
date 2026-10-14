import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getCustomers } from '@/queries/customers'
import { CustomersDataTable } from '@/components/customers/customers-data-table'
import { Button } from '@genealogiq/ui/button'
import { canManageCustomerAccess } from '@/lib/customer-access'

export default async function CustomersPage() {

  const [customers, canManageAccess] = await Promise.all([getCustomers(), canManageCustomerAccess()])
  const t = await getTranslations('Customers')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="scroll-m-20 text-4xl font-semibold tracking-tight text-balance">
          {t('title')}
        </h1>
        <Button asChild>
          <Link href="/customers/new">{t('new')}</Link>
        </Button>
      </div>

      <CustomersDataTable data={customers} canManageAccess={canManageAccess} />
    </div>
  )
}
