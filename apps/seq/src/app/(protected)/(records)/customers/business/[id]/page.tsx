import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getBusinessCustomer } from '@/queries/business-customers'
import { BusinessCustomerForm } from '@/components/customers/business-customer-form'
import { BusinessGenCodeSales } from '@/components/customers/business-gencode-sales'
import { businessCustomerDefaults, type BusinessCustomerFormValues } from '@/schemas/business-customer.schema'
import { BusinessCodeInventory } from '@/components/customers/business-code-inventory'
import { getBusinessCodeState } from '@/lib/business-code-status'
import { canManageCustomerAccess } from '@/lib/customer-access'
export default async function BusinessCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const customer = await getBusinessCustomer(id)
  if (!customer) notFound()
  const t = await getTranslations('BusinessCustomers')
  const canDeliver = await canManageCustomerAccess()
  const address = customer.address ? Object.fromEntries(Object.keys(businessCustomerDefaults.address ?? {}).map(key => [key, customer.address![key as keyof typeof customer.address] ?? ''])) : undefined
  return <div className="flex flex-col gap-8">
    <h1 className="text-4xl font-semibold">{t('edit')}: {customer.name}</h1>
    <BusinessCodeInventory customerId={id} active={customer.isActive} canDeliver={canDeliver} codes={customer.sales.flatMap(sale => sale.genCodes.map(code => ({
      genCode: code.genCode, state: getBusinessCodeState(code), expiresAt: code.reservation?.expiresAt ?? null,
      url: `${(process.env.APP_URL ?? 'https://genealogiq.app').replace(/\/+$/, '')}/qr/${encodeURIComponent(code.genCode)}`,
      recipient: code.soldToAppUser ? { id: code.soldToAppUser.id, name: `${code.soldToAppUser.firstName} ${code.soldToAppUser.lastName}`, email: code.soldToAppUser.email } : null,
    })))} />
    <BusinessGenCodeSales customerId={id} active={customer.isActive} appBaseUrl={(process.env.APP_URL ?? 'https://genealogiq.app').replace(/\/+$/, '')} sales={customer.sales.map(sale => ({
      id: sale.id, quantity: sale.quantity, unitValue: sale.unitValue === null ? null : Number(sale.unitValue),
      createdAt: sale.createdAt, codes: sale.codes, activeCodes: sale.genCodes.filter(code => getBusinessCodeState(code) === 'available').map(code => code.genCode),
    }))} />
    <details><summary className="cursor-pointer text-xl font-semibold">{t('companyDetails')}</summary><div className="mt-4"><BusinessCustomerForm id={id} defaultValues={{ name: customer.name, tradeName: customer.tradeName, taxId: customer.taxId,
      segment: customer.segment as BusinessCustomerFormValues['segment'], contactName: customer.contactName,
      email: customer.email, phoneCountryCode: customer.phoneCountryCode, phone: customer.phone,
      notes: customer.notes ?? '', isActive: customer.isActive, address,
    }} /></div></details>
  </div>
}
