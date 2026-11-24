import { Stack } from 'expo-router'
import { seqApi } from '@/api/seq'
import { SupplierForm } from '@/features/seq/SupplierForm'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { QueryView } from '@/ui'

export default function SeqSupplierNew() {
  const t = useT('Suppliers')
  const query = useView('seq', ['supplierNew'], () => seqApi.supplierNew())
  return (
    <>
      <Stack.Screen options={{ title: t('new') }} />
      <QueryView query={query}>{({ categories }) => <SupplierForm categories={categories} />}</QueryView>
    </>
  )
}
