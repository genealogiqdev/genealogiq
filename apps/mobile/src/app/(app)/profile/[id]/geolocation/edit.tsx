import { Stack } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { appApi, appHttp, type GeolocationEditView } from '@/api/app'
import { http } from '@/api/client'
import { useRequireAppSession } from '@/features/app/session'
import { AddressFields, addressFrom } from '@/features/app-content/AddressFields'
import { GEOLOCATION_MAX_PHOTOS } from '@/features/app-content/categories'
import { EDIT_QUERY, FormError, contentKey, parseCoordinate, useContentInvalidate, useLeave, useParam, useSubmit } from '@/features/app-content/common'
import { useMyLocation } from '@/features/app-content/location'
import { PhotoEditor, storedItem, useUploadList } from '@/features/app-content/uploads'
import { useT } from '@/i18n'
import { useView } from '@/lib/query'
import { Button, Field, Heading, LoadingState, Muted, QueryView, Row, Screen, Text, confirm, useNotify } from '@/ui'

const MAX_PLACE_NAME = 120
const MAX_SECTION = 200
const MAX_NOTES = 500

/** Rows of /api/geolocation/places: a resting place already on file (never a number or complement). */
interface PlaceSuggestion {
  placeName: string
  zip: string | null
  street: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  country: string | null
  lat: number
  lon: number
}

type Errors = Partial<Record<'placeName' | 'section' | 'notes' | 'lat' | 'lon', string>>

