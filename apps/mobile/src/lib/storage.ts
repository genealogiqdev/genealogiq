import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

// expo-secure-store has no web implementation; the web build exists only as a
// development preview, so it falls back to AsyncStorage there.
const secureAvailable = Platform.OS !== 'web'

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    try {
      return secureAvailable ? await SecureStore.getItemAsync(key) : await AsyncStorage.getItem(key)
    } catch {
      return null
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (secureAvailable) await SecureStore.setItemAsync(key, value)
    else await AsyncStorage.setItem(key, value)
  },
  async remove(key: string): Promise<void> {
    if (secureAvailable) await SecureStore.deleteItemAsync(key)
    else await AsyncStorage.removeItem(key)
  },
}

export const plainStorage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value))
  },
  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key)
  },
}
