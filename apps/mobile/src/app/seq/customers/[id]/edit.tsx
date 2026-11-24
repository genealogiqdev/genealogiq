import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { seqApi, type CustomerView } from '@/api/seq'
import { customerInput, customerValues, useCustomerSpecs } from '@/features/seq/customer'
import { FormFields, useForm } from '@/features/seq/forms'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { Button, QueryView, Screen, Section, SwitchRow } from '@/ui'

function EditForm({ view }: { view: CustomerView }) {
  const t = useT('Customers')
  const tc = useT('Common')
  const router = useRouter()
  const invalidate = useInvalidate('seq')
  const form = useForm(customerValues(view.customer))
  const specs = useCustomerSpecs(view.categories, view.customer.categoryId)
  const all = [...specs.personal, ...specs.contact, ...specs.address, ...specs.social]

  async function save() {
    if (!form.validate(all)) return
    await form.submit(() => seqApi.updateCustomer(view.customer.id, customerInput(form.values)), {
      success: true,
      onSuccess: async () => {
        await invalidate(['customer', view.customer.id], ['customers'])
        router.back()
      },
    })
  }

  return (
    <Screen footer={<Button label={form.pending ? tc('saving') : tc('save')} onPress={() => void save()} loading={form.pending} fullWidth />}>
      <SwitchRow label={t('active')} value={form.values.isActive === true} onChange={(value) => form.set('isActive', value)} disabled={form.pending} />
      <Section title={t('sections.personal')}>
        <FormFields specs={specs.personal} form={form} />
      </Section>
      <Section title={t('sections.contact')}>
        <FormFields specs={specs.contact} form={form} />
      </Section>
      <Section title={t('sections.address')}>
        <FormFields specs={specs.address} form={form} />
      </Section>
      <Section title={t('sections.social')}>
        <FormFields specs={specs.social} form={form} />
      </Section>
    </Screen>
  )
}

export default function SeqCustomerEdit() {
  const t = useT('Customers')
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useView('seq', ['customer', id], () => seqApi.customer(id))
  return (
    <>
      <Stack.Screen options={{ title: t('actions.edit') }} />
      <QueryView query={query}>{(view) => <EditForm view={view} />}</QueryView>
    </>
  )
}
