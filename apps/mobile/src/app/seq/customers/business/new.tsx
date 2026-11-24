import { Stack } from 'expo-router'
import { seqApi } from '@/api/seq'
import { BusinessForm } from '@/features/seq/BusinessForm'
import { addressValues } from '@/features/seq/util'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { QueryView } from '@/ui'

export default function SeqBusinessCustomerNew() {
  const t = useT('BusinessCustomers')
  const query = useView('seq', ['businessCustomerNew'], () => seqApi.businessCustomerNew())
  return (
    <>
      <Stack.Screen options={{ title: t('new') }} />
      <QueryView query={query}>
        {({ segments, defaults }) => (
          <BusinessForm
            id={null}
            segments={segments}
            initial={{
              name: defaults.name,
              tradeName: defaults.tradeName,
              taxId: defaults.taxId,
              segment: defaults.segment,
              contactName: defaults.contactName,
              email: defaults.email,
              phoneCountryCode: defaults.phoneCountryCode,
              phone: defaults.phone,
              notes: defaults.notes,
              isActive: defaults.isActive,
              ...addressValues(defaults.address),
            }}
          />
        )}
      </QueryView>
    </>
  )
}
