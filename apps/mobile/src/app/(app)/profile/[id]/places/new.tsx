import { Stack } from 'expo-router'
import { appApi } from '@/api/app'
import { useRequireAppSession } from '@/features/app/session'
import { EDIT_QUERY, contentKey, useParam } from '@/features/app-content/common'
import { PlaceForm } from '@/features/app-content/PlaceForm'
import { QuotaReached } from '@/features/app-content/QuotaReached'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { LoadingState, QueryView } from '@/ui'

export default function PlaceNewScreen() {
  const user = useRequireAppSession()
  const id = useParam('id')
  const t = useT('Places')
  const query = useView('app', contentKey(id, 'placeNew'), () => appApi.placeNew(id), { ...EDIT_QUERY, enabled: !!user })
  if (!user) return <LoadingState />
  return (
    <>
      <Stack.Screen options={{ title: t('newTitle') }} />
      <QueryView query={query}>
        {(data) =>
          data.allowed ? (
            <PlaceForm profileId={data.profileId} mediaMax={data.mediaMax} otherImagesUsed={data.otherImagesUsed} tier={data.tier} />
          ) : (
            <QuotaReached
              context="geoPlaces"
              limit={data.limit}
              tier={data.tier}
              icon="location-outline"
              backLabel={t('backToPlaces')}
              backPath={`/profile/${data.profileId}/places`}
            />
          )
        }
      </QueryView>
    </>
  )
}
