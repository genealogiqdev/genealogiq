import { Stack, useRouter } from 'expo-router'
import { View } from 'react-native'
import { appApi } from '@/api/app'
import { HeaderAction, addressLine, contentKey, formatCoordinates, hasCoordinates, mapsUrl, useParam } from '@/features/app-content/common'
import { PhotoGrid } from '@/features/app-content/MediaViewer'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { openExternal } from '@/lib/share'
import { Button, Card, EmptyState, Heading, Icon, Muted, QueryView, Row, Screen, Text, Title, useNotify } from '@/ui'

/** Resting place: where it is, how to find it and up to three photos. Public. */
export default function GeolocationScreen() {
  const id = useParam('id')
  const t = useT('Geolocation')
  const tc = useT('Common')
  const tm = useT('Mobile.appContent')
  const router = useRouter()
  const notify = useNotify()
  const query = useView('app', contentKey(id, 'geolocation'), () => appApi.geolocation(id))
  const edit = () => router.push(`/profile/${id}/geolocation/edit`)

  return (
    <>
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight: query.data?.canManage
            ? () => (
                <HeaderAction
                  icon={query.data?.geolocation ? 'create-outline' : 'add'}
                  label={query.data?.geolocation ? tc('edit') : t('addLocation')}
                  onPress={edit}
                />
              )
            : undefined,
        }}
      />
      <QueryView query={query}>
        {(data) => {
          const geo = data.geolocation
          if (!geo) {
            return (
              <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
                <Muted>{t('tagline')}</Muted>
                <EmptyState
                  icon="location-outline"
                  title={t('emptyState')}
                  action={data.canManage ? <Button label={t('addLocation')} icon="add" onPress={edit} /> : undefined}
                />
              </Screen>
            )
          }
          const located = hasCoordinates(geo.lat, geo.lon)
          const where = [geo.address, addressLine(geo)].filter(Boolean).join('\n')
          return (
            <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
              <Muted>{t('tagline')}</Muted>
              <Title>{geo.placeName}</Title>

              <Card>
                {where ? (
                  <Row className="items-start">
                    <Icon name="location-outline" size={18} />
                    <View className="flex-1">
                      <Muted>{t('address')}</Muted>
                      <Text selectable>{where}</Text>
                    </View>
                  </Row>
                ) : null}
                {geo.section ? (
                  <Row className="items-start">
                    <Icon name="trail-sign-outline" size={18} />
                    <View className="flex-1">
                      <Muted>{t('section')}</Muted>
                      <Text selectable>{geo.section}</Text>
                    </View>
                  </Row>
                ) : null}
                {located ? (
                  <Row className="items-start">
                    <Icon name="compass-outline" size={18} />
                    <View className="flex-1">
                      <Muted>{t('coordinates')}</Muted>
                      <Text selectable>{formatCoordinates(geo.lat, geo.lon)}</Text>
                    </View>
                  </Row>
                ) : null}
                {located ? (
                  <Button
                    label={tm('openInMaps')}
                    icon="navigate-outline"
                    onPress={() => void openExternal(mapsUrl(geo.lat, geo.lon)).catch((error) => notify.error(error))}
                    fullWidth
                  />
                ) : null}
              </Card>

              {geo.notes ? (
                <View className="gap-1">
                  <Heading>{t('notes')}</Heading>
                  <Text className="leading-6" selectable>
                    {geo.notes}
                  </Text>
                </View>
              ) : null}

              {geo.photos.length > 0 ? (
                <View className="gap-2">
                  <Heading>{t('photos')}</Heading>
                  <PhotoGrid photos={geo.photos} label={(number) => t('viewPhotoAlt', { place: geo.placeName, number })} />
                </View>
              ) : null}
            </Screen>
          )
        }}
      </QueryView>
    </>
  )
}
