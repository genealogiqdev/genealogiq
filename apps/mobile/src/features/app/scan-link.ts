import { API_ORIGINS, LINK_HOSTS } from '@/config'

function appHosts(): Set<string> {
  const hosts = new Set(Object.entries(LINK_HOSTS).filter(([, system]) => system === 'app').map(([host]) => host))
  try {
    hosts.add(new URL(API_ORIGINS.app).hostname.toLowerCase())
  } catch {
    // A malformed override simply adds no host.
  }
  return hosts
}

const PROFILE_PATH = /^\/profile\/([A-Za-z0-9_-]{1,64})\/?$/
const QR_PATH = /^\/qr\/([A-Za-z0-9-]{1,64})\/?$/

/**
 * The in-app path a scanned code opens, or null when it is not a Genealogiq
 * plaque link. Only `https` links on a Genealogiq host whose path is exactly
 * `/profile/<id>` or `/qr/<code>` are accepted; the query string is dropped.
 */
export function scannedLinkPath(raw: string, hosts: ReadonlySet<string> = appHosts()): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (!hosts.has(url.hostname.toLowerCase())) return null
  const profile = PROFILE_PATH.exec(url.pathname)
  if (profile) return `/profile/${profile[1]}`
  const qr = QR_PATH.exec(url.pathname)
  if (qr) return `/qr/${normalizeGenCode(qr[1])}`
  return null
}

/** Canonical GenCode: upper-case letters and digits only (drops hyphens, spaces and pasted noise). */
export function normalizeGenCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** GQL7K2P9MNRX4FT2 → GQL7-K2P9-MNRX-4FT2 */
export function formatGenCode(raw: string): string {
  return raw.replace(/(.{4})/g, '$1-').replace(/-$/, '').slice(0, 19)
}
