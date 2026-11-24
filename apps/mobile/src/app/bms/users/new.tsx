import { Stack } from 'expo-router'
import { bmsApi } from '@/api/bms'
import { UserForm } from '@/features/bms/UserForm'
import { useGo } from '@/features/bms/lib'
import { useT } from '@/i18n'
import { useBmsInvalidate } from '@/features/bms/lib'
import { useView } from '@/lib/query'
import { QueryView, Screen, useNotify } from '@/ui'

export default function UserNew() {
  const t = useT('Users')
  const go = useGo()
  const notify = useNotify()
  const invalidate = useBmsInvalidate()
  const query = useView('bms', ['userNew'], () => bmsApi.userNew())
  return (
    <>
      <Stack.Screen options={{ title: t('new') }} />
      <QueryView query={query}>
        {(view) => (
          <Screen>
            <UserForm
              initial={view.defaults}
              roles={view.roles}
              canEdit={view.canSubmit}
              submitLabel={t('create')}
              save={(values) => bmsApi.createUser(values)}
              onSaved={async (message) => {
                if (message) notify.success(message)
                await invalidate(['users'], ['dashboard'])
                go.replace('/bms/users')
              }}
            />
          </Screen>
        )}
      </QueryView>
    </>
  )
}
