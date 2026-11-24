import { Stack } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { appApi, appHttp, type GalleryEditView } from '@/api/app'
import { LimitReachedSheet } from '@/features/app/LimitReached'
import { useRequireAppSession } from '@/features/app/session'
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from '@/features/app-content/categories'
import { Counter, EDIT_QUERY, FormError, contentKey, formatDuration, mediaUri, useContentInvalidate, useLeave, useParam, useSubmit } from '@/features/app-content/common'
import { UploadThumb, storedItem, usePickers, useUploadList, type UploadItem } from '@/features/app-content/uploads'
import { probeVideoDuration } from '@/features/app-content/video'
import { useT } from '@/i18n'
import { formatDate } from '@/lib/format'
import type { LocalFile } from '@/lib/upload'
import { useView } from '@/lib/query'
import { Button, Card, DateField, EmptyState, Field, IconButton, LoadingState, Muted, QueryView, Row, Screen, Sheet, Text, confirm, useNotify } from '@/ui'

const MAX_LOCATION = 100
const MAX_DESCRIPTION = 280

interface Meta {
  id?: string
  kind: 'image' | 'video'
  poster: string | null
  durationSec: number | null
  takenAt: string
  location: string
  description: string
}

type Entry = UploadItem<Meta>

function GalleryForm({ data }: { data: GalleryEditView }) {
  const t = useT('Gallery')
  const tc = useT('Common')
  const tm = useT('Mobile.appContent')
  const tmc = useT('Mobile.common')
  const notify = useNotify()
  const leave = useLeave()
  const { pick, capture } = usePickers()
  const refresh = useContentInvalidate(data.profileId)
  const { submit, pending, formError } = useSubmit()
  const remove = useSubmit()
  const [limit, setLimit] = useState<'media-images' | 'media-videos' | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const list = useUploadList<Meta>(appHttp.galleryUpload(), data.profileId, () =>
    [...data.items]
      .sort((a, b) => a.order - b.order)
      .map((item) =>
        storedItem(item.id, item.url, {
          id: item.id,
          kind: item.kind,
          poster: item.poster,
          durationSec: item.durationSec,
          takenAt: item.takenAt?.slice(0, 10) ?? '',
          location: item.location ?? '',
          description: item.description ?? '',
        }),
      ),
  )

  // Images share one pool with the biography and places; videos are gallery-only.
  const maxImages = Math.max(0, data.maxImages - data.otherImagesUsed)
  const imageCount = list.items.filter((item) => item.kind === 'image').length
  const videoCount = list.items.filter((item) => item.kind === 'video').length
  const galleryPath = `/profile/${data.profileId}/gallery`
  const current = editing ? (list.items.find((item) => item.key === editing) ?? null) : null

  async function accept(files: LocalFile[]) {
    let images = imageCount
    let videos = videoCount
    let hitLimit: typeof limit = null
    for (const file of files) {
      const blank = { poster: null, takenAt: '', location: '', description: '' }
      if (file.kind === 'video') {
        if (videos >= data.maxVideos) {
          hitLimit = hitLimit ?? 'media-videos'
          continue
        }
        if (file.size > MAX_VIDEO_BYTES) {
          notify.error(tm('fileTooLarge', { max: 100 }))
          continue
        }
        const duration = await probeVideoDuration(file.uri)
        if (duration !== null && duration > MAX_VIDEO_SECONDS) {
          notify.error(t('videoTooLong', { name: file.name }))
          continue
        }
        videos += 1
        list.add(file, { ...blank, kind: 'video', durationSec: duration })
      } else if (file.kind === 'image') {
        if (images >= maxImages) {
          hitLimit = hitLimit ?? 'media-images'
          continue
        }
        if (file.size > MAX_IMAGE_BYTES) {
          notify.error(tm('fileTooLarge', { max: 10 }))
          continue
        }
        images += 1
        list.add(file, { ...blank, kind: 'image', durationSec: null })
      }
    }
    if (hitLimit) setLimit(hitLimit)
  }

  async function addFromLibrary() {
    if (imageCount >= maxImages && videoCount >= data.maxVideos) return setLimit('media-images')
    setAdding(true)
    try {
      await accept(await pick({ multiple: true, allowVideo: true }))
    } finally {
      setAdding(false)
    }
  }

  async function addFromCamera() {
    if (imageCount >= maxImages) return setLimit('media-images')
    const file = await capture()
    if (file) await accept([file])
  }

  async function save() {
    if (list.uploading) return notify.info(t('waitForUploads'))
    if (list.failed) return notify.error(tm('resolveFailedUploads'))
    await submit(
      () =>
        appApi.saveGallery(data.profileId, {
          items: list.items.map((item, order) => ({
            id: item.id,
            kind: item.kind,
            url: item.url,
            poster: item.poster ?? undefined,
            durationSec: item.durationSec && item.durationSec > 0 ? item.durationSec : undefined,
            takenAt: item.takenAt || undefined,
            location: item.location.trim() || undefined,
            description: item.description.trim() || undefined,
            order,
          })),
        }),
      {
        success: t('savedToast'),
        onSuccess: async () => {
          await refresh()
          leave.back(galleryPath)
        },
      },
    )
  }

  async function destroy() {
    const yes = await confirm({
      title: t('deleteGalleryTitle'),
      message: t('deleteGalleryDescription'),
      confirmLabel: tc('delete'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!yes) return
    await remove.submit(() => appApi.deleteGallery(data.profileId), {
      success: t('deletedToast'),
      onSuccess: async () => {
        await refresh()
        leave.back(galleryPath)
      },
    })
  }

  const statusText = (item: Entry) => {
    if (item.status === 'uploading') return tm('uploading')
    if (item.status === 'failed') return tm('uploadFailed')
    const parts = [
      item.kind === 'video' && item.durationSec ? formatDuration(item.durationSec) : null,
      item.takenAt ? formatDate(`${item.takenAt}T12:00:00`) : null,
      item.location || null,
    ].filter(Boolean)
    return parts.join(' · ')
  }

  return (
    <Screen footer={<Button label={tc('save')} icon="save-outline" onPress={() => void save()} loading={pending} disabled={remove.pending} fullWidth size="lg" />}>
      <Muted>{t('editSubtitle')}</Muted>

      <Card>
        <View className="flex-row items-center justify-between">
          <Text>{t('photos')}</Text>
          <Counter used={imageCount} max={maxImages} />
        </View>
        <View className="flex-row items-center justify-between">
          <Text>{t('videos')}</Text>
          <Counter used={videoCount} max={data.maxVideos} />
        </View>
        <Muted>{tm('videoHint')}</Muted>
      </Card>

      <Row>
        <View className="flex-1">
          <Button label={t('addMedia')} icon="images-outline" variant="secondary" onPress={() => void addFromLibrary()} loading={adding} fullWidth />
        </View>
        <View className="flex-1">
          <Button label={tm('takePhoto')} icon="camera-outline" variant="secondary" onPress={() => void addFromCamera()} fullWidth />
        </View>
      </Row>

      {list.items.length === 0 ? <EmptyState icon="images-outline" title={t('empty')} /> : null}

      {list.items.map((item, index) => (
        <Card key={item.key}>
          <Row className="items-start">
            <UploadThumb
              item={item.kind === 'video' && item.poster ? { ...item, uri: mediaUri(item.poster) } : item}
              size={84}
              video={item.kind === 'video' && !item.poster}
              label={item.kind === 'video' ? t('videoThumbnailAlt') : t('previewAlt')}
              removeLabel={tc('remove')}
              onRemove={() => list.remove(item.key)}
              onRetry={() => list.retry(item.key)}
            />
            <View className="flex-1 gap-1">
              <Text numberOfLines={2}>{item.description || (item.kind === 'video' ? t('videos') : t('photos'))}</Text>
              {statusText(item) ? <Muted className={item.status === 'failed' ? 'text-danger' : undefined}>{statusText(item)}</Muted> : null}
              <Row className="gap-1">
                <IconButton icon="arrow-up" label={tm('moveUp')} onPress={index > 0 ? () => list.move(item.key, -1) : undefined} size={20} />
                <IconButton icon="arrow-down" label={tm('moveDown')} onPress={index < list.items.length - 1 ? () => list.move(item.key, 1) : undefined} size={20} />
                {item.status === 'failed' ? <IconButton icon="refresh" label={tm('retryUpload')} onPress={() => list.retry(item.key)} size={20} /> : null}
                {item.status === 'done' ? <IconButton icon="create-outline" label={tm('editDetails')} onPress={() => setEditing(item.key)} size={20} /> : null}
              </Row>
            </View>
          </Row>
        </Card>
      ))}

      <FormError message={formError ?? remove.formError} />

      {data.items.length > 0 ? (
        <Button label={t('deleteGallery')} icon="trash-outline" variant="danger-soft" onPress={() => void destroy()} loading={remove.pending} disabled={pending} fullWidth />
      ) : null}

      <Sheet visible={current !== null} onClose={() => setEditing(null)} title={tm('editDetails')}>
        {current ? (
          <View className="gap-3">
            <DateField label={t('dateTaken')} value={current.takenAt} onChange={(takenAt) => list.patch(current.key, { takenAt })} maximumDate={new Date()} />
            <Field
              label={t('location')}
              value={current.location}
              onChangeText={(location) => list.patch(current.key, { location })}
              placeholder={t('locationPlaceholder')}
              maxLength={MAX_LOCATION}
            />
            <Field
              label={t('description')}
              value={current.description}
              onChangeText={(description) => list.patch(current.key, { description })}
              placeholder={t('descriptionPlaceholder')}
              maxLength={MAX_DESCRIPTION}
              multiline
              hint={`${current.description.length}/${MAX_DESCRIPTION}`}
            />
            <Button label={tmc('done')} onPress={() => setEditing(null)} fullWidth />
          </View>
        ) : null}
      </Sheet>

      <LimitReachedSheet
        visible={limit !== null}
        onClose={() => setLimit(null)}
        context={limit ?? 'media-images'}
        limit={limit === 'media-videos' ? data.maxVideos : data.maxImages}
        tier={data.tier}
      />
    </Screen>
  )
}

export default function GalleryEditScreen() {
  const user = useRequireAppSession()
  const id = useParam('id')
  const t = useT('Gallery')
  const query = useView('app', contentKey(id, 'galleryEdit'), () => appApi.galleryEdit(id), { ...EDIT_QUERY, enabled: !!user })
  if (!user) return <LoadingState />
  return (
    <>
      <Stack.Screen options={{ title: t('editTitle') }} />
      <QueryView query={query}>{(data) => <GalleryForm data={data} />}</QueryView>
    </>
  )
}
