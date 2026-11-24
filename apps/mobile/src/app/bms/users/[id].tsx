import { Stack, useLocalSearchParams } from 'expo-router'
import { bmsApi, type AssignableRole, type UserDetail, type UserFormValues } from '@/api/bms'
import { ASSIGNABLE_ROLES, UserForm } from '@/features/bms/UserForm'
import { EMPTY_ADDRESS, StatusBadge } from '@/features/bms/fields'
import { canDelete, useGo, useMe, useRefresh } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { Button, Heading, QueryView, Row, Screen, confirm, useAction, useNotify } from '@/ui'

function toForm(user: UserDetail): UserFormValues {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: (user.role === 'SUPER_ADMIN' ? 'OWNER' : user.role) as AssignableRole,
    gender: '',
    // Redacted values are displayed as received; a read-only role never submits them.
    nationalId: user.nationalId ?? '',
    birthDate: user.birthDate ? user.birthDate.slice(0, 10) : '',
    phoneCountryCode: user.phoneCountryCode,
    phone: user.phone ?? '',
    isActive: user.isActive,
    address: { ...EMPTY_ADDRESS, ...(user.address ?? {}) },
  }
}

export default function UserDetailScreen() {
  const t = useT('Users')
  const tc = useT('Common')
  const { id } = useLocalSearchParams<{ id: string }>()
  const go = useGo()
  const me = useMe()
  const notify = useNotify()
  const action = useAction()
  const invalidate = useBmsInvalidate()
  const query = useView('bms', ['user', id], () => bmsApi.user(id))
  const refresh = useRefresh(query)
  const changed = () => invalidate(['users'], ['user', id], ['dashboard'])

  async function remove(name: string) {
    const yes = await confirm({
      title: tc('delete.title'),
      message: `${t('toasts.deleteConfirm', { name })}\n${tc('delete.description')}`,
      confirmLabel: tc('delete.confirm'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!yes) return
    await action.run(() => bmsApi.deleteUser(id), {
      success: t('toasts.deleted'),
      onSuccess: async () => {
        await invalidate(['users'], ['dashboard'])
        go.back()
      },
    })
  }

  return (
    <>
      <Stack.Screen options={{ title: t('edit') }} />
      <QueryView query={query}>
        {({ user, canEdit }) => {
          const name = `${user.firstName} ${user.lastName}`.trim()
          const self = me.data?.user.id === user.id
          return (
            <Screen {...refresh}>
              <Row className="justify-between">
                <Heading className="flex-1">{name}</Heading>
                <StatusBadge active={user.isActive} />
              </Row>
              <UserForm
                key={`${user.id}:${user.isActive}:${user.role}`}
                initial={toForm(user)}
                roles={ASSIGNABLE_ROLES}
                currentRole={user.role}
                canEdit={canEdit}
                submitLabel={t('saveChanges')}
                save={(values) => bmsApi.updateUser(user.id, values)}
                onSaved={async (message) => {
                  if (message) notify.success(message)
                  await changed()
                }}
              />
              {canEdit ? (
                <>
                  <Button
                    label={t('actions.resendEmail')}
                    variant="secondary"
                    icon="mail-outline"
                    disabled={action.pending}
                    onPress={() => void action.run(() => bmsApi.resendWelcomeEmail(user.id), { success: t('toasts.emailResent') })}
                    fullWidth
                  />
                  {self ? null : (
                    <Button
                      label={user.isActive ? t('actions.deactivate') : t('actions.reactivate')}
                      variant="secondary"
                      disabled={action.pending}
                      onPress={() =>
                        void action.run(() => bmsApi.toggleUserActive(user.id), {
                          success: user.isActive ? t('toasts.deactivated') : t('toasts.reactivated'),
                          onSuccess: changed,
                        })
                      }
                      fullWidth
                    />
                  )}
                  {!self && canDelete(me.data?.role) ? (
                    <Button label={t('actions.delete')} variant="danger-soft" icon="trash-outline" disabled={action.pending} onPress={() => void remove(name)} fullWidth />
                  ) : null}
                </>
              ) : null}
            </Screen>
          )
        }}
      </QueryView>
    </>
  )
}
