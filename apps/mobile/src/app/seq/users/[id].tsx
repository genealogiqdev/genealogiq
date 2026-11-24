import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { seqApi, type StaffDetail } from '@/api/seq'
import { StaffForm } from '@/features/seq/StaffForm'
import { useMe } from '@/features/seq/forms'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { Card, Divider, ListRow, QueryView, confirm, useAction } from '@/ui'

function StaffActions({ user, isSelf }: { user: StaffDetail; isSelf: boolean }) {
  const t = useT('Users')
  const tc = useT('Common')
  const router = useRouter()
  const invalidate = useInvalidate('seq')
  const { run, pending } = useAction()
  const name = `${user.firstName} ${user.lastName}`.trim()

  async function remove() {
    const accepted = await confirm({
      title: tc('delete.title'),
      message: `${t('toasts.deleteConfirm', { name })}\n\n${tc('delete.description')}`,
      confirmLabel: tc('delete.confirm'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!accepted) return
    await run(() => seqApi.deleteUser(user.id), {
      success: t('toasts.deleted'),
      onSuccess: async () => {
        await invalidate(['users'])
        router.back()
      },
    })
  }

  return (
    <Card>
      {isSelf ? null : (
        <>
          <ListRow
            title={t(user.isActive ? 'actions.deactivate' : 'actions.reactivate')}
            icon={user.isActive ? 'pause-circle-outline' : 'play-circle-outline'}
            chevron={false}
            onPress={
              pending
                ? undefined
                : () =>
                    void run(() => seqApi.toggleUserActive(user.id), {
                      success: t(user.isActive ? 'toasts.deactivated' : 'toasts.reactivated'),
                      onSuccess: async () => {
                        await invalidate(['users'], ['user', user.id])
                      },
                    })
            }
          />
          <Divider />
        </>
      )}
      <ListRow
        title={t('actions.resendEmail')}
        icon="mail-outline"
        chevron={false}
        onPress={pending ? undefined : () => void run(() => seqApi.resendWelcomeEmail(user.id), { success: t('toasts.emailResent') })}
      />
      {isSelf ? null : (
        <>
          <Divider />
          <ListRow title={t('actions.delete')} icon="trash-outline" destructive chevron={false} onPress={pending ? undefined : () => void remove()} />
        </>
      )}
    </Card>
  )
}

export default function SeqUserEdit() {
  const t = useT('Users')
  const { id } = useLocalSearchParams<{ id: string }>()
  const me = useMe()
  const query = useView('seq', ['user', id], () => seqApi.user(id))
  const isAdmin = me.data?.isAdmin === true
  return (
    <>
      <Stack.Screen options={{ title: t('edit') }} />
      <QueryView query={query}>
        {({ user }) => (
          // Keyed on the saved state so a toggle made below is reflected in the form.
          <StaffForm key={`${user.id}:${user.isActive}:${isAdmin}`} user={user} canEdit={isAdmin}>
            {isAdmin ? <StaffActions user={user} isSelf={me.data?.user.id === user.id} /> : null}
          </StaffForm>
        )}
      </QueryView>
    </>
  )
}
