import { notFound } from 'next/navigation'
import { getCustomer } from '@/queries/customers'
import { CustomerForm } from '@/components/customers/customer-form'
import { FormShell } from '@genealogiq/ui/form-shell'

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const customer = await getCustomer(id)
  if (!customer) notFound()

  return (
    <FormShell>
      <CustomerForm
      id={id}
      defaultValues={{
        entityType:            customer.entityType as 'INDIVIDUAL' | 'COMPANY',
        businessSegment:       customer.businessSegment,
        name:                  customer.name,
        tradeName:             customer.tradeName,
        taxId:                 customer.taxId,
        stateRegistration:     customer.stateRegistration     ?? '',
        municipalRegistration: customer.municipalRegistration ?? '',
        birthDate:             customer.birthDate ? customer.birthDate.toISOString().slice(0, 10) : '',
        email:                 customer.email,
        phoneCountryCode:      customer.phoneCountryCode,
        phone:                 customer.phone,
        notes:                 customer.notes                 ?? '',
        isActive:              customer.isActive,
        moduleRecordsSuppliers:    customer.moduleRecordsSuppliers,
        moduleCategoriesSuppliers: customer.moduleCategoriesSuppliers,
        address: customer.address ? {
          zip:          customer.address.zip          ?? '',
          street:       customer.address.street       ?? '',
          number:       customer.address.number       ?? '',
          complement:   customer.address.complement   ?? '',
          neighborhood: customer.address.neighborhood ?? '',
          city:         customer.address.city         ?? '',
          state:        customer.address.state        ?? '',
          country:      customer.address.country      ?? 'BR',
        } : undefined,
      }}
      />
    </FormShell>
  )
}
