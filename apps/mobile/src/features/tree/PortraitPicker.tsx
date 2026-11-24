import { useEffect, useRef, useState, type RefObject } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { appHttp } from '@/api/app'
import { http } from '@/api/client'
import { useT } from '@/i18n'
import { PermissionDeniedError, pickMedia, takePhoto, uploadFile, type LocalFile } from '@/lib/upload'
import { usePalette } from '@/theme'
import { Avatar, Button, useNotify } from '@/ui'

/** What the bio upload route authorises against: an existing profile, or a create scope. */
export type PortraitPayload = { profileId: string } | { scope: 'create-pet' | 'create-ghost' }

interface Props {
  value: string | null
  name: string
  payload: PortraitPayload
  disabled?: boolean
  /** Set `.current = true` once the form saved, so the staged upload is kept when the sheet closes. */
  savedRef: RefObject<boolean>
  onChange: (url: string | null) => void
  onUploadingChange?: (uploading: boolean) => void
}

/** Removes a staged portrait that was never saved. Best effort: the server only deletes unreferenced media. */
function discard(url: string, payload: PortraitPayload): void {
  void http('app', appHttp.bioUpload(), {
    method: 'DELETE',
    body: JSON.stringify({ url, clientPayload: JSON.stringify(payload) }),
  }).catch(() => undefined)
}

/** Portrait for a tree member: library or camera, uploaded through the bio upload route. */
export function PortraitPicker({ value, name, payload, disabled, savedRef, onChange, onUploadingChange }: Props) {
  const t = useT('FamilyTree')
  const tc = useT('Common')
  const tm = useT('Mobile')
  const notify = useNotify()
  const palette = usePalette('app')
  const [uploading, setUploading] = useState(false)
  // The upload made in this sheet that has not been replaced or removed.
  const staged = useRef<string | null>(null)

  useEffect(
    () => () => {
      // Closed without saving: the staged file would otherwise be orphaned.
      if (staged.current && !savedRef.current) discard(staged.current, payload)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const busy = (next: boolean) => {
    setUploading(next)
    onUploadingChange?.(next)
  }

  async function upload(pick: () => Promise<LocalFile | null>) {
    let file: LocalFile | null
    try {
      file = await pick()
    } catch (error) {
      notify.error(error instanceof PermissionDeniedError ? tm('common.permissionDenied') : t('portrait.uploadError'))
      return
    }
    if (!file) return
    busy(true)
    try {
      const url = await uploadFile('app', appHttp.bioUpload(), file, payload)
      const previous = staged.current
      staged.current = url
      onChange(url)
      if (previous && previous !== url) discard(previous, payload)
    } catch {
      notify.error(t('portrait.uploadError'))
    } finally {
      busy(false)
    }
  }

  function remove() {
    if (staged.current) {
      discard(staged.current, payload)
      staged.current = null
    }
    onChange(null)
  }

  return (
    <View className="flex-row items-center gap-4">
      <View>
        <Avatar uri={value} name={name} size={72} />
        {uploading ? (
          <View className="absolute inset-0 items-center justify-center rounded-full bg-backdrop">
            <ActivityIndicator color={palette.afg} />
          </View>
        ) : null}
      </View>
      <View className="flex-1 gap-2">
        <Button
          label={uploading ? t('portrait.uploading') : t('portrait.change')}
          icon="images-outline"
          variant="secondary"
          size="sm"
          disabled={disabled || uploading}
          onPress={() => void upload(async () => (await pickMedia())[0] ?? null)}
        />
        <Button
          label={tm('tree.takePhoto')}
          icon="camera-outline"
          variant="secondary"
          size="sm"
          disabled={disabled || uploading}
          onPress={() => void upload(takePhoto)}
        />
        {value ? <Button label={tc('remove')} icon="close" variant="ghost" size="sm" disabled={disabled || uploading} onPress={remove} /> : null}
      </View>
    </View>
  )
}
