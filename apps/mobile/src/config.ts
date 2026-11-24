import { Platform } from 'react-native'

export type SystemId = 'app' | 'seq' | 'bms'

export const SYSTEMS: readonly SystemId[] = ['app', 'seq', 'bms']

// The Android emulator reaches the development machine through 10.0.2.2.
const devHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost'

function origin(configured: string | undefined, devPort: number, production: string): string {
  const value = configured?.trim()
  if (value) return value.replace(/\/+$/, '')
  return __DEV__ ? `http://${devHost}:${devPort}` : production
}

/** One backend per system. Override with EXPO_PUBLIC_*_URL (see .env.example). */
export const API_ORIGINS: Record<SystemId, string> = {
  app: origin(process.env.EXPO_PUBLIC_APP_URL, 3000, 'https://genealogiq.com.br'),
  bms: origin(process.env.EXPO_PUBLIC_BMS_URL, 3001, 'https://bms.genealogiq.com.br'),
  seq: origin(process.env.EXPO_PUBLIC_SEQUOIA_URL, 3002, 'https://sequoia.genealogiq.com.br'),
}

/** Hosts whose links open in the app, mapped to the system they belong to. */
export const LINK_HOSTS: Record<string, SystemId> = {
  'genealogiq.com.br': 'app',
  'www.genealogiq.com.br': 'app',
  'bms.genealogiq.com.br': 'bms',
  'sequoia.genealogiq.com.br': 'seq',
}

export const SYSTEM_META: Record<SystemId, { name: string; home: string; canSignUp: boolean }> = {
  app: { name: 'Genealogiq', home: '/home', canSignUp: true },
  seq: { name: 'Sequoia', home: '/seq/dashboard', canSignUp: false },
  bms: { name: 'BMS', home: '/bms/dashboard', canSignUp: false },
}

export const SUPPORTED_LOCALES = ['en-US', 'pt-BR', 'es-MX'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'pt-BR'
