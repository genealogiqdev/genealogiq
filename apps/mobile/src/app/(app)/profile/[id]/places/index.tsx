import { Image } from 'expo-image'
import { Stack, useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { appApi } from '@/api/app'
import { LimitReachedSheet } from '@/features/app/LimitReached'
import { HeaderAction, SignUpPrompt, addressLine, contentKey, formatDateRange, hasCoordinates, mediaUri, useParam } from '@/features/app-content/common'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { Badge, Button, Card, EmptyState, Heading, Muted, QueryView, Row, Screen, Sheet } from '@/ui'

/** Life places of a profile. A visitor sees the preview slice; opening a place asks them to sign up. */
export default function PlacesScreen() {
  const id = useParam('id')
  const t = useT('Places')
  const router = useRouter()
  const query = useView('app', contentKey(id, 'places'), () => appApi.places(id))
  const [wall, setWall] = useState(false)
  const [limit, setLimit] = useState(false)
  useFocusEffect(useCallback(() => () => setWall(false), []))

  const quota = query.data?.quota ?? null
  const add = () => (quota?.atLimit ? setLimit(true) : router.push(`/profile/${id}/places/new`))
  const openMap = () => router.push(`/profile/${id}/places/map`)

  return (
    <>
      <Stack.Screen
        options={{
          title: query.data ? t('title', { name: query.data.profile.firstName }) : '',
          headerRight: query.data
            ? () => (
                <Row className="gap-0">
                  <HeaderAction icon="map-outline" label={t('viewMap')} onPress={openMap} />
                  {query.data?.canManage ? <HeaderAction icon="add" label={t('addPlace')} onPress={add} /> : null}
                </Row>
              )
            : undefined,
        }}
      />
      <QueryView query={query}>
        {(data) => (
          <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
            <Muted>{t('tagline')}</Muted>
            {data.items.length > 0 ? (
              <Row className="justify-between">
                <Muted>{t('countMetric', { count: data.items.length })}</Muted>
                {data.quota ? <Muted>{`${data.quota.usage}/${data.quota.geoPlacesMax}`}</Muted> : null}
              </Row>
            ) : null}

            {data.items.length === 0 ? (
              <EmptyState
                icon="location-outline"
                title={t('emptyTitle')}
                action={data.canManage ? <Button label={t('addPlace')} icon="add" onPress={add} /> : undefined}
              />
            ) : (
              data.items.map((place) => {
                const dates = formatDateRange(place.startDate, place.endDate)
                const where = addressLine(place)
                return (
                  <Card
                    key={place.id}
                    onPress={() => (data.gated ? setWall(true) : router.push(`/profile/${id}/places/${place.id}?view=details`))}
                  >
                    {place.photos[0] ? (
                      <Image
                        source={{ uri: mediaUri(place.photos[0]) }}
                        style={{ width: '100%', height: 160, borderRadius: 12 }}
                        contentFit="cover"
                        transition={150}
                        accessibilityLabel={t('photoAlt', { number: 1 })}
                      />
                    ) : null}
                    <Heading>{place.title}</Heading>
                    {dates ? <Muted>{dates}</Muted> : null}
                    {where ? <Muted>{where}</Muted> : null}
                    {place.description ? <Muted numberOfLines={3}>{place.description}</Muted> : null}
                    {place.categories.length > 0 ? (
                      <View className="flex-row flex-wrap gap-1.5">
                        {place.categories.map((category) => (
                          <Badge key={category} label={t(`cat_${category}`)} color="accent" />
                        ))}
                      </View>
                    ) : null}
                  </Card>
                )
              })
            )}

            {data.items.some((place) => hasCoordinates(place.lat, place.lon)) ? (
              <Button label={t('viewMap')} icon="map-outline" variant="secondary" onPress={openMap} fullWidth />
            ) : null}

            {data.gated ? <SignUpPrompt /> : null}

            <Sheet visible={wall} onClose={() => setWall(false)}>
              <SignUpPrompt />
            </Sheet>
            {data.quota ? (
              <LimitReachedSheet visible={limit} onClose={() => setLimit(false)} context="geoPlaces" limit={data.quota.geoPlacesMax} tier={data.quota.tier} />
            ) : null}
          </Screen>
        )}
      </QueryView>
    </>
  )
}
