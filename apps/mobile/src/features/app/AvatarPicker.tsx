import { useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { appHttp } from '@/api/app'
import { useT } from '@/i18n'
import { PermissionDeniedError, pickMedia, takePhoto, uploadFile, type LocalFile } from '@/lib/upload'
import { usePalette } from '@/theme'
import { Avatar, Button, Row, useNotify } from '@/ui'

interface AvatarPickerProps {
  value: string | null
  onChange: (url: string | null) => void
  name: string
  /** What the bio upload route authorises against: an existing profile, or a create scope. */
  payload: { profileId: string } | { scope: 'create-memorial' | 'create-pet' }
  /** Tells the form an upload is running so it can hold the save. */
  onUploadingChange?: (uploading: boolean) => void
  removable?: boolean
}

/** Profile photo control: library or camera, compressed, uploaded through the bio upload route. */
export function AvatarPicker({ value, onChange, name, payload, onUploadingChange, removable }: AvatarPickerProps) {
  const t = useT('Memorialized')
  const tc = useT('Common')
  const tm = useT('Mobile')
  const notify = useNotify()
  const palette = usePalette('app')
  const [uploading, setUploading] = useState(false)

  async function upload(pick: () => Promise<LocalFile | null>) {
    let file: LocalFile | null
    try {
      file = await pick()
    } catch (error) {
      notify.error(error instanceof PermissionDeniedError ? tm('common.permissionDenied') : t('avatar.uploadError'))
      return
    }
    if (!file) return
    setUploading(true)
    onUploadingChange?.(true)
    try {
      onChange(await uploadFile('app', appHttp.bioUpload(), file, payload))
    } catch {
      notify.error(t('avatar.uploadError'))
    } finally {
      setUploading(false)
      onUploadingChange?.(false)
    }
  }

  return (
    <Row className="gap-4">
      <View>
        <Avatar uri={value} name={name} size={88} />
        {uploading ? (
          <View className="absolute inset-0 items-center justify-center rounded-full bg-backdrop">
            <ActivityIndicator color={palette.afg} />
          </View>
        ) : null}
      </View>
      <View className="flex-1 gap-2">
        <Button label={t('avatar.change')} icon="images-outline" variant="secondary" size="sm" disabled={uploading} onPress={() => void upload(async () => (await pickMedia())[0] ?? null)} />
        <Button label={tm('app.avatar.takePhoto')} icon="camera-outline" variant="secondary" size="sm" disabled={uploading} onPress={() => void upload(takePhoto)} />
        {removable && value ? <Button label={tc('remove')} icon="close" variant="ghost" size="sm" disabled={uploading} onPress={() => onChange(null)} /> : null}
      </View>
    </Row>
  )
}
