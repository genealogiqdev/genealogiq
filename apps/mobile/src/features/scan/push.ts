import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { scanApi } from '@/api/scan'

export type PushRegistration =
  | { token: string }
  /**
   * unsupported: web or a simulator. denied: the user refused the permission.
   * unavailable: no push token could be obtained or stored (for example a build
   * without an EAS project id, or the server refused it).
   */
  | { token: null; reason: 'unsupported' | 'denied' | 'unavailable' }

/**
 * Ask for notification permission and register this device's Expo push token
 * with the Genealogiq account. Call only from an explicit user action. Never
 * throws: every failure is a quiet `{ token: null }`.
 */
export async function registerForPush(channelName = 'Genealogiq'): Promise<PushRegistration> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return { token: null, reason: 'unsupported' }
  if (!Device.isDevice) return { token: null, reason: 'unsupported' }
  try {
    // Loaded on demand: the module has native side effects that web and tests do not need.
    const Notifications = await import('expo-notifications')

    if (Platform.OS === 'android') {
      // Android 13+ only shows the permission prompt once a channel exists.
      await Notifications.setNotificationChannelAsync('default', {
        name: channelName,
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    let permission = await Notifications.getPermissionsAsync()
    if (!permission.granted && permission.canAskAgain !== false) permission = await Notifications.requestPermissionsAsync()
    if (!permission.granted) return { token: null, reason: 'denied' }

    const projectId: string | undefined =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId
    // Without an EAS project id this throws; the catch below turns that into "unavailable".
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    if (!token) return { token: null, reason: 'unavailable' }

    const response = await scanApi.registerDevicePushToken(token, Platform.OS)
    return response.ok ? { token } : { token: null, reason: 'unavailable' }
  } catch {
    return { token: null, reason: 'unavailable' }
  }
}