function GeolocationForm({ data }: { data: GeolocationEditView }) {
  const t = useT('Geolocation')
  const tc = useT('Common')
  const te = useT('Errors')
  const tm = useT('Mobile.appContent')
  const notify = useNotify()
  const leave = useLeave()
  const refresh = useContentInvalidate(data.profileId)
  const { submit, pending, formError, serverErrors } = useSubmit()
  const remove = useSubmit()
  const { locate, locating } = useMyLocation(t)
  const existing = data.geolocation
  const viewPath = `/profile/${data.profileId}/geolocation`

  const [placeName, setPlaceName] = useState(existing?.placeName ?? '')
  const [address, setAddress] = useState(() => addressFrom(existing))
  const [section, setSection] = useState(existing?.section ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [lat, setLat] = useState(existing ? String(existing.lat) : '0')
  const [lon, setLon] = useState(existing ? String(existing.lon) : '0')
  const [errors, setErrors] = useState<Errors>({})
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const photos = useUploadList(appHttp.geolocationUpload(), data.profileId, () =>
    [existing?.photo1, existing?.photo2, existing?.photo3]
      .filter((url): url is string => !!url)
      .map((url, index) => storedItem(`saved-${index}`, url, {})),
  )

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lookup = useRef(0)
  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current)
    },
    [],
  )

  function onPlaceNameChange(value: string) {
    setPlaceName(value)
    if (debounce.current) clearTimeout(debounce.current)
    const query = value.trim()
    const run = (lookup.current += 1)
    if (query.length < 2) return setSuggestions([])
    debounce.current = setTimeout(() => {
      http<PlaceSuggestion[]>('app', appHttp.geolocationPlaces(query)).then(
        (rows) => {
          if (lookup.current === run) setSuggestions(Array.isArray(rows) ? rows : [])
        },
        () => {
          // Typeahead failures are silent, as on the web.
        },
      )
    }, 300)
  }

  function applySuggestion(row: PlaceSuggestion) {
    lookup.current += 1
    setPlaceName(row.placeName)
    // Number and complement are never autofilled from another place.
    setAddress((current) => ({
      ...current,
      zip: row.zip ?? '',
      street: row.street ?? '',
      neighborhood: row.neighborhood ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      country: row.country ?? 'BR',
    }))
    if (row.lat !== 0 || row.lon !== 0) {
      setLat(String(row.lat))
      setLon(String(row.lon))
    }
    setSuggestions([])
  }

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
    if (!placeName.trim()) next.placeName = te('required')
    else if (placeName.trim().length > MAX_PLACE_NAME) next.placeName = te('maxChars', { count: MAX_PLACE_NAME })
    if (section.trim().length > MAX_SECTION) next.section = te('maxChars', { count: MAX_SECTION })
    if (notes.trim().length > MAX_NOTES) next.notes = te('maxChars', { count: MAX_NOTES })
    if (latitude === null) next.lat = tm('invalidLatitude')
    if (longitude === null) next.lon = tm('invalidLongitude')
    setErrors(next)
    if (Object.keys(next).length > 0 || latitude === null || longitude === null) return notify.error(t('toasts.fixFields'))

    const urls = photos.items.map((photo) => photo.url)
    await submit(
      () =>
        appApi.saveGeolocation(data.profileId, {
          placeName: placeName.trim(),
          address,
          section: section.trim() || undefined,
          lat: latitude,
          lon: longitude,
          notes: notes.trim() || undefined,
          photo1: urls[0] ?? null,
          photo2: urls[1] ?? null,
          photo3: urls[2] ?? null,
        }),
      {
        success: t('toasts.saved'),
        onSuccess: async () => {
          await refresh()
          leave.back(viewPath)
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
    await remove.submit(() => appApi.deleteGeolocation(data.profileId), {
      success: t('toasts.deleted'),
      onSuccess: async () => {
        await refresh()
        leave.back(viewPath)
      },
    })
  }

  return (
    <Screen footer={<Button label={tc('save')} icon="save-outline" onPress={() => void save()} loading={pending} disabled={remove.pending} fullWidth size="lg" />}>
      <Muted>{data.isCreating ? t('addSubtitle') : t('editSubtitle')}</Muted>

      <PhotoEditor
        items={photos.items}
        onAdd={(file) => photos.add(file, {})}
        onRemove={photos.remove}
        onRetry={photos.retry}
        max={GEOLOCATION_MAX_PHOTOS}
        title={t('photos')}
        addLabel={t('addImage')}
        removeLabel={t('removePhoto')}
        photoLabel={(number) => t('photoAlt', { number })}
      />

      <View className="gap-2">
        <Field
          label={t('placeName')}
          value={placeName}
          onChangeText={onPlaceNameChange}
          placeholder={t('placeNamePlaceholder')}
          maxLength={MAX_PLACE_NAME}
          required
          autoCorrect={false}
          error={errors.placeName ?? serverErrors.placeName}
        />
        {suggestions.length > 0 ? (
          <View className="rounded-xl border border-border bg-surface px-3 py-2">
            <Muted>{tm('placeSuggestions')}</Muted>
            {suggestions.map((row, index) => (
              <Pressable
                key={`${row.placeName}-${row.lat}-${row.lon}-${index}`}
                onPress={() => applySuggestion(row)}
                accessibilityRole="button"
                className="min-h-11 justify-center border-t border-border py-2 active:opacity-70"
              >
                <Text>{row.placeName}</Text>
                <Muted>{[row.street, row.neighborhood, row.city, row.state].filter(Boolean).join(', ')}</Muted>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <AddressFields title={t('address')} value={address} onChange={setAddress} />

      <Field
        label={t('section')}
        value={section}
        onChangeText={setSection}
        placeholder={t('sectionPlaceholder')}
        maxLength={MAX_SECTION}
        error={errors.section ?? serverErrors.section}
      />

      <View className="gap-3">
        <Heading>{t('coordinates')}</Heading>
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

      <Field
        label={t('notes')}
        value={notes}
        onChangeText={setNotes}
        placeholder={t('notesPlaceholder')}
        multiline
        maxLength={MAX_NOTES}
        hint={`${notes.length}/${MAX_NOTES}`}
        error={errors.notes ?? serverErrors.notes}
      />

      <FormError message={formError ?? remove.formError} />

      {data.isCreating ? null : (
        <Button label={t('deleteLocation')} icon="trash-outline" variant="danger-soft" onPress={() => void destroy()} loading={remove.pending} disabled={pending} fullWidth />
      )}
    </Screen>
  )
}

export default function GeolocationEditScreen() {
  const user = useRequireAppSession()
  const id = useParam('id')
  const t = useT('Geolocation')
  const query = useView('app', contentKey(id, 'geolocationEdit'), () => appApi.geolocationEdit(id), { ...EDIT_QUERY, enabled: !!user })
  if (!user) return <LoadingState />
  return (
    <>
      <Stack.Screen options={{ title: query.data ? (query.data.isCreating ? t('addTitle') : t('editTitle')) : '' }} />
      <QueryView query={query}>{(data) => <GeolocationForm data={data} />}</QueryView>
    </>
  )
}
