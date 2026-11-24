import { Stack } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { appApi, appHttp, type BioEditView } from '@/api/app'
import { LimitReachedSheet } from '@/features/app/LimitReached'
import { useRequireAppSession } from '@/features/app/session'
import { Counter, EDIT_QUERY, FormError, contentKey, useContentInvalidate, useLeave, useParam, useSubmit } from '@/features/app-content/common'
import { PhotoEditor, storedItem, useUploadList } from '@/features/app-content/uploads'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { Button, Field, LoadingState, Muted, QueryView, Screen, confirm, useNotify } from '@/ui'

const MAX_QUOTE = 140

function BioForm({ data }: { data: BioEditView }) {
  const t = useT('Bio')
  const tc = useT('Common')
  const te = useT('Errors')
  const tm = useT('Mobile.appContent')
  const notify = useNotify()
  const leave = useLeave()
  const refresh = useContentInvalidate(data.profileId)
  const { submit, pending, formError, serverErrors } = useSubmit()
  const remove = useSubmit()

  const initialText = data.bio?.text ?? ''
  const [quote, setQuote] = useState(data.bio?.quote ?? '')
  const [text, setText] = useState(initialText)
  const [errors, setErrors] = useState<{ quote?: string; text?: string }>({})
  const [limit, setLimit] = useState<'bio' | 'media-images' | null>(null)
  const images = useUploadList<{ id?: string; aspect: string }>(appHttp.bioUpload(), data.profileId, () =>
    [...(data.bio?.images ?? [])].sort((a, b) => a.order - b.order).map((image) => storedItem(image.id, image.url, { id: image.id, aspect: image.aspect })),
  )
  // The image pool is shared with the gallery and places: only what the other modules left is available here.
  const maxImages = Math.max(0, data.maxImages - data.otherImagesUsed)
  const bioPath = `/profile/${data.profileId}/bio`

  // A text written under a richer plan may stay or shrink, never grow past the limit.
  const overLimit = text.trim().length > data.maxChars && text.trim().length > initialText.length

  async function save() {
    if (images.uploading) return notify.info(t('toastWaitUploads'))
    if (images.failed) return notify.error(tm('resolveFailedUploads'))
    const next: typeof errors = {}
    if (quote.trim().length > MAX_QUOTE) next.quote = te('maxChars', { count: MAX_QUOTE })
    if (overLimit) next.text = te('maxChars', { count: data.maxChars })
    setErrors(next)
    if (overLimit) setLimit('bio')
    if (Object.keys(next).length > 0) return

    await submit(
      () =>
        appApi.saveBio(data.profileId, {
          quote: quote.trim() || undefined,
          text: text.trim() || undefined,
          images: images.items.map((image, order) => ({ id: image.id, url: image.url, aspect: image.aspect, order })),
        }),
      {
        success: t('toastSaved'),
        onSuccess: async () => {
          await refresh()
          leave.back(bioPath)
        },
      },
    )
  }

  async function destroy() {
    const yes = await confirm({
      title: t('deleteDialogTitle'),
      message: t('deleteDialogDescription'),
      confirmLabel: tc('delete'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!yes) return
    await remove.submit(() => appApi.deleteBio(data.profileId), {
      success: t('toastDeleted'),
      onSuccess: async () => {
        await refresh()
        leave.back(bioPath)
      },
    })
  }

  return (
    <Screen footer={<Button label={tc('save')} icon="save-outline" onPress={() => void save()} loading={pending} disabled={remove.pending} fullWidth size="lg" />}>
      <Muted>{data.isCreating ? t('editSubtitleCreate') : t('editSubtitleEdit')}</Muted>

      <PhotoEditor
        items={images.items}
        onAdd={(file) => images.add(file, { aspect: 'square' })}
        onRemove={images.remove}
        onRetry={images.retry}
        max={maxImages}
        title={t('photos')}
        addLabel={t('addImage')}
        removeLabel={t('removeImage')}
        photoLabel={() => t('previewAlt')}
        onLimit={() => setLimit('media-images')}
      />

      <View className="gap-1">
        <Field
          label={t('quoteLabel')}
          value={quote}
          onChangeText={setQuote}
          placeholder={t('quotePlaceholder')}
          maxLength={MAX_QUOTE}
          error={errors.quote ?? serverErrors.quote}
        />
        <View className="items-end">
          <Counter used={quote.length} max={MAX_QUOTE} />
        </View>
      </View>

      <View className="gap-1">
        <Field
          label={t('textLabel')}
          value={text}
          onChangeText={setText}
          placeholder={t('textPlaceholder')}
          multiline
          className="min-h-64"
          hint={t('paragraphHint')}
          error={errors.text ?? serverErrors.text ?? (overLimit ? te('maxChars', { count: data.maxChars }) : null)}
        />
        <View className="items-end">
          <Counter used={text.length} max={data.maxChars} />
        </View>
      </View>

      <FormError message={formError ?? remove.formError} />

      {data.isCreating ? null : (
        <Button label={t('deleteBio')} icon="trash-outline" variant="danger-soft" onPress={() => void destroy()} loading={remove.pending} disabled={pending} fullWidth />
      )}

      <LimitReachedSheet
        visible={limit !== null}
        onClose={() => setLimit(null)}
        context={limit ?? 'bio'}
        limit={limit === 'media-images' ? data.maxImages : data.maxChars}
        tier={data.tier}
      />
    </Screen>
  )
}

export default function BioEditScreen() {
  const user = useRequireAppSession()
  const id = useParam('id')
  const t = useT('Bio')
  const query = useView('app', contentKey(id, 'bioEdit'), () => appApi.bioEdit(id), { ...EDIT_QUERY, enabled: !!user })
  if (!user) return <LoadingState />
  return (
    <>
      <Stack.Screen options={{ title: query.data ? (query.data.isCreating ? t('editTitleCreate') : t('editTitleEdit')) : '' }} />
      <QueryView query={query}>{(data) => <BioForm data={data} />}</QueryView>
    </>
  )
}
