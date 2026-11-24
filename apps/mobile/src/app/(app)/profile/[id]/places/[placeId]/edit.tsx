import { Stack } from 'expo-router'
import { appApi } from '@/api/app'
import { useRequireAppSession } from '@/features/app/session'
import { EDIT_QUERY, contentKey, useParam } from '@/features/app-content/common'
import { PlaceForm } from '@/features/app-content/PlaceForm'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { LoadingState, QueryView } from '@/ui'

export default function PlaceEditScreen() {
  const user = useRequireAppSession()
  const id = useParam('id')
  const placeId = useParam('placeId')
  const t = useT('Places')
  const query = useView('app', contentKey(id, 'placeEdit', placeId), () => appApi.placeEdit(id, placeId), { ...EDIT_QUERY, enabled: !!user })
  if (!user) return <LoadingState />
  return (
    <>
      <Stack.Screen options={{ title: t('editTitle') }} />
      <QueryView query={query}>
        {(data) => (
          <PlaceForm profileId={data.profileId} existing={data.place} mediaMax={data.mediaMax} otherImagesUsed={data.otherImagesUsed} tier={data.tier} />
        )}
      </QueryView>
    </>
  )
}
