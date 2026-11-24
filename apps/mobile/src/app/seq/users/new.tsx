import { Stack } from 'expo-router'
import { ApiError } from '@/api/client'
import { StaffForm } from '@/features/seq/StaffForm'
import { useMe } from '@/features/seq/forms'
import { useT } from '@/i18n'
import { ErrorState, QueryView } from '@/ui'

export default function SeqUserNew() {
  const t = useT('Users')
  const me = useMe()
  return (
    <>
      <Stack.Screen options={{ title: t('new') }} />
      <QueryView query={me}>{(view) => (view.isAdmin ? <StaffForm canEdit /> : <ErrorState error={new ApiError(403, 'forbidden')} />)}</QueryView>
    </>
  )
}
