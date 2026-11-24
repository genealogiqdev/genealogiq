import { useRouter } from 'expo-router'
import { seqApi, type BusinessCustomerInput, type BusinessSegment } from '@/api/seq'
import { useT } from '@/i18n'
import { useInvalidate } from '@/lib/query'
import { Button, Screen, Section } from '@/ui'
import { FormFields, useAddressSpecs, useForm, type Spec } from './forms'
import { addressInput, digitsOnly, EMAIL, maskCnpj, text, validateCnpj, type FormValues } from './util'

/** Segments new records may use (web: BUSINESS_SEGMENTS). Older rows can hold a retired one. */
export const BUSINESS_SEGMENTS: readonly BusinessSegment[] = ['CEMETERY', 'CREMATORIUM', 'MEMORIAL', 'FUNERAL_HOME']

interface BusinessFormProps {
  id: string | null
  initial: FormValues
  segments: readonly BusinessSegment[]
}

/** Create/edit form of a B2B reseller company (web: BusinessCustomerForm). */
export function BusinessForm({ id, initial, segments }: BusinessFormProps) {
  const t = useT('BusinessCustomers')
  const tc = useT('Customers')
  const te = useT('Errors')
  const router = useRouter()
  const invalidate = useInvalidate('seq')
  const form = useForm(initial)
  const address = useAddressSpecs()

  const main: Spec[] = [
    { key: 'name', label: t('fields.name'), required: true, min: 2, max: 200 },
    { key: 'tradeName', label: t('fields.tradeName'), max: 200 },
    { key: 'taxId', label: t('fields.taxId'), kind: 'number', required: true, mask: maskCnpj, placeholder: '00.000.000/0000-00', max: 18 },
    {
      key: 'segment',
      label: t('fields.segment'),
      kind: 'select',
      required: true,
      placeholder: t('selectSegment'),
      options: segments.map((segment) => ({ value: segment, label: t(`segments.${segment}`) })),
    },
    { key: 'contactName', label: t('fields.contactName'), max: 200 },
    { key: 'email', label: t('fields.email'), kind: 'email' },
    { key: 'phoneCountryCode', label: t('fields.phoneCountryCode'), kind: 'number', max: 4 },
    { key: 'phone', label: t('fields.phone'), kind: 'phone', max: 30 },
  ]
  const tail: Spec[] = [
    { key: 'notes', label: t('fields.notes'), kind: 'multiline', max: 5000 },
    { key: 'isActive', label: t('fields.isActive'), kind: 'switch' },
  ]

  async function save() {
    const valid = form.validate([...main, ...address, ...tail], (values) => {
      const taxId = digitsOnly(text(values, 'taxId'))
      const email = text(values, 'email')
      return {
        taxId: taxId.length !== 14 || !validateCnpj(taxId) ? te('invalidCnpj') : undefined,
        email: email && !EMAIL.test(email) ? te('invalidEmail') : undefined,
        phoneCountryCode: /^\d{1,4}$/.test(text(values, 'phoneCountryCode')) ? undefined : te('countryCodeRequired'),
      }
    })
    if (!valid) return
    const values = form.values
    const input: BusinessCustomerInput = {
      name: text(values, 'name'),
      tradeName: text(values, 'tradeName'),
      taxId: digitsOnly(text(values, 'taxId')),
      segment: text(values, 'segment') as BusinessSegment,
      contactName: text(values, 'contactName'),
      email: text(values, 'email').toLowerCase(),
      phoneCountryCode: text(values, 'phoneCountryCode'),
      phone: text(values, 'phone'),
      notes: text(values, 'notes'),
      isActive: values.isActive === true,
      address: addressInput(values),
    }
    await form.submit(() => seqApi.saveBusinessCustomer(id, input), {
      success: true,
      onSuccess: async () => {
        await invalidate(['businessCustomers'], ...(id ? [['businessCustomer', id]] : []))
        router.back()
      },
    })
  }

  return (
    <Screen footer={<Button label={form.pending ? t('saving') : t('save')} onPress={() => void save()} loading={form.pending} fullWidth />}>
      <FormFields specs={main} form={form} />
      <Section title={tc('sections.address')}>
        <FormFields specs={address} form={form} />
      </Section>
      <FormFields specs={tail} form={form} />
    </Screen>
  )
}
