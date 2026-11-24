import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { appApi, appHttp, type PlaceEditItem, type PlanTier } from '@/api/app'
import { LimitReachedSheet } from '@/features/app/LimitReached'
import { useT } from '@/i18n'
import { Button, DateField, Field, Heading, Muted, Row, Screen, Text, confirm, useNotify } from '@/ui'
import { AddressFields, addressFrom } from './AddressFields'
import { PLACE_CATEGORIES, PLACE_CATEGORY_GROUPS, PLACE_MAX_PHOTOS } from './categories'
import { FormError, parseCoordinate, useContentInvalidate, useLeave, useSubmit } from './common'
import { useMyLocation } from './location'
import { PhotoEditor, storedItem, useUploadList } from './uploads'

const MAX_TITLE = 120
const MAX_DESCRIPTION = 2000

type Errors = Partial<Record<'title' | 'description' | 'startDate' | 'endDate' | 'lat' | 'lon', string>>

interface PlaceFormProps {
  profileId: string
  existing?: PlaceEditItem
  /** The plan's combined image pool (shared with the biography and gallery). */
  mediaMax: number
  /** Images of that pool used outside this place. */
  otherImagesUsed: number
  tier: PlanTier
}

export function CategoryPicker({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const t = useT('Places')
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key])
  return (
    <View className="gap-3">
      <View>
        <Heading>{t('categoriesLabel')}</Heading>
        <Muted>{t('categoriesHint')}</Muted>
      </View>
      {PLACE_CATEGORY_GROUPS.map((group) => (
        <View key={group.group} className="gap-2">
          <Muted className="font-medium">{t(`catgroup_${group.group}`)}</Muted>
          <View className="flex-row flex-wrap gap-2">
            {group.categories.map((key) => {
              const selected = value.includes(key)
              return (
                <Pressable
                  key={key}
                  onPress={() => toggle(key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={t(`cat_${key}`)}
                  className={`min-h-11 justify-center rounded-full border px-4 ${selected ? 'border-accent bg-accent' : 'border-border bg-surface'}`}
                >
                  <Text className={`text-sm ${selected ? 'text-accent-foreground' : 'text-foreground'}`}>{t(`cat_${key}`)}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

/** Create (no `existing`) or edit one life place. Mirrors the web `getPlaceSchema`. */
export function PlaceForm({ profileId, existing, mediaMax, otherImagesUsed, tier }: PlaceFormProps) {
  const t = useT('Places')
  const tc = useT('Common')
  const te = useT('Errors')
  const tm = useT('Mobile.appContent')
  const notify = useNotify()
  const leave = useLeave()
  const refresh = useContentInvalidate(profileId)
  const { submit, pending, formError, serverErrors } = useSubmit()
  const remove = useSubmit()
  const { locate, locating } = useMyLocation(t)
  const listPath = `/profile/${profileId}/places`

  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [categories, setCategories] = useState<string[]>((existing?.categories ?? []).filter((key) => PLACE_CATEGORIES.includes(key)))
  const [startDate, setStartDate] = useState(existing?.startDate?.slice(0, 10) ?? '')
  const [endDate, setEndDate] = useState(existing?.endDate?.slice(0, 10) ?? '')
  const [address, setAddress] = useState(() => addressFrom(existing))
  const [lat, setLat] = useState(existing ? String(existing.lat) : '0')
  const [lon, setLon] = useState(existing ? String(existing.lon) : '0')
  const [errors, setErrors] = useState<Errors>({})
  const [limitOpen, setLimitOpen] = useState(false)
  const photos = useUploadList(appHttp.placesUpload(), profileId, () => (existing?.photos ?? []).map((url, index) => storedItem(`saved-${index}`, url, {})))

  const poolRoom = Math.max(0, mediaMax - otherImagesUsed)
  const photoMax = Math.min(PLACE_MAX_PHOTOS, poolRoom)

  async function fillLocation() {
    const position = await locate()
    if (!position) return
    setLat(String(position.lat))
    setLon(String(position.lon))
    setErrors((current) => ({ ...current, lat: undefined, lon: undefined }))
  }

  async function save() {
    if (photos.uploading) return notify.info(t('toasts.waitForUploads'))
    if (photos.failed) return notify.error(tm('resolveFailedUploads'))
    const latitude = parseCoordinate(lat, 90)
    const longitude = parseCoordinate(lon, 180)
    const next: Errors = {}
    if (!title.trim()) next.title = te('required')
    else if (title.trim().length > MAX_TITLE) next.title = te('maxChars', { count: MAX_TITLE })
    if (description.trim().length > MAX_DESCRIPTION) next.description = te('maxChars', { count: MAX_DESCRIPTION })
    if (!startDate) next.startDate = te('required')
    if (startDate && endDate && endDate < startDate) next.endDate = te('endBeforeStart')
    if (latitude === null) next.lat = tm('invalidLatitude')
    if (longitude === null) next.lon = tm('invalidLongitude')
    setErrors(next)
    if (Object.keys(next).length > 0 || latitude === null || longitude === null) return notify.error(t('toasts.fixFields'))

    await submit(
      () =>
        appApi.savePlace(profileId, existing?.id ?? null, {
          title: title.trim(),
          description: description.trim() || undefined,
          categories,
          address,
          lat: latitude,
          lon: longitude,
          photos: photos.items.map((photo) => photo.url),
          startDate,
          endDate: endDate || null,
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
    await remove.submit(() => appApi.deletePlace(profileId, existing.id), {
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

      <Field
        label={t('titleLabel')}
        value={title}
        onChangeText={setTitle}
        placeholder={t('titlePlaceholder')}
        maxLength={MAX_TITLE}
        required
        error={errors.title ?? serverErrors.title}
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

      <CategoryPicker value={categories} onChange={setCategories} />

      <View className="gap-3">
        <Heading>{t('datesLabel')}</Heading>
        <DateField label={t('startDate')} value={startDate} onChange={setStartDate} error={errors.startDate ?? serverErrors.startDate} />
        <DateField
          label={t('endDate')}
          value={endDate}
          onChange={setEndDate}
          minimumDate={startDate ? new Date(`${startDate}T12:00:00`) : undefined}
          error={errors.endDate ?? serverErrors.endDate}
        />
      </View>

      <PhotoEditor
        items={photos.items}
        onAdd={(file) => photos.add(file, {})}
        onRemove={photos.remove}
        onRetry={photos.retry}
        max={photoMax}
        title={t('photos')}
        addLabel={t('addImage')}
        removeLabel={t('removePhoto')}
        photoLabel={(number) => t('photoAlt', { number })}
        onLimit={photos.items.length >= PLACE_MAX_PHOTOS ? undefined : () => setLimitOpen(true)}
      />

      <AddressFields title={t('address')} value={address} onChange={setAddress} />

      <View className="gap-3">
        <Heading>{t('geoCoordinatesLabel')}</Heading>
        <Row className="items-start">
          <View className="flex-1">
            <Field label={t('latitude')} value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" autoCorrect={false} error={errors.lat ?? serverErrors.lat} />
          </View>
          <View className="flex-1">
            <Field label={t('longitude')} value={lon} onChangeText={setLon} keyboardType="numbers-and-punctuation" autoCorrect={false} error={errors.lon ?? serverErrors.lon} />
          </View>
        </Row>
        <Button label={t('useMyLocation')} icon="locate-outline" variant="secondary" onPress={() => void fillLocation()} loading={locating} fullWidth />
      </View>

      <FormError message={formError ?? remove.formError} />

      {existing ? (
        <Button label={t('deletePlace')} icon="trash-outline" variant="danger-soft" onPress={() => void destroy()} loading={remove.pending} disabled={pending} fullWidth />
      ) : null}

      <LimitReachedSheet visible={limitOpen} onClose={() => setLimitOpen(false)} context="media-images" limit={mediaMax} tier={tier} />
    </Screen>
  )
}
