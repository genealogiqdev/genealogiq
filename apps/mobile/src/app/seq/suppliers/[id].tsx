import { Stack, useLocalSearchParams } from 'expo-router'
import { seqApi } from '@/api/seq'
import { SupplierForm } from '@/features/seq/SupplierForm'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { QueryView } from '@/ui'

export default function SeqSupplierEdit() {
  const t = useT('Suppliers')
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useView('seq', ['supplier', id], () => seqApi.supplier(id))
  return (
    <>
      <Stack.Screen options={{ title: t('edit') }} />
      <QueryView query={query}>
        {({ supplier, categories }) => <SupplierForm key={`${supplier.id}:${supplier.isActive}`} supplier={supplier} categories={categories} />}
      </QueryView>
    </>
  )
}
