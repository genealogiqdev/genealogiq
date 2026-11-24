import { Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { bmsApi, type CustomerFormValues, type CustomerView } from '@/api/bms'
import { BusinessFields, ContactFields, ModuleFields, validateBusiness, validateContact } from '@/features/bms/customer-fields'
import { AddressFields, EMPTY_ADDRESS, FormError, ReadOnlyNote, StatusBadge } from '@/features/bms/fields'
import { canDelete, useFormSubmit, useGo, useMe, useRefresh, useRules } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Button, Card, Heading, Muted, QueryView, Row, Screen, Section, Text, confirm, useAction, useNotify } from '@/ui'

const SEGMENTS = ['FUNERAL_HOME', 'MARBLE_SHOP', 'CEMETERY', 'URN_MANUFACTURER', 'PLAQUE_PRINTER'] as const
const ENTITY_TYPES = ['COMPANY', 'INDIVIDUAL'] as const

function AccessCard({ id, owner }: { id: string; owner: { email: string; isActive: boolean } | null }) {
  const t = useT('Customers')
  const action = useAction()
  return (
    <Card>
      <Heading>{t('access.title')}</Heading>
      <Muted>{t('access.description')}</Muted>
      {owner ? <Text className="text-sm">{t('access.recipient', { email: owner.email })}</Text> : <Muted>{t('access.noOwner')}</Muted>}
      {owner && !owner.isActive ? <Muted>{t('access.inactive')}</Muted> : null}
      <Button
        label={action.pending ? t('access.sending') : t('actions.resendEmail')}
        variant="outline"
        icon="mail-outline"
        disabled={!owner?.isActive}
        loading={action.pending}
        onPress={() => void action.run(() => bmsApi.resendCustomerEmail(id), { success: owner ? t('access.sent', { email: owner.email }) : true })}
      />
    </Card>
  )
}

function Editor({ view, refresh }: { view: CustomerView; refresh: { refreshing: boolean; onRefresh: () => void } }) {
  const t = useT('Customers')
  const tc = useT('Common')
  const rules = useRules()
  const go = useGo()
  const notify = useNotify()
  const me = useMe()
  const invalidate = useBmsInvalidate()
  const form = useFormSubmit()
  const action = useAction()
  const { customer, canEdit } = view
  // Redacted values arrive as the server sent them and are only displayed: a read-only role never submits this form.
  const [values, setValues] = useState<CustomerFormValues>({
    entityType: customer.entityType,
    businessSegment: customer.businessSegment,
    name: customer.name,
    tradeName: customer.tradeName,
    taxId: customer.taxId,
    stateRegistration: customer.stateRegistration ?? '',
    municipalRegistration: customer.municipalRegistration ?? '',
    birthDate: customer.birthDate ? customer.birthDate.slice(0, 10) : '',
    email: customer.email,
    phoneCountryCode: customer.phoneCountryCode,
    phone: customer.phone,
    notes: customer.notes ?? '',
    isActive: customer.isActive,
    moduleRecordsSuppliers: customer.moduleRecordsSuppliers,
    moduleCategoriesSuppliers: customer.moduleCategoriesSuppliers,
    address: { ...EMPTY_ADDRESS, ...(customer.address ?? {}) },
  })
  const set = (patch: Partial<CustomerFormValues>) => setValues((current) => ({ ...current, ...patch }))
  const changed = () => invalidate(['customers'], ['customer', customer.id], ['dashboard'], ['contractNew'], ['gencodesNew'], ['discountCouponRedeem'])

  function save() {
    if (form.invalid({ ...validateBusiness(values, rules), ...validateContact(values, rules) })) return
    void form.submit(
      () => bmsApi.updateCustomer(customer.id, { ...values, isActive: customer.isActive }),
      async (response) => {
        notify.success(response.message ?? tc('toasts.saved'))
        await changed()
      },
    )
  }

  async function remove() {
    const yes = await confirm({
      title: tc('delete.title'),
      message: `${t('toasts.deleteConfirm', { name: customer.name })}\n${tc('delete.description')}`,
      confirmLabel: tc('delete.confirm'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!yes) return
    await action.run(() => bmsApi.deleteCustomer(customer.id), {
      success: t('toasts.deleted'),
      onSuccess: async () => {
        await invalidate(['customers'], ['dashboard'])
        go.back()
      },
    })
  }

  return (
    <Screen {...refresh}>
      <Row className="justify-between">
        <Heading className="flex-1">{customer.name}</Heading>
        <StatusBadge active={customer.isActive} />
      </Row>
      {canEdit ? null : <ReadOnlyNote />}
      <FormError message={form.error} />

      <Section title={t('sections.business')}>
        <BusinessFields values={values} set={set} errors={form.errors} disabled={!canEdit} segments={SEGMENTS} entityTypes={ENTITY_TYPES} />
      </Section>
      <Section title={t('sections.contact')}>
        <ContactFields values={values} set={set} errors={form.errors} disabled={!canEdit} />
      </Section>
      {/* Non-admin roles receive no address at all; there is nothing to show or to edit. */}
      {canEdit ? (
        <Section title={t('sections.address')}>
          <AddressFields value={values.address} onChange={(address) => set({ address })} />
        </Section>
      ) : null}
      <Section title={t('sections.modules')}>
        <Card>
          <ModuleFields values={values} set={set} disabled={!canEdit} />
        </Card>
      </Section>

      {canEdit ? <Button label={form.pending ? tc('saving') : tc('save')} onPress={save} loading={form.pending} fullWidth /> : null}

      {view.access ? <AccessCard id={customer.id} owner={view.access.owner} /> : null}

      {canEdit ? (
        <View className="gap-3">
          <Button
            label={customer.isActive ? t('actions.deactivate') : t('actions.reactivate')}
            variant="secondary"
            disabled={action.pending}
            onPress={() =>
              void action.run(() => bmsApi.toggleCustomerActive(customer.id), {
                success: customer.isActive ? t('toasts.deactivated') : t('toasts.reactivated'),
                onSuccess: changed,
              })
            }
            fullWidth
          />
          {canDelete(me.data?.role) ? <Button label={t('actions.delete')} variant="danger-soft" icon="trash-outline" disabled={action.pending} onPress={() => void remove()} fullWidth /> : null}
        </View>
      ) : null}
    </Screen>
  )
}

export default function CustomerDetail() {
  const t = useT('Customers')
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useView('bms', ['customer', id], () => bmsApi.customer(id))
  const refresh = useRefresh(query)
  return (
    <>
      <Stack.Screen options={{ title: t('edit') }} />
      <QueryView query={query}>{(view) => <Editor key={`${view.customer.id}:${view.customer.isActive}`} view={view} refresh={refresh} />}</QueryView>
    </>
  )
}
