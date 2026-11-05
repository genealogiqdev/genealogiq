import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getCustomers } from '@/queries/customers'
import { CustomersDataTable } from '@/components/customers/customers-data-table'
import { Button } from '@genealogiq/ui/button'
import { canManageCustomerAccess } from '@/lib/customer-access'
import { getBusinessCustomers } from '@/queries/business-customers'
import { BusinessCustomersDataTable } from '@/components/customers/business-customers-data-table'
import { getBusinessCodeState } from '@/lib/business-code-status'

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const business = (await searchParams).type === 'business'
  const [customers, canManageAccess, companies] = await Promise.all([
    business ? [] : getCustomers(), business ? false : canManageCustomerAccess(), business ? getBusinessCustomers() : [],
  ])
  const t = await getTranslations('Customers')
  const tb = await getTranslations('BusinessCustomers')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="scroll-m-20 text-4xl font-semibold tracking-tight text-balance">
          {t('title')}
        </h1>
        <Button asChild>
          <Link href={business ? '/customers/business/new' : '/customers/new'}>{business ? tb('new') : t('new')}</Link>
        </Button>
      </div>

      <nav aria-label={t('title')} className="flex flex-wrap gap-2">
        <Button variant={business ? 'outline' : 'default'} asChild><Link href="/customers" aria-current={!business ? 'page' : undefined}>{tb('consumersTab')}</Link></Button>
        <Button variant={business ? 'default' : 'outline'} asChild><Link href="/customers?type=business" aria-current={business ? 'page' : undefined}>{tb('businessTab')}</Link></Button>
      </nav>
      {business ? <BusinessCustomersDataTable data={companies.map(({ sales, ...company }) => {
        const states = sales.flatMap(sale => sale.genCodes.map(code => getBusinessCodeState(code)))
        return { ...company, genCodesSold: states.filter(state => state !== 'returned').length,
          available: states.filter(state => state === 'available').length,
          assigned: states.filter(state => state === 'assigned').length, activated: states.filter(state => state === 'activated').length,
        }
      })} />
        : <CustomersDataTable data={customers} canManageAccess={canManageAccess} />}
    </div>
  )
}
