import * as Location from 'expo-location'
import { useState } from 'react'
import type { Translate } from '@/i18n'
import { useNotify } from '@/ui'

/**
 * "Use my location": asks for the foreground permission, reads one position
 * and reports the outcome with the module's own toast texts
 * (`toasts.locationDetected|locationDenied|locationUnavailable|locationTimeout`).
 */
export function useMyLocation(t: Translate) {
  const notify = useNotify()
  const [locating, setLocating] = useState(false)

  async function locate(): Promise<{ lat: number; lon: number } | null> {
    setLocating(true)
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (!permission.granted) {
        notify.error(t('toasts.locationDenied'))
        return null
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        notify.error(t('toasts.locationUnavailable'))
        return null
      }
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000))
      const position = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeout])
      if (!position) {
        notify.error(t('toasts.locationTimeout'))
        return null
      }
      notify.success(t('toasts.locationDetected'))
      return {
        lat: Number(position.coords.latitude.toFixed(6)),
        lon: Number(position.coords.longitude.toFixed(6)),
      }
    } catch {
      notify.error(t('toasts.locationUnavailable'))
      return null
    } finally {
      setLocating(false)
    }
  }

  return { locate, locating }
}
