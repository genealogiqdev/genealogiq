import { Stack, useLocalSearchParams } from 'expo-router'
import { seqApi } from '@/api/seq'
import { BUSINESS_SEGMENTS, BusinessForm } from '@/features/seq/BusinessForm'
import { addressValues, maskCnpj } from '@/features/seq/util'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { QueryView } from '@/ui'

export default function SeqBusinessCustomerEdit() {
  const t = useT('BusinessCustomers')
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useView('seq', ['businessCustomer', id], () => seqApi.businessCustomer(id))
  return (
    <>
      <Stack.Screen options={{ title: t('companyDetails') }} />
      <QueryView query={query}>
        {({ company }) => (
          <BusinessForm
            id={company.id}
            segments={BUSINESS_SEGMENTS}
            initial={{
              name: company.name,
              tradeName: company.tradeName,
              taxId: maskCnpj(company.taxId),
              // A retired segment must be replaced before saving, as on the web.
              segment: BUSINESS_SEGMENTS.includes(company.segment) ? company.segment : '',
              contactName: company.contactName,
              email: company.email,
              phoneCountryCode: company.phoneCountryCode,
              phone: company.phone,
              notes: company.notes,
              isActive: company.isActive,
              ...addressValues(company.address),
            }}
          />
        )}
      </QueryView>
    </>
  )
}
