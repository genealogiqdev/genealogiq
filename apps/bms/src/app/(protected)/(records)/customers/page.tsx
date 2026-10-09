import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { verifySession } from '@/lib/dal'
import { getCustomers } from '@/queries/customers'
import { CustomersDataTable } from '@/components/customers/customers-data-table'
import { Button } from '@genealogiq/ui/button'

export default async function CustomersPage() {
  const session = await verifySession()
  const customers = await getCustomers()
  const t = await getTranslations('Customers')
  const consumersT = await getTranslations('Consumers')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight text-balance">
          {t('title')}
        </h1>
        <div className="flex flex-wrap gap-2">
          {['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(session.user.role) && <Button asChild variant="outline">
            <Link href="/consumers">{consumersT('title')}</Link>
          </Button>}
          <Button asChild>
            <Link href="/customers/new">{t('new')}</Link>
          </Button>
        </div>
      </div>

      <CustomersDataTable currentUserRole={session.user.role} data={customers} />
    </div>
  )
}
