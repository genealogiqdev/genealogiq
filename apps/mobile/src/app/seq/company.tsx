import { Stack } from 'expo-router'
import { seqApi, type CompanyView } from '@/api/seq'
import { FormFields, useAddressSpecs, useForm, type Spec } from '@/features/seq/forms'
import { addressInput, addressValues, digitsOnly, maskCnpj, nullable, text } from '@/features/seq/util'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { Button, QueryView, Screen, Section } from '@/ui'

function CompanyForm({ company, refresh, refreshing }: { company: CompanyView['company']; refresh: () => Promise<unknown>; refreshing: boolean }) {
  const t = useT('Company')
  const tc = useT('Common')
  const te = useT('Errors')
  const invalidate = useInvalidate('seq')
  const address = useAddressSpecs()
  const form = useForm({
    legalName: company.legalName,
    tradeName: company.tradeName,
    taxId: maskCnpj(company.taxId),
    stateRegistration: company.stateRegistration ?? '',
    municipalRegistration: company.municipalRegistration ?? '',
    email: company.email,
    phoneCountryCode: company.phoneCountryCode,
    phone: company.phone,
    isActive: company.isActive,
    ...addressValues(company.address),
  })
  const main: Spec[] = [
    { key: 'legalName', label: t('fields.legalName'), required: true, min: 2 },
    { key: 'tradeName', label: t('fields.tradeName'), required: true, min: 2 },
    { key: 'taxId', label: t('fields.cnpj'), kind: 'number', required: true, mask: maskCnpj, placeholder: '00.000.000/0000-00', max: 18 },
    { key: 'stateRegistration', label: t('fields.stateRegistration') },
    { key: 'municipalRegistration', label: t('fields.municipalRegistration') },
    { key: 'email', label: t('fields.email'), kind: 'email', required: true },
    { key: 'phoneCountryCode', label: t('fields.countryCode'), kind: 'number', required: true, requiredMessage: te('countryCodeRequired'), max: 4 },
    { key: 'phone', label: t('fields.phone'), kind: 'phone', required: true },
    { key: 'isActive', label: t('fields.isActive'), kind: 'switch' },
  ]

  async function save() {
    if (!form.validate([...main, ...address])) return
    const values = form.values
    await form.submit(
      () =>
        seqApi.updateCompany(company.id, {
          legalName: text(values, 'legalName'),
          tradeName: text(values, 'tradeName'),
          taxId: digitsOnly(text(values, 'taxId')),
          stateRegistration: nullable(values, 'stateRegistration'),
          municipalRegistration: nullable(values, 'municipalRegistration'),
          email: text(values, 'email'),
          phoneCountryCode: text(values, 'phoneCountryCode'),
          phone: text(values, 'phone'),
          isActive: values.isActive === true,
          address: addressInput(values),
        }),
      {
        success: t('toasts.updated'),
        onSuccess: async () => {
          await invalidate(['company'], ['me'])
        },
      },
    )
  }

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      footer={<Button label={form.pending ? tc('saving') : tc('save')} onPress={() => void save()} loading={form.pending} fullWidth />}
    >
      <FormFields specs={main} form={form} />
      <Section title={t('sections.address')}>
        <FormFields specs={address} form={form} />
      </Section>
    </Screen>
  )
}

export default function SeqCompany() {
  const t = useT('Company')
  const query = useView('seq', ['company'], () => seqApi.company())
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <QueryView query={query}>{({ company }) => <CompanyForm company={company} refresh={query.refetch} refreshing={query.isRefetching} />}</QueryView>
    </>
  )
}
