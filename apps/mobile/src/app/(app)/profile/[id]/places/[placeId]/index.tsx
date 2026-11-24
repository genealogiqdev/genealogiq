import { Redirect, Stack, useRouter } from 'expo-router'
import { View } from 'react-native'
import { appApi, type PlaceView } from '@/api/app'
import { absoluteUrl } from '@/api/client'
import { useAppUser } from '@/features/app/session'
import {
  HeaderAction,
  SignUpPrompt,
  addressLine,
  contentKey,
  formatCoordinates,
  hasCoordinates,
  mapsUrl,
  useContentInvalidate,
  useParam,
} from '@/features/app-content/common'
import { PhotoGrid } from '@/features/app-content/MediaViewer'
import { QrExport } from '@/features/shared/QrExport'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useView } from '@/lib/query'
import { openExternal } from '@/lib/share'
import { Badge, Button, Card, Heading, Icon, LinkText, Muted, QueryView, Row, Screen, Text, useAction, useNotify } from '@/ui'

type Detail = Extract<PlaceView, { state: 'detail' }>

function PlaceDetail({ data, placeId, refreshing, onRefresh }: { data: Detail; placeId: string; refreshing: boolean; onRefresh: () => void }) {
  const t = useT('Places')
  const router = useRouter()
  const notify = useNotify()
  const signedIn = !!useAppUser()
  const refresh = useContentInvalidate(data.profileId)
  const generate = useAction()
  const { place } = data
  const located = hasCoordinates(place.lat, place.lon)
  const where = addressLine(place)

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Muted>{t('detailTitle')}</Muted>

      {place.categories.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {place.categories.map((category) => (
            <Badge key={category} label={t(`cat_${category}`)} color="accent" />
          ))}
        </View>
      ) : null}

      {place.startDate || place.endDate ? (
        <Row className="items-start">
          <Icon name="calendar-outline" size={18} />
          <View className="flex-1">
            <Muted>{t('datesLabel')}</Muted>
            {place.startDate ? <Text>{formatDate(place.startDate, { utc: true, month: 'long' })}</Text> : null}
            {place.endDate ? <Text>{formatDate(place.endDate, { utc: true, month: 'long' })}</Text> : null}
          </View>
        </Row>
      ) : null}

      {located || where ? (
        <Card>
          <Row className="items-start">
            <Icon name="location-outline" size={18} />
            <View className="flex-1 gap-1">
              {where ? (
                <>
                  <Muted>{t('address')}</Muted>
                  <Text selectable>{where}</Text>
                </>
              ) : null}
              {located ? (
                <>
                  <Muted>{t('coordinates')}</Muted>
                  <Text selectable>{formatCoordinates(place.lat, place.lon)}</Text>
                </>
              ) : null}
            </View>
          </Row>
          {located ? (
            <>
              <Button
                label={t('openInGoogleMaps')}
                icon="navigate-outline"
                variant="secondary"
                onPress={() => void openExternal(mapsUrl(place.lat, place.lon)).catch((error) => notify.error(error))}
                fullWidth
              />
              <LinkText label={t('viewMap')} onPress={() => router.push(`/profile/${data.profileId}/places/map`)} className="py-2 text-center" />
            </>
          ) : null}
        </Card>
      ) : null}

      {place.description ? (
        <Text className="leading-6" selectable>
          {place.description}
        </Text>
      ) : null}

      <View className="gap-2">
        <Heading>{t('photos')}</Heading>
        {place.photos.length > 0 ? <PhotoGrid photos={place.photos} label={(number) => t('photoAlt', { number })} /> : <Muted>{t('noPhotos')}</Muted>}
      </View>

      {place.qrGenerated ? (
        <Card>
          <Heading>{t('qrTitle')}</Heading>
          <Muted>{t('qrDescription')}</Muted>
          {/* Exporting the code is a Premium feature; everyone else gets the preview. */}
          <QrExport value={absoluteUrl('app', data.qrPath)} fileName={`genealogiq-place-${place.id}`} previewOnly={!data.canDownloadQr} />
        </Card>
      ) : signedIn ? (
        <Button
          label={t('qrButton')}
          icon="qr-code-outline"
          variant="secondary"
          loading={generate.pending}
          onPress={() => void generate.run(() => appApi.markPlaceQrGenerated(data.profileId, placeId), { onSuccess: () => void refresh() })}
          fullWidth
        />
      ) : null}

      {data.gated ? <SignUpPrompt /> : null}
    </Screen>
  )
}

/**
 * One place. In-app links carry `?view=details`; a scanned plaque link does
 * not, and the server may then answer that the memorial itself (`profile`) or
 * the places list (`places`) is the destination.
 */
export default function PlaceScreen() {
  const id = useParam('id')
  const placeId = useParam('placeId')
  const details = useParam('view') === 'details'
  const tc = useT('Common')
  const router = useRouter()
  const query = useView('app', contentKey(id, 'place', placeId, details ? 'details' : 'scan'), () => appApi.place(id, placeId, details))
  const data = query.data

  if (data?.state === 'profile') return <Redirect href={`/profile/${data.profileId}`} />
  if (data?.state === 'places') return <Redirect href={`/profile/${data.profileId}/places`} />

  return (
    <>
      <Stack.Screen
        options={{
          title: data?.state === 'detail' ? data.place.title : '',
          headerRight:
            data?.state === 'detail' && data.canManage
              ? () => <HeaderAction icon="create-outline" label={tc('edit')} onPress={() => router.push(`/profile/${id}/places/${placeId}/edit`)} />
              : undefined,
        }}
      />
      <QueryView query={query}>
        {(view) =>
          view.state === 'detail' ? <PlaceDetail data={view} placeId={placeId} refreshing={query.isRefetching} onRefresh={() => void query.refetch()} /> : null
        }
      </QueryView>
    </>
  )
}
