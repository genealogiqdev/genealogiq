import { View } from 'react-native'
import type { CustomerFormValues, EntityType, PartnerSegment } from '@/api/bms'
import { useT } from '@/i18n'
import { DateField, Field, Muted, SelectField, SwitchRow } from '@/ui'
import { PhoneFields } from './fields'
import { SEGMENT_KEY, validCnpj, validCpf, type Errors, type useRules } from './lib'

type Rules = ReturnType<typeof useRules>
type Patch = (patch: Partial<CustomerFormValues>) => void

export const FINAL_CONSUMER = 'FINAL_CONSUMER'

/** Step 0 of the web wizard: legal identification. */
export function validateBusiness(values: CustomerFormValues, rules: Rules): Errors {
  return {
    name: rules.min(values.name, 2),
    tradeName: rules.min(values.tradeName, 2),
    taxId:
      rules.required(values.taxId) ??
      (values.entityType === 'INDIVIDUAL'
        ? validCpf(values.taxId) ? undefined : rules.t('invalidCpf')
        : validCnpj(values.taxId) ? undefined : rules.t('invalidCnpj')),
  }
}

/** Step 1 of the web wizard: contact. */
export function validateContact(values: CustomerFormValues, rules: Rules): Errors {
  return {
    email: rules.email(values.email),
    phoneCountryCode: values.phoneCountryCode ? undefined : rules.t('countryCodeRequired'),
    phone: rules.required(values.phone),
  }
}

interface FieldsProps {
  values: CustomerFormValues
  set: Patch
  errors: Errors
  disabled?: boolean
}

export function BusinessFields({
  values,
  set,
  errors,
  disabled,
  segments,
  entityTypes,
  onFinalConsumer,
}: FieldsProps & { segments: readonly PartnerSegment[]; entityTypes: readonly EntityType[]; onFinalConsumer?: () => void }) {
  const t = useT('Customers')
  const individual = values.entityType === 'INDIVIDUAL'
  const segmentOptions: { value: string; label: string }[] = segments.map((segment) => ({
    value: segment,
    label: t(`businessSegment.${SEGMENT_KEY[segment]}`),
  }))
  if (onFinalConsumer) segmentOptions.push({ value: FINAL_CONSUMER, label: t('businessSegment.finalConsumer') })
  return (
    <View className="gap-4">
      <SelectField
        label={t('fields.type')}
        value={values.entityType}
        options={entityTypes.map((type) => ({ value: type, label: t(type === 'INDIVIDUAL' ? 'entityType.individual' : 'entityType.company') }))}
        onChange={(entityType) => set({ entityType })}
        disabled={disabled}
      />
      <SelectField
        label={t('fields.businessSegment')}
        value={values.businessSegment as string}
        options={segmentOptions}
        onChange={(segment) => (segment === FINAL_CONSUMER ? onFinalConsumer?.() : set({ businessSegment: segment as PartnerSegment }))}
        disabled={disabled}
      />
      <Field label={t(individual ? 'fields.firstName' : 'fields.companyName')} value={values.name} onChangeText={(name) => set({ name })} error={errors.name} disabled={disabled} />
      <Field label={t(individual ? 'fields.lastName' : 'fields.tradeName')} value={values.tradeName} onChangeText={(tradeName) => set({ tradeName })} error={errors.tradeName} disabled={disabled} />
      <Field
        label={t(individual ? 'fields.cpf' : 'fields.cnpj')}
        value={values.taxId}
        onChangeText={(taxId) => set({ taxId })}
        error={errors.taxId}
        disabled={disabled}
        keyboardType="numbers-and-punctuation"
      />
      {individual ? (
        disabled ? (
          <Field label={t('fields.birthDate')} value={values.birthDate ?? ''} disabled />
        ) : (
          <DateField label={t('fields.birthDate')} value={values.birthDate ?? ''} onChange={(birthDate) => set({ birthDate })} maximumDate={new Date()} />
        )
      ) : (
        <>
          <Field label={t('fields.stateRegistration')} value={values.stateRegistration ?? ''} onChangeText={(stateRegistration) => set({ stateRegistration })} disabled={disabled} />
          <Field label={t('fields.municipalRegistration')} value={values.municipalRegistration ?? ''} onChangeText={(municipalRegistration) => set({ municipalRegistration })} disabled={disabled} />
        </>
      )}
    </View>
  )
}

export function ContactFields({ values, set, errors, disabled }: FieldsProps) {
  const t = useT('Customers')
  return (
    <View className="gap-4">
      <Field label={t('fields.email')} value={values.email} onChangeText={(email) => set({ email })} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} disabled={disabled} />
      <PhoneFields
        code={values.phoneCountryCode}
        phone={values.phone}
        onCode={(phoneCountryCode) => set({ phoneCountryCode })}
        onPhone={(phone) => set({ phone })}
        codeLabel={t('fields.countryCode')}
        phoneLabel={t('fields.phone')}
        errors={errors}
        disabled={disabled}
      />
      <Field label={t('fields.notes')} value={values.notes ?? ''} onChangeText={(notes) => set({ notes })} multiline disabled={disabled} />
    </View>
  )
}

export function ModuleFields({ values, set, disabled }: Omit<FieldsProps, 'errors'>) {
  const t = useT('Customers')
  return (
    <View className="gap-2">
      <Muted>{t('hints.modulesGray')}</Muted>
      <SwitchRow
        label={t('modules.labels.suppliers')}
        description={t('modules.groups.records')}
        value={!!values.moduleRecordsSuppliers}
        onChange={(moduleRecordsSuppliers) => set({ moduleRecordsSuppliers })}
        disabled={disabled}
      />
      <SwitchRow
        label={t('modules.labels.supplierCat')}
        description={t('modules.groups.categories')}
        value={!!values.moduleCategoriesSuppliers}
        onChange={(moduleCategoriesSuppliers) => set({ moduleCategoriesSuppliers })}
        disabled={disabled}
      />
    </View>
  )
}
