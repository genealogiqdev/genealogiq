import { useLocalSearchParams } from 'expo-router'
import { CategoryEdit } from '@/features/seq/Categories'

export default function SeqCustomerCategoryEdit() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <CategoryEdit kind="customers" id={id} />
}
