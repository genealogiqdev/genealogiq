import { useRouter } from 'expo-router'
import { seqApi, type CategoryOption, type SupplierDetail, type SupplierInput } from '@/api/seq'
import { useT } from '@/i18n'
import { useInvalidate } from '@/lib/query'
import { Button, Card, Divider, ListRow, Screen, Section, confirm, useAction } from '@/ui'
import { FormFields, useAddressSpecs, useForm, type Spec } from './forms'
import { addressInput, addressValues, dateOnly, digitsOnly, maskCnpj, maskCpf, nullable, text, validateCnpj, validateCpf } from './util'

const oneLine = (label: string) => label.replace(/:\s*$/, '')

/** Create/edit form of a supplier (web: SupplierForm). */
export function SupplierForm({ supplier, categories }: { supplier?: SupplierDetail; categories: readonly CategoryOption[] }) {
  const t = useT('Suppliers')
  const tc = useT('Common')
  const te = useT('Errors')
  const router = useRouter()
  const invalidate = useInvalidate('seq')
  const actions = useAction()
  const address = useAddressSpecs()
  const form = useForm({
    entityType: supplier?.entityType ?? 'COMPANY',
    name: supplier?.name ?? '',
    tradeName: supplier?.tradeName ?? '',
    taxId: supplier ? (supplier.entityType === 'INDIVIDUAL' ? maskCpf(supplier.taxId) : maskCnpj(supplier.taxId)) : '',
    stateRegistration: supplier?.stateRegistration ?? '',
    municipalRegistration: supplier?.municipalRegistration ?? '',
    birthDate: dateOnly(supplier?.birthDate),
    email: supplier?.email ?? '',
    phoneCountryCode: supplier?.phoneCountryCode ?? '55',
    phone: supplier?.phone ?? '',
    notes: supplier?.notes ?? '',
    categoryId: supplier?.categoryId ?? '',
    isActive: supplier?.isActive ?? true,
    ...addressValues(supplier?.address),
  })
  const individual = form.values.entityType === 'INDIVIDUAL'

  const main: Spec[] = [
    { key: 'isActive', label: oneLine(t('fields.activeSupplier')), kind: 'switch' },
    {
      key: 'entityType',
      label: oneLine(t('fields.type')),
      kind: 'select',
      options: [
        { value: 'COMPANY', label: t('entityType.company') },
        { value: 'INDIVIDUAL', label: t('entityType.individual') },
      ],
    },
    { key: 'name', label: oneLine(t(individual ? 'fields.firstName' : 'fields.companyName')), required: true, min: 2 },
    { key: 'tradeName', label: oneLine(t(individual ? 'fields.lastName' : 'fields.tradeName')), required: true, min: 2 },
    individual
      ? { key: 'taxId', label: oneLine(t('fields.cpf')), kind: 'number', required: true, mask: maskCpf, placeholder: '000.000.000-00', max: 14 }
      : { key: 'taxId', label: oneLine(t('fields.cnpj')), kind: 'number', required: true, mask: maskCnpj, placeholder: '00.000.000/0000-00', max: 18 },
    ...(individual
      ? [{ key: 'birthDate', label: oneLine(t('fields.birthDate')), kind: 'date' } satisfies Spec]
      : [
          { key: 'stateRegistration', label: oneLine(t('fields.stateRegistration')) } satisfies Spec,
          { key: 'municipalRegistration', label: oneLine(t('fields.municipalRegistration')) } satisfies Spec,
        ]),
    { key: 'email', label: oneLine(t('fields.email')), kind: 'email', required: true },
    { key: 'phoneCountryCode', label: oneLine(t('fields.countryCode')), kind: 'number', required: true, requiredMessage: te('countryCodeRequired'), max: 4 },
    { key: 'phone', label: oneLine(t('fields.phone')), kind: 'phone', required: true },
    {
      key: 'categoryId',
      label: oneLine(t('fields.category')),
      kind: 'select',
      required: true,
      requiredMessage: te('categoryRequired'),
      placeholder: t('placeholders.category'),
      options: categories.filter((category) => category.isActive || category.id === supplier?.categoryId).map((category) => ({ value: category.id, label: category.name })),
    },
    { key: 'notes', label: oneLine(t('fields.notes')), kind: 'multiline' },
  ]

  const changed = () => invalidate(['suppliers'], ...(supplier ? [['supplier', supplier.id]] : []))

  async function save() {
    const valid = form.validate([...main, ...address], (values) => {
      const taxId = text(values, 'taxId')
      if (!taxId) return {}
      if (individual) return { taxId: validateCpf(taxId) ? undefined : te('invalidCpf') }
      return { taxId: validateCnpj(taxId) ? undefined : te('invalidCnpj') }
    })
    if (!valid) return
    const values = form.values
    const input: SupplierInput = {
      entityType: individual ? 'INDIVIDUAL' : 'COMPANY',
      name: text(values, 'name'),
      tradeName: text(values, 'tradeName'),
      taxId: digitsOnly(text(values, 'taxId')),
      stateRegistration: individual ? null : nullable(values, 'stateRegistration'),
      municipalRegistration: individual ? null : nullable(values, 'municipalRegistration'),
      birthDate: individual ? nullable(values, 'birthDate') : null,
      email: text(values, 'email'),
      phoneCountryCode: text(values, 'phoneCountryCode'),
      phone: text(values, 'phone'),
      notes: nullable(values, 'notes'),
      categoryId: text(values, 'categoryId'),
      isActive: values.isActive === true,
      address: addressInput(values),
    }
    await form.submit(() => (supplier ? seqApi.updateSupplier(supplier.id, input) : seqApi.createSupplier(input)), {
      success: true,
      onSuccess: async () => {
        await changed()
        router.back()
      },
    })
  }

  async function remove(target: SupplierDetail) {
    const accepted = await confirm({
      title: tc('delete.title'),
      message: `${t('toasts.deleteConfirm', { name: target.name })}\n\n${tc('delete.description')}`,
      confirmLabel: tc('delete.confirm'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!accepted) return
    await actions.run(() => seqApi.deleteSupplier(target.id), {
      success: t('toasts.deleted'),
      onSuccess: async () => {
        await invalidate(['suppliers'])
        router.back()
      },
    })
  }

  const busy = form.pending || actions.pending
  return (
    <Screen
      footer={
        <Button
          label={form.pending ? tc(supplier ? 'saving' : 'creating') : supplier ? tc('save') : t('create')}
          onPress={() => void save()}
          loading={form.pending}
          disabled={actions.pending}
          fullWidth
        />
      }
    >
      <FormFields specs={main} form={form} disabled={actions.pending} />
      <Section title={t('sections.address')}>
        <FormFields specs={address} form={form} disabled={actions.pending} />
      </Section>
      {supplier ? (
        <Card>
          <ListRow
            title={t(supplier.isActive ? 'actions.deactivate' : 'actions.reactivate')}
            icon={supplier.isActive ? 'pause-circle-outline' : 'play-circle-outline'}
            chevron={false}
            onPress={
              busy
                ? undefined
                : () =>
                    void actions.run(() => seqApi.toggleSupplierActive(supplier.id), {
                      success: t(supplier.isActive ? 'toasts.deactivated' : 'toasts.reactivated'),
                      onSuccess: async () => {
                        await changed()
                      },
                    })
            }
          />
          <Divider />
          <ListRow title={t('actions.delete')} icon="trash-outline" destructive chevron={false} onPress={busy ? undefined : () => void remove(supplier)} />
        </Card>
      ) : null}
    </Screen>
  )
}
