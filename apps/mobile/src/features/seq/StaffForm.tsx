import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { seqApi, type AssignableRole, type StaffDetail, type StaffInput } from '@/api/seq'
import { useT } from '@/i18n'
import { useInvalidate } from '@/lib/query'
import { Button, Screen, Section } from '@/ui'
import { FormFields, useAddressSpecs, useForm, type Spec } from './forms'
import { addressInput, addressValues, dateOnly, digitsOnly, maskCpf, nullable, text } from './util'

const ASSIGNABLE_ROLES: readonly AssignableRole[] = ['OWNER', 'ADMIN', 'COMERCIAL', 'FINANCE', 'USER']

interface StaffFormProps {
  user?: StaffDetail
  /** Staff are managed by administrators; everyone else gets a read-only form. */
  canEdit: boolean
  children?: ReactNode
}

/** Create/edit form of a staff member (web: UserForm). */
export function StaffForm({ user, canEdit, children }: StaffFormProps) {
  const t = useT('Users')
  const tc = useT('Common')
  const te = useT('Errors')
  const router = useRouter()
  const invalidate = useInvalidate('seq')
  const address = useAddressSpecs()
  const form = useForm({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    role: user ? (ASSIGNABLE_ROLES.includes(user.role as AssignableRole) ? user.role : '') : 'USER',
    nationalId: user?.nationalId ? maskCpf(user.nationalId) : '',
    birthDate: dateOnly(user?.birthDate),
    phoneCountryCode: user?.phoneCountryCode ?? '55',
    phone: user?.phone ?? '',
    isActive: user?.isActive ?? true,
    ...addressValues(user?.address),
  })
  const main: Spec[] = [
    { key: 'isActive', label: t('fields.isActive'), kind: 'switch' },
    { key: 'firstName', label: t('fields.firstName'), required: true, min: 2 },
    { key: 'lastName', label: t('fields.lastName'), required: true, min: 2 },
    { key: 'email', label: t('fields.email'), kind: 'email', required: true },
    {
      key: 'role',
      label: t('fields.role'),
      kind: 'select',
      required: true,
      requiredMessage: te('invalidRole'),
      placeholder: t('placeholders.role'),
      options: ASSIGNABLE_ROLES.map((role) => ({ value: role, label: t(`roles.${role}`) })),
    },
    { key: 'nationalId', label: t('fields.cpf'), kind: 'number', mask: maskCpf, placeholder: '000.000.000-00', max: 14 },
    { key: 'birthDate', label: t('fields.birthDate'), kind: 'date' },
    { key: 'phoneCountryCode', label: t('fields.countryCode'), kind: 'number', required: true, requiredMessage: te('countryCodeRequired'), max: 4 },
    { key: 'phone', label: t('fields.phone'), kind: 'phone' },
  ]

  async function save() {
    if (!form.validate([...main, ...address])) return
    const values = form.values
    const input: StaffInput = {
      firstName: text(values, 'firstName'),
      lastName: text(values, 'lastName'),
      email: text(values, 'email'),
      role: text(values, 'role') as AssignableRole,
      nationalId: digitsOnly(text(values, 'nationalId')) || null,
      birthDate: nullable(values, 'birthDate'),
      phoneCountryCode: text(values, 'phoneCountryCode'),
      phone: nullable(values, 'phone'),
      isActive: values.isActive === true,
      address: addressInput(values),
    }
    await form.submit(() => (user ? seqApi.updateUser(user.id, input) : seqApi.createUser(input)), {
      success: true,
      onSuccess: async () => {
        await invalidate(['users'], ...(user ? [['user', user.id]] : []))
        router.back()
      },
    })
  }

  return (
    <Screen
      footer={
        canEdit ? (
          <Button label={form.pending ? tc(user ? 'saving' : 'creating') : user ? tc('save') : t('create')} onPress={() => void save()} loading={form.pending} fullWidth />
        ) : undefined
      }
    >
      <FormFields specs={main} form={form} disabled={!canEdit} />
      <Section title={t('sections.address')}>
        <FormFields specs={address} form={form} disabled={!canEdit} />
      </Section>
      {children}
    </Screen>
  )
}
