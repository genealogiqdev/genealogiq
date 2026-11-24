import { Image } from 'expo-image'
import { Spinner } from 'heroui-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useT } from '@/i18n'
import { PermissionDeniedError, pickMedia, takePhoto, uploadFile, type LocalFile } from '@/lib/upload'
import { Button, Heading, Icon, IconButton, Muted, Row, useNotify } from '@/ui'
import { MAX_IMAGE_BYTES } from './categories'
import { Counter, mediaUri } from './common'

export type UploadStatus = 'done' | 'uploading' | 'failed'

export type UploadItem<M extends object = object> = {
  key: string
  /** What to show: the local file while it uploads, the stored URL for saved media. */
  uri: string
  /** The stored media URL to hand to the save action; null until the upload completes. */
  url: string | null
  status: UploadStatus
  file: LocalFile | null
} & M

let sequence = 0
const nextKey = () => `local-${Date.now()}-${(sequence += 1)}`

export function storedItem<M extends object>(key: string, url: string, meta: M): UploadItem<M> {
  return { key, uri: mediaUri(url), url, status: 'done', file: null, ...meta }
}

/**
 * A list of media where every new file uploads on its own through one upload
 * route (`clientPayload: { profileId }`), with uploading / failed / retry
 * states per item. The save action receives `url` of the items that are done.
 */
export function useUploadList<M extends object = object>(route: string, profileId: string, initial: () => UploadItem<M>[]) {
  const [items, setItems] = useState<UploadItem<M>[]>(initial)
  const latest = useRef(items)
  latest.current = items
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const patch = useCallback((key: string, change: Partial<UploadItem<M>>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)))
  }, [])

  const start = useCallback(
    (key: string, file: LocalFile) => {
      uploadFile('app', route, file, { profileId }).then(
        (url) => {
          if (alive.current) patch(key, { url, status: 'done' } as Partial<UploadItem<M>>)
        },
        () => {
          if (alive.current) patch(key, { status: 'failed' } as Partial<UploadItem<M>>)
        },
      )
    },
    [route, profileId, patch],
  )

  const add = useCallback(
    (file: LocalFile, meta: M) => {
      const key = nextKey()
      setItems((current) => [...current, { key, uri: file.uri, url: null, status: 'uploading', file, ...meta }])
      start(key, file)
    },
    [start],
  )

  const retry = useCallback(
    (key: string) => {
      const item = latest.current.find((entry) => entry.key === key)
      if (!item?.file) return
      patch(key, { status: 'uploading' } as Partial<UploadItem<M>>)
      start(key, item.file)
    },
    [patch, start],
  )

  const remove = useCallback((key: string) => setItems((current) => current.filter((item) => item.key !== key)), [])

  const move = useCallback((key: string, delta: -1 | 1) => {
    setItems((current) => {
      const from = current.findIndex((item) => item.key === key)
      const to = from + delta
      if (from < 0 || to < 0 || to >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  return {
    items,
    add,
    retry,
    remove,
    move,
    patch,
    uploading: items.some((item) => item.status === 'uploading'),
    failed: items.some((item) => item.status === 'failed'),
  }
}

/** Library / camera pickers that turn a refused permission into a localised toast. */
export function usePickers() {
  const t = useT('Mobile.common')
  const notify = useNotify()
  async function guarded<T>(work: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await work()
    } catch (error) {
      if (error instanceof PermissionDeniedError) notify.error(t('permissionDenied'))
      else notify.error(error)
      return fallback
    }
  }
  return {
    pick: (options: { multiple?: boolean; allowVideo?: boolean; limit?: number }) => guarded(() => pickMedia(options), [] as LocalFile[]),
    capture: () => guarded(() => takePhoto(), null as LocalFile | null),
  }
}

/** Overlay + controls shared by every editable thumbnail. */
export function UploadThumb({
  item,
  size,
  label,
  removeLabel,
  onRemove,
  onRetry,
  video,
}: {
  item: UploadItem
  size: number
  label: string
  removeLabel: string
  onRemove: () => void
  onRetry: () => void
  video?: boolean
}) {
  const t = useT('Mobile.appContent')
  return (
    <View style={{ width: size, height: size }} className="overflow-hidden rounded-xl border border-border bg-default">
      {video ? (
        <View className="flex-1 items-center justify-center">
          <Icon name="videocam-outline" size={28} />
        </View>
      ) : (
        <Image source={{ uri: item.uri }} style={{ width: size, height: size }} contentFit="cover" accessibilityLabel={label} />
      )}
      {item.status === 'uploading' ? (
        <View className="absolute inset-0 items-center justify-center bg-backdrop" accessibilityLabel={t('uploading')}>
          <Spinner size="sm" />
        </View>
      ) : null}
      {item.status === 'failed' ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={t('retryUpload')}
          className="absolute inset-0 items-center justify-center gap-1 bg-backdrop"
        >
          <Icon name="refresh" size={22} />
          <Muted className="text-xs text-danger">{t('uploadFailed')}</Muted>
        </Pressable>
      ) : null}
      {item.status !== 'uploading' ? (
        <View className="absolute right-0 top-0 rounded-bl-xl bg-surface">
          <IconButton icon="close" label={removeLabel} onPress={onRemove} size={18} />
        </View>
      ) : null}
    </View>
  )
}

interface PhotoEditorProps {
  items: UploadItem[]
  onAdd: (file: LocalFile) => void
  onRemove: (key: string) => void
  onRetry: (key: string) => void
  /** How many photos this list may hold. */
  max: number
  title: string
  addLabel: string
  removeLabel: string
  photoLabel: (number: number) => string
  /** Called instead of opening the picker when the list is full (plan quota). */
  onLimit?: () => void
}

/** Editable photo grid used by the biography, place and resting-place forms. */
export function PhotoEditor({ items, onAdd, onRemove, onRetry, max, title, addLabel, removeLabel, photoLabel, onLimit }: PhotoEditorProps) {
  const t = useT('Mobile.appContent')
  const notify = useNotify()
  const { pick, capture } = usePickers()
  const remaining = max - items.length

  function accept(files: LocalFile[]) {
    const allowed = files.filter((file) => file.size <= MAX_IMAGE_BYTES)
    if (allowed.length < files.length) notify.error(t('fileTooLarge', { max: 10 }))
    for (const file of allowed.slice(0, Math.max(0, remaining))) onAdd(file)
  }

  async function fromLibrary() {
    if (remaining <= 0) return onLimit?.()
    accept(await pick({ multiple: remaining > 1, limit: remaining }))
  }

  async function fromCamera() {
    if (remaining <= 0) return onLimit?.()
    const file = await capture()
    if (file) accept([file])
  }

  const full = remaining <= 0

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Heading>{title}</Heading>
        <Counter used={items.length} max={max} />
      </View>
      {items.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {items.map((item, index) => (
            <UploadThumb
              key={item.key}
              item={item}
              size={104}
              label={photoLabel(index + 1)}
              removeLabel={removeLabel}
              onRemove={() => onRemove(item.key)}
              onRetry={() => onRetry(item.key)}
            />
          ))}
        </View>
      ) : null}
      {full && !onLimit ? null : (
        <Row>
          <View className="flex-1">
            <Button label={addLabel} icon="images-outline" variant="secondary" onPress={() => void fromLibrary()} fullWidth />
          </View>
          <View className="flex-1">
            <Button label={t('takePhoto')} icon="camera-outline" variant="secondary" onPress={() => void fromCamera()} fullWidth />
          </View>
        </Row>
      )}
    </View>
  )
}
