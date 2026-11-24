import { useLocalSearchParams } from 'expo-router'
import { CategoryEdit } from '@/features/seq/Categories'

export default function SeqSupplierCategoryEdit() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <CategoryEdit kind="suppliers" id={id} />
}
