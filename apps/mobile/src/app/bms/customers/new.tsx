import { Stack } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { bmsApi, type CustomerCreateFormValues, type CustomerNewView } from '@/api/bms'
import { ConsumerForm } from '@/features/bms/ConsumerForm'
import { BusinessFields, ContactFields, FINAL_CONSUMER, ModuleFields, validateBusiness, validateContact } from '@/features/bms/customer-fields'
import { AddressFields, FormError, NumField, ReadOnlyNote } from '@/features/bms/fields'
import { SEGMENT_KEY, useFormSubmit, useGo, useMe, useRules, type Errors } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Button, Card, Field, Heading, Muted, QueryView, Row, Screen, SelectField, useNotify } from '@/ui'

const STEPS = ['business', 'contact', 'address', 'administrator', 'modules'] as const

function Wizard({ view, allowConsumer }: { view: CustomerNewView; allowConsumer: boolean }) {
  const t = useT('Customers')
  const tc = useT('Common')
  const tk = useT('Consumers')
  const rules = useRules()
  const go = useGo()
  const notify = useNotify()
  const invalidate = useBmsInvalidate()
  const form = useFormSubmit()
  const [step, setStep] = useState(0)
  const [consumerMode, setConsumerMode] = useState(false)
  const [values, setValues] = useState<CustomerCreateFormValues>(view.defaults)
  const set = (patch: Partial<CustomerCreateFormValues>) => setValues((current) => ({ ...current, ...patch }))
  const setOwner = (patch: Partial<CustomerCreateFormValues['owner']>) => setValues((current) => ({ ...current, owner: { ...current.owner, ...patch } }))

  if (consumerMode) {
    const individual = values.entityType === 'INDIVIDUAL'
    return (
      <ConsumerForm
        initial={{ firstName: individual ? values.name : '', lastName: individual ? values.tradeName : '', email: values.email }}
        header={
          <View className="gap-4">
            <Field label={t('fields.type')} value={t('entityType.individual')} disabled />
            <SelectField
              label={t('fields.businessSegment')}
              value={FINAL_CONSUMER}
              options={[
                ...view.segments.map((segment) => ({ value: segment as string, label: t(`businessSegment.${SEGMENT_KEY[segment]}`) })),
                { value: FINAL_CONSUMER, label: t('businessSegment.finalConsumer') },
              ]}
              onChange={(segment) => {
                if (segment === FINAL_CONSUMER) return
                set({ businessSegment: segment as CustomerCreateFormValues['businessSegment'] })
                setConsumerMode(false)
              }}
            />
            <Muted>{tk('wizard.appOnly')}</Muted>
          </View>
        }
      />
    )
  }

  function stepErrors(index: number): Errors {
    if (index === 0) return validateBusiness(values, rules)
    if (index === 1) return validateContact(values, rules)
    if (index === 3) {
      const count = values.initialGenCodes ?? 0
      return {
        'owner.firstName': rules.min(values.owner.firstName, 2),
        'owner.lastName': rules.min(values.owner.lastName, 2),
        'owner.email': rules.email(values.owner.email),
        initialGenCodes: Number.isInteger(count) && count >= 0 && count <= 10_000 ? undefined : rules.t('invalidInitialGenCodes'),
      }
    }
    return {}
  }

  function next() {
    if (form.invalid(stepErrors(step))) return
    // The administrator usually is the contact: offer that address first, as the web does.
    if (step === 2 && !values.owner.email) setOwner({ email: values.email })
    setStep(step + 1)
  }

  function submit() {
    for (const index of [0, 1, 3]) {
      if (form.invalid(stepErrors(index))) {
        setStep(index)
        return
      }
    }
    void form.submit(
      () => bmsApi.createCustomer({ ...values, email: values.email.trim(), owner: { ...values.owner, email: values.owner.email.trim() } }),
      async (response) => {
        if (response.message) {
          if (response.data?.emailPending) notify.info(response.message)
          else notify.success(response.message)
        }
        await invalidate(['customers'], ['dashboard'], ['contractNew'], ['gencodesNew'], ['discountCouponRedeem'])
        go.replace('/bms/customers')
      },
    )
  }

  const key = STEPS[step]
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Muted>{t('stepOf', { step: step + 1, total: STEPS.length })}</Muted>
        <Heading>{t(`sections.${key}`)}</Heading>
        <Muted>{t(`steps.${key}Desc`)}</Muted>
      </View>
      <FormError message={form.error} />

      {step === 0 ? (
        <BusinessFields
          values={values}
          set={set}
          errors={form.errors}
          segments={view.segments}
          entityTypes={view.entityTypes}
          onFinalConsumer={allowConsumer ? () => setConsumerMode(true) : undefined}
        />
      ) : null}
      {step === 1 ? <ContactFields values={values} set={set} errors={form.errors} /> : null}
      {step === 2 ? (
        <>
          <Muted>{t('hints.addressOptional')}</Muted>
          <AddressFields value={values.address} onChange={(address) => set({ address })} />
        </>
      ) : null}
      {step === 3 ? (
        <>
          <Muted>{t('hints.admin')}</Muted>
          <Field label={t('owner.firstName')} value={values.owner.firstName} onChangeText={(firstName) => setOwner({ firstName })} error={form.errors['owner.firstName']} />
          <Field label={t('owner.lastName')} value={values.owner.lastName} onChangeText={(lastName) => setOwner({ lastName })} error={form.errors['owner.lastName']} />
          <Field
            label={t('owner.email')}
            value={values.owner.email}
            onChangeText={(email) => setOwner({ email })}
            error={form.errors['owner.email']}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <NumField
            label={t('fields.initialGenCodes')}
            value={values.initialGenCodes ?? 0}
            onChange={(initialGenCodes) => set({ initialGenCodes })}
            error={form.errors.initialGenCodes}
            hint={t('hints.initialGenCodes')}
            integer
          />
        </>
      ) : null}
      {step === 4 ? (
        <Card>
          <ModuleFields values={values} set={set} />
        </Card>
      ) : null}

      <Row>
        <View className="flex-1">
          <Button label={step === 0 ? tc('cancel') : tc('back')} variant="outline" disabled={form.pending} onPress={() => (step === 0 ? go.back() : setStep(step - 1))} />
        </View>
        <View className="flex-1">
          {step < STEPS.length - 1 ? (
            <Button label={tc('next')} onPress={next} />
          ) : (
            <Button label={form.pending ? tc('creating') : t('create')} onPress={submit} loading={form.pending} />
          )}
        </View>
      </Row>
    </View>
  )
}

export default function CustomerNew() {
  const t = useT('Customers')
  const me = useMe()
  const query = useView('bms', ['customerNew'], () => bmsApi.customerNew())
  return (
    <>
      <Stack.Screen options={{ title: t('new') }} />
      <QueryView query={query}>
        {(view) => <Screen>{view.canSubmit ? <Wizard view={view} allowConsumer={!!me.data?.isConsumerAdmin} /> : <ReadOnlyNote />}</Screen>}
      </QueryView>
    </>
  )
}
