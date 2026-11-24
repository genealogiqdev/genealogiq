import { Image } from 'expo-image'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { appApi, appHttp, type TributeEditView } from '@/api/app'
import { useRequireAppSession } from '@/features/app/session'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { PermissionDeniedError, pickMedia, takePhoto, uploadFile, type LocalFile } from '@/lib/upload'
import { usePalette } from '@/theme'
import { Avatar, Button, Card, Field, LoadingState, Muted, QueryView, Row, Screen, Text, confirm, useAction, useNotify } from '@/ui'

const MAX_TEXT = 512

function TributeForm({ data, profileId }: { data: TributeEditView; profileId: string }) {
  const t = useT('Tributes')
  const te = useT('Errors')
  const tm = useT('Mobile')
  const router = useRouter()
  const notify = useNotify()
  const palette = usePalette('app')
  const invalidate = useInvalidate('app')
  const { run, pending } = useAction()
  const existing = data.existing
  const [text, setText] = useState(existing?.text ?? '')
  const [imageUrl, setImageUrl] = useState<string | null>(existing?.imageUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Opening another of the viewer's tributes loads its own text and image.
  const existingId = existing?.id ?? null
  useEffect(() => {
    setText(existing?.text ?? '')
    setImageUrl(existing?.imageUrl ?? null)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingId])

  const back = async () => {
    await invalidate(['tributes', profileId], ['tributeEdit', profileId], ['profile', profileId], ['messages'])
    if (router.canGoBack()) router.back()
    else router.replace(`/profile/${profileId}/tributes`)
  }

  async function addImage(pick: () => Promise<LocalFile | null>) {
    let file: LocalFile | null
    try {
      file = await pick()
    } catch (problem) {
      notify.error(problem instanceof PermissionDeniedError ? tm('common.permissionDenied') : t('toasts.uploadFailed'))
      return
    }
    if (!file) return
    setUploading(true)
    try {
      setImageUrl(await uploadFile('app', appHttp.tributeUpload(), file, { profileId }))
    } catch {
      notify.error(t('toasts.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  async function send() {
    if (uploading) {
      notify.info(t('toasts.waitForUpload'))
      return
    }
    const body = text.trim()
    const problem = !body ? te('tributeTextRequired') : body.length > MAX_TEXT ? te('maxChars', { count: MAX_TEXT }) : null
    setError(problem)
    if (problem) return
    await run(() => appApi.submitTribute(profileId, imageUrl ? { text: body, imageUrl } : { text: body }, existing?.id), {
      success: data.isEditing ? t('toasts.updated') : t('toasts.submitted'),
      onSuccess: back,
    })
  }

  async function remove() {
    if (!existing) return
    const confirmed = await confirm({
      title: t('form.deleteDialogTitle'),
      message: t('form.deleteDialogDescription'),
      confirmLabel: t('form.deleteTribute'),
      cancelLabel: tm('common.cancel'),
      destructive: true,
    })
    if (!confirmed) return
    await run(() => appApi.deleteTribute(existing.id), { success: t('toasts.deleted'), onSuccess: back })
  }

  const author = data.authorName ?? t('form.youFallback')

  return (
    <>
      <Muted className="italic">{t('edit.subtitle')}</Muted>
      <Card>
        <Row>
          <Avatar name={author} size={44} />
          <Text className="flex-1 font-semibold">{author}</Text>
        </Row>
        <Field
          label={t('form.textLabel')}
          value={text}
          onChangeText={(value) => {
            setText(value)
            if (error) setError(null)
          }}
          placeholder={t('form.textPlaceholder')}
          error={error}
          hint={`${text.trim().length}/${MAX_TEXT}`}
          multiline
          maxLength={MAX_TEXT}
          required
        />
      </Card>

      <Card>
        <Text className="text-sm font-medium">{t('form.photoLabel')}</Text>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12 }} contentFit="cover" accessibilityLabel={t('form.previewAlt')} /> : null}
        {uploading ? (
          <View className="items-center py-4">
            <ActivityIndicator color={palette.accent} />
          </View>
        ) : null}
        <Row>
          <View className="flex-1">
            <Button label={t('form.addImage')} icon="images-outline" variant="secondary" disabled={uploading} onPress={() => void addImage(async () => (await pickMedia())[0] ?? null)} fullWidth />
          </View>
          <View className="flex-1">
            <Button label={tm('app.avatar.takePhoto')} icon="camera-outline" variant="secondary" disabled={uploading} onPress={() => void addImage(takePhoto)} fullWidth />
          </View>
        </Row>
        {imageUrl ? <Button label={t('form.removeImage')} icon="close" variant="ghost" disabled={uploading} onPress={() => setImageUrl(null)} fullWidth /> : null}
      </Card>

      <Button label={t('form.sendTribute')} icon="send-outline" loading={pending} disabled={uploading} onPress={() => void send()} fullWidth size="lg" />
      {existing ? <Button label={t('form.deleteTribute')} icon="trash-outline" variant="danger-soft" disabled={pending} onPress={() => void remove()} fullWidth /> : null}
    </>
  )
}

/**
 * Write a new tribute, or edit one of the viewer's own (`?tributeId=`). A
 * profile can hold several tributes by the same author, each with its own id.
 */
export default function EditTribute() {
  const user = useRequireAppSession()
  const t = useT('Tributes')
  const params = useLocalSearchParams<{ id: string; tributeId?: string }>()
  const id = params.id ?? ''
  const tributeId = (Array.isArray(params.tributeId) ? params.tributeId[0] : params.tributeId) || undefined
  const edit = useView('app', ['tributeEdit', id, tributeId ?? null], () => appApi.tributeEdit(id, tributeId), { enabled: !!user && !!id })

  if (!user) return <LoadingState />

  return (
    <Screen>
      <Stack.Screen options={{ title: edit.data ? t('title', { name: edit.data.profile.firstName }) : '' }} />
      <QueryView query={edit}>{(data) => <TributeForm data={data} profileId={id} />}</QueryView>
    </Screen>
  )
}
