import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { absoluteUrl, type ActionResponse } from '@/api/client'
import { useSession } from '@/auth/session'
import { countryName } from '@/features/app/countries'
import { useErrorMessage } from '@/i18n'
import { currentLocale } from '@/i18n/locale'
import { formatDate } from '@/lib/format'
import { useInvalidate } from '@/lib/query'
import { IconButton, Muted, Text, useNotify, type IconName } from '@/ui'

/** One route parameter as a plain string ('' when absent). */
export function useParam(name: string): string {
  const params = useLocalSearchParams<Record<string, string | string[]>>()
  const value = params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

/**
 * Query key of one content view. Everything of a profile lives under
 * ['profile', id]; the viewer is part of the key because the same view answers
 * a visitor (preview slice) and a signed-in viewer differently.
 */
export const contentKey = (profileId: string, ...rest: string[]): string[] => [
  'profile',
  profileId,
  ...rest,
  useSession.getState().sessions.app?.user.id ?? 'visitor',
]

/** Edit forms initialise their state from the view once, so they never start from a cached copy. */
export const EDIT_QUERY = { gcTime: 0, staleTime: 0 } as const

/** After a save: refresh every view of the profile (content + the profile page) and the account quotas. */
export function useContentInvalidate(profileId: string) {
  const invalidate = useInvalidate('app')
  return () => invalidate(['profile', profileId], ['me'], ['home'])
}

/** Where a form goes when it is done: back after a save, up to a list after a delete. */
export function useLeave() {
  const router = useRouter()
  return {
    back: (fallback: string) => (router.canGoBack() ? router.back() : router.replace(fallback)),
    to: (path: string) => (router.canGoBack() ? router.dismissTo(path) : router.replace(path)),
  }
}

/** Media URLs are absolute today; a relative one is resolved against the APP origin. */
export const mediaUri = (url: string) => (/^(https?|file|content|blob|data|ph|assets-library):/i.test(url) ? url : absoluteUrl('app', url))

export type FieldErrors = Record<string, string | undefined>

/**
 * Runs a save/delete action and keeps what the server answered: the failure
 * message, per-field errors and the pending flag.
 */
export function useSubmit() {
  const notify = useNotify()
  const errorMessage = useErrorMessage()
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})

  async function submit<T>(
    call: () => Promise<ActionResponse<T>>,
    options: { success?: string; onSuccess?: () => void | Promise<void> } = {},
  ): Promise<boolean> {
    setPending(true)
    setFormError(null)
    setServerErrors({})
    try {
      const response = await call()
      if (!response.ok) {
        setFormError(response.message)
        const fields = response.fieldErrors ?? {}
        setServerErrors(Object.fromEntries(Object.entries(fields).map(([key, messages]) => [key, messages?.[0]])))
        notify.error(response.message)
        return false
      }
      if (options.success) notify.success(options.success)
      await options.onSuccess?.()
      return true
    } catch (error) {
      setFormError(errorMessage(error))
      notify.error(error)
      return false
    } finally {
      setPending(false)
    }
  }

  return { submit, pending, formError, serverErrors, setFormError }
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <View className="rounded-xl border border-danger p-3" accessibilityRole="alert">
      <Text className="text-sm text-danger">{message}</Text>
    </View>
  )
}

export { SignUpPrompt } from '@/features/app/SignUpPrompt'

/** Header action for `Stack.Screen options.headerRight`. */
export function HeaderAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <IconButton icon={icon} label={label} onPress={onPress} />
}

/** "used / max" with the counter turning red at the limit. */
export function Counter({ used, max }: { used: number; max: number }) {
  return <Muted className={used > max ? 'text-danger' : undefined}>{`${used}/${max}`}</Muted>
}

const coordinateFormat = () => new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: 4, maximumFractionDigits: 4 })

export function formatCoordinates(lat: number, lon: number): string {
  const format = coordinateFormat()
  return `${format.format(lat)}  ${format.format(lon)}`
}

export const hasCoordinates = (lat: number, lon: number) => lat !== 0 || lon !== 0

/** A maps link that opens the native maps app (or the browser) at a point. */
export const mapsUrl = (lat: number, lon: number) => `https://www.google.com/maps?q=${lat},${lon}`

/** Parse a typed coordinate; accepts a decimal comma. Null when it is not a number in range. */
export function parseCoordinate(text: string, limit: number): number | null {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '') return 0
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null
}

/** m:ss for a video length. */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/** Date-only values (place dates) are shown in UTC so they never shift a day. */
export function formatDateRange(start: string | null, end: string | null): string | null {
  const from = start ? formatDate(start, { utc: true }) : ''
  const to = end ? formatDate(end, { utc: true }) : ''
  if (from && to) return `${from} — ${to}`
  return from || to || null
}

/** "Neighbourhood, City, State, Country" with the country shown by name. */
export function addressLine(parts: { neighborhood?: string | null; city?: string | null; state?: string | null; country?: string | null }): string {
  return [parts.neighborhood, parts.city, parts.state, countryName(parts.country, currentLocale())].filter(Boolean).join(', ')
}
