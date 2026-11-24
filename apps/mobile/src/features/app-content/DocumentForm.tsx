import { Spinner } from 'heroui-native'
import { useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { appApi, appHttp, type DocumentEditView } from '@/api/app'
import { useT } from '@/i18n'
import { pickPdf, uploadFile, type LocalFile } from '@/lib/upload'
import { Button, Card, Field, Heading, Icon, Muted, Row, Screen, SelectField, SwitchRow, Text, confirm, useNotify } from '@/ui'
import { DOCUMENT_CATEGORIES, MAX_PDF_BYTES } from './categories'
import { FormError, useContentInvalidate, useLeave, useSubmit } from './common'

const MAX_TITLE = 120
const MAX_DESCRIPTION = 2000

interface Attachment {
  url: string | null
  name: string
  status: 'done' | 'uploading' | 'failed'
  file: LocalFile | null
}

type Errors = Partial<Record<'title' | 'description' | 'category' | 'file', string>>

/** Create (no `existing`) or edit one profile document: PDF, title, description, category and visibility. */
export function DocumentForm({ profileId, existing }: { profileId: string; existing?: DocumentEditView['document'] }) {
  const t = useT('Documents')
  const tc = useT('Common')
  const te = useT('Errors')
  const tm = useT('Mobile.appContent')
  const notify = useNotify()
  const leave = useLeave()
  const refresh = useContentInvalidate(profileId)
  const { submit, pending, formError, serverErrors } = useSubmit()
  const remove = useSubmit()
  const listPath = `/profile/${profileId}/documents`

  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [category, setCategory] = useState<string>(existing?.category ?? '')
  const [isPublic, setIsPublic] = useState(existing?.isPublic ?? true)
  const [attachment, setAttachment] = useState<Attachment | null>(
    existing?.fileUrl ? { url: existing.fileUrl, name: existing.fileName ?? existing.title, status: 'done', file: null } : null,
  )
  const [errors, setErrors] = useState<Errors>({})
  const uploadRun = useRef(0)

  const categories = useMemo(() => DOCUMENT_CATEGORIES.map((key) => ({ value: key as string, label: t(`cat_${key}`) })), [t])

  function startUpload(file: LocalFile) {
    const run = (uploadRun.current += 1)
    setAttachment({ url: null, name: file.name, status: 'uploading', file })
    uploadFile('app', appHttp.documentsUpload(), file, { profileId }).then(
      (url) => {
        if (uploadRun.current === run) setAttachment({ url, name: file.name, status: 'done', file })
      },
      () => {
        if (uploadRun.current !== run) return
        setAttachment({ url: null, name: file.name, status: 'failed', file })
        notify.error(t('toasts.uploadFailed'))
      },
    )
  }

  async function choose() {
    let file: LocalFile | null = null
    try {
      file = await pickPdf()
    } catch (error) {
      notify.error(error)
      return
    }
    if (!file) return
    if (file.mimeType !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return notify.error(t('toasts.unsupportedFile'))
    if (file.size > MAX_PDF_BYTES) return notify.error(tm('fileTooLarge', { max: 10 }))
    setErrors((current) => ({ ...current, file: undefined }))
    startUpload(file)
  }

  function removeFile() {
    uploadRun.current += 1
    setAttachment(null)
  }

  async function save() {
    if (attachment?.status === 'uploading') return notify.info(t('toasts.waitForUpload'))
    const next: Errors = {}
    if (!title.trim()) next.title = te('required')
    else if (title.trim().length > MAX_TITLE) next.title = te('maxChars', { count: MAX_TITLE })
    if (description.trim().length > MAX_DESCRIPTION) next.description = te('maxChars', { count: MAX_DESCRIPTION })
    if (!category) next.category = te('required')
    if (!attachment?.url || attachment.status !== 'done') next.file = tm('fileRequired')
    setErrors(next)
    if (Object.keys(next).length > 0) return notify.error(t('toasts.fixFields'))

    await submit(
      () =>
        appApi.saveDocument(profileId, existing?.id ?? null, {
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          fileUrl: attachment?.url,
          fileName: attachment?.name || undefined,
          isPublic,
        }),
      {
        success: t('toasts.saved'),
        onSuccess: async () => {
          await refresh()
          leave.back(listPath)
        },
      },
    )
  }

  async function destroy() {
    if (!existing) return
    const yes = await confirm({
      title: t('deleteDialogTitle'),
      message: t('deleteDialogDescription'),
      confirmLabel: tc('delete'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!yes) return
    await remove.submit(() => appApi.deleteDocument(profileId, existing.id), {
      success: t('toasts.deleted'),
      onSuccess: async () => {
        await refresh()
        leave.to(listPath)
      },
    })
  }

  return (
    <Screen footer={<Button label={tc('save')} icon="save-outline" onPress={() => void save()} loading={pending} disabled={remove.pending} fullWidth size="lg" />}>
      <Muted>{t('editSubtitle')}</Muted>

      <View className="gap-2">
        <Heading>{t('fileLabel')}</Heading>
        {attachment ? (
          <Card>
            <Row>
              {attachment.status === 'uploading' ? <Spinner size="sm" /> : <Icon name={attachment.status === 'failed' ? 'alert-circle-outline' : 'document-text-outline'} size={24} />}
              <View className="flex-1">
                <Text numberOfLines={2}>{attachment.name}</Text>
                {attachment.status === 'uploading' ? <Muted>{t('fileUploading')}</Muted> : null}
                {attachment.status === 'failed' ? <Muted className="text-danger">{tm('uploadFailed')}</Muted> : null}
              </View>
            </Row>
            <Row>
              {attachment.status === 'failed' && attachment.file ? (
                <View className="flex-1">
                  <Button label={tm('retryUpload')} icon="refresh" variant="secondary" size="sm" onPress={() => attachment.file && startUpload(attachment.file)} fullWidth />
                </View>
              ) : null}
              {attachment.status !== 'uploading' ? (
                <View className="flex-1">
                  <Button label={tm('replaceFile')} icon="swap-horizontal-outline" variant="secondary" size="sm" onPress={() => void choose()} fullWidth />
                </View>
              ) : null}
              <View className="flex-1">
                <Button label={t('fileRemove')} icon="close" variant="ghost" size="sm" onPress={removeFile} fullWidth />
              </View>
            </Row>
          </Card>
        ) : (
          <>
            <Muted>{t('noFile')}</Muted>
            <Button label={t('fileUpload')} icon="cloud-upload-outline" variant="secondary" onPress={() => void choose()} fullWidth />
          </>
        )}
        {errors.file ?? serverErrors.fileUrl ? <Text className="text-sm text-danger">{errors.file ?? serverErrors.fileUrl}</Text> : null}
      </View>

      <Field
        label={t('titleLabel')}
        value={title}
        onChangeText={setTitle}
        placeholder={t('titlePlaceholder')}
        maxLength={MAX_TITLE}
        required
        error={errors.title ?? serverErrors.title}
      />
      <SelectField
        label={t('categoryLabel')}
        value={category || null}
        options={categories}
        onChange={setCategory}
        placeholder={t('categoryPlaceholder')}
        error={errors.category ?? serverErrors.category}
      />
      <Field
        label={t('descriptionLabel')}
        value={description}
        onChangeText={setDescription}
        placeholder={t('descriptionPlaceholder')}
        multiline
        maxLength={MAX_DESCRIPTION}
        hint={`${description.length}/${MAX_DESCRIPTION}`}
        error={errors.description ?? serverErrors.description}
      />
      <SwitchRow label={t('publicToggleLabel')} description={t('publicToggleHint')} value={isPublic} onChange={setIsPublic} />

      <FormError message={formError ?? remove.formError} />

      {existing ? (
        <Button label={t('deleteDocument')} icon="trash-outline" variant="danger-soft" onPress={() => void destroy()} loading={remove.pending} disabled={pending} fullWidth />
      ) : null}
    </Screen>
  )
}
