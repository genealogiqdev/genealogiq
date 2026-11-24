import { FlashList } from '@shopify/flash-list'
import { Image } from 'expo-image'
import { Stack, useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { Pressable, RefreshControl, useWindowDimensions, View } from 'react-native'
import { appApi, type GalleryItem } from '@/api/app'
import { HeaderAction, SignUpPrompt, contentKey, formatDuration, mediaUri, useParam } from '@/features/app-content/common'
import { MediaViewer, type ViewerItem } from '@/features/app-content/MediaViewer'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import { useView } from '@/lib/query'
import { usePalette } from '@/theme'
import { Button, EmptyState, Icon, Muted, QueryView, Row, Segmented, Sheet, Text } from '@/ui'

type Sort = 'newest' | 'oldest'

const GAP = 6
const PADDING = 16
const COLUMNS = 3

const takenTime = (item: GalleryItem) => {
  const time = item.takenAt ? new Date(item.takenAt).getTime() : Number.NaN
  return Number.isNaN(time) ? null : time
}

function sortItems(items: GalleryItem[], sort: Sort): GalleryItem[] {
  const direction = sort === 'newest' ? -1 : 1
  return [...items].sort((a, b) => {
    const ta = takenTime(a)
    const tb = takenTime(b)
    if (ta !== null && tb !== null && ta !== tb) return (ta - tb) * direction
    return (a.order - b.order) * direction
  })
}

/** Gallery: photo/video grid with a full-screen viewer. A visitor sees the preview slice and a sign-up prompt. */
export default function GalleryScreen() {
  const id = useParam('id')
  const t = useT('Gallery')
  const tc = useT('Common')
  const router = useRouter()
  const palette = usePalette('app')
  const { width } = useWindowDimensions()
  const query = useView('app', contentKey(id, 'gallery'), () => appApi.gallery(id))
  const [sort, setSort] = useState<Sort>('newest')
  const [open, setOpen] = useState<number | null>(null)
  const [wall, setWall] = useState(false)
  const edit = () => router.push(`/profile/${id}/gallery/edit`)
  // The sign-up sheet must not stay on top of the sign-in screen it navigates to.
  useFocusEffect(useCallback(() => () => setWall(false), []))

  const items = useMemo(() => sortItems(query.data?.items ?? [], sort), [query.data, sort])
  const viewerItems = useMemo<ViewerItem[]>(
    () =>
      items.map((item) => ({
        key: item.id,
        kind: item.kind,
        url: item.url,
        poster: item.poster,
        caption: item.description,
        detail: [item.takenAt ? formatDate(`${item.takenAt.slice(0, 10)}T12:00:00`, { month: 'long' }) : null, item.location].filter(Boolean).join(' · ') || null,
      })),
    [items],
  )
  const size = Math.floor((width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS)

  return (
    <>
      <Stack.Screen
        options={{
          title: query.data ? t('title', { name: query.data.profile.firstName }) : '',
          headerRight: query.data?.canManage
            ? () => <HeaderAction icon={query.data?.items.length ? 'create-outline' : 'add'} label={query.data?.items.length ? tc('edit') : t('addMedia')} onPress={edit} />
            : undefined,
        }}
      />
      <QueryView query={query}>
        {(data) => (
          <View className="flex-1 bg-background">
            <FlashList
              data={items}
              numColumns={COLUMNS}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: PADDING, paddingBottom: 40 }}
              refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={palette.accent} />}
              ListHeaderComponent={
                <View className="gap-3 pb-3">
                  <Muted>{t('tagline')}</Muted>
                  {data.imageCount + data.videoCount > 0 ? (
                    <Row className="justify-between">
                      <Muted>{[t('imageCount', { count: data.imageCount }), t('videoCount', { count: data.videoCount })].join(' · ')}</Muted>
                    </Row>
                  ) : null}
                  {items.length > 1 ? (
                    <Segmented<Sort>
                      value={sort}
                      onChange={setSort}
                      options={[
                        { value: 'newest', label: t('sortNewest') },
                        { value: 'oldest', label: t('sortOldest') },
                      ]}
                    />
                  ) : null}
                </View>
              }
              ListEmptyComponent={
                <EmptyState
                  icon="images-outline"
                  title={t('empty')}
                  action={data.canManage ? <Button label={t('addMedia')} icon="add" onPress={edit} /> : undefined}
                />
              }
              ListFooterComponent={
                data.gated ? (
                  <View className="pt-4">
                    <SignUpPrompt />
                  </View>
                ) : items.length > 0 ? (
                  <Muted className="pt-4 text-center">{t('endOfGallery')}</Muted>
                ) : null
              }
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => (data.gated ? setWall(true) : setOpen(index))}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={item.description ?? (item.kind === 'video' ? t('videoThumbnailAlt') : t('imageAlt'))}
                  style={{ width: size, height: size, marginBottom: GAP, marginRight: GAP }}
                  className="overflow-hidden rounded-xl bg-default active:opacity-80"
                >
                  {item.kind === 'image' || item.poster ? (
                    <Image
                      source={{ uri: mediaUri(item.kind === 'image' ? item.url : (item.poster as string)) }}
                      style={{ width: size, height: size }}
                      contentFit="cover"
                      transition={150}
                      recyclingKey={item.id}
                    />
                  ) : null}
                  {item.kind === 'video' ? (
                    <View className="absolute inset-0 items-center justify-center">
                      <Icon name="play-circle" size={36} />
                      {item.durationSec ? (
                        <View className="absolute bottom-1 right-1 rounded-md bg-surface px-1.5 py-0.5">
                          <Text className="text-xs">{formatDuration(item.durationSec)}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              )}
            />
            <MediaViewer items={viewerItems} index={open} onClose={() => setOpen(null)} />
            <Sheet visible={wall} onClose={() => setWall(false)}>
              <SignUpPrompt />
            </Sheet>
          </View>
        )}
      </QueryView>
    </>
  )
}
