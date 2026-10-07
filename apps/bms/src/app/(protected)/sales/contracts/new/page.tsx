import { getLocale } from 'next-intl/server'
import { currencyForLocale } from '@genealogiq/core'
import { verifyAdmin } from '@/lib/dal'
import { getActiveCustomers } from '@/queries/customers'
import { getSellablePartnerPlans } from '@/queries/partner-plans'
import { getSelectableCoupons } from '@/queries/discount-coupons'
import { SendPlanLinkForm } from '@/components/partner-subscriptions/send-plan-link-form'

export default async function NewContractPage() {
  await verifyAdmin()

  // Currency comes from the language the operator is working in, not a field
  // they fill — a subscription sold in Portuguese charges in reais.
  const currency = currencyForLocale(await getLocale())

  const [tenants, plans, coupons] = await Promise.all([
    getActiveCustomers(),
    getSellablePartnerPlans(currency, true),
    getSelectableCoupons(currency),
  ])

  return (
    <SendPlanLinkForm
      tenants={tenants.map((c) => ({ id: c.id, name: c.name, taxId: c.taxId }))}
      plans={plans}
      coupons={coupons}
    />
  )
}
