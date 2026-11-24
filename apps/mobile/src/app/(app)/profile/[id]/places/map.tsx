import { Stack, useRouter } from 'expo-router'
import { useMemo } from 'react'
import { View } from 'react-native'
import { appApi } from '@/api/app'
import { SignUpPrompt, contentKey, hasCoordinates, useParam } from '@/features/app-content/common'
// Resolves to the react-native-maps view on iOS/Android and to a list on web.
import { PlacesMapView } from '@/features/app-content/PlacesMapView'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { Button, EmptyState, QueryView, Screen } from '@/ui'

/** Full-screen map of a profile's places. */
export default function PlacesMapScreen() {
  const id = useParam('id')
  const t = useT('Places')
  const router = useRouter()
  const query = useView('app', contentKey(id, 'placesMap'), () => appApi.placesMap(id))
  const pins = useMemo(() => (query.data?.pins ?? []).filter((pin) => hasCoordinates(pin.lat, pin.lon)), [query.data])

  return (
    <>
      <Stack.Screen options={{ title: t('mapTitle') }} />
      <QueryView query={query}>
        {(data) =>
          pins.length === 0 ? (
            <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
              <EmptyState
                icon="map-outline"
                title={t('mapEmpty')}
                action={<Button label={t('backToPlaces')} variant="secondary" onPress={() => router.replace(`/profile/${id}/places`)} />}
              />
              {data.gated ? <SignUpPrompt /> : null}
            </Screen>
          ) : (
            <View className="flex-1 bg-background">
              <PlacesMapView
                pins={pins}
                onOpen={(pin) => (data.gated ? router.push(`/profile/${id}/places`) : router.push(`/profile/${id}/places/${pin.id}?view=details`))}
              />
            </View>
          )
        }
      </QueryView>
    </>
  )
}
