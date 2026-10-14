import { getCustomerCategories } from '@/queries/customer-categories'
import { CustomerNewForm } from '@/components/customers/customer-new-form'
import { canManageCustomerAccess } from '@/lib/customer-access'

export default async function NewCustomerPage() {
  const [categories, canManageAccess] = await Promise.all([getCustomerCategories(), canManageCustomerAccess()])
  return <CustomerNewForm categories={categories} canManageAccess={canManageAccess} />
}
