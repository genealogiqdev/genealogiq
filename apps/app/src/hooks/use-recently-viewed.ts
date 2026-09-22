import { useSyncExternalStore } from "react"

// v2: stores RAW profile data (dates as ISO strings, a role flag) instead of the
// pre-formatted display strings. The subtitle, death/birth metric and status badge
// are now formatted at render time under the active locale (see RecentlyViewedSection),
// so switching language re-localizes already-viewed cards. Bumping the key from v1
// drops the stale pre-formatted cache.
// v3: adds birthYear/deathYear. The caller now passes an already-redacted profile
// (see queries/profile.ts's redactLivingProfile) — birthDate/deathDate are null
// for a redacted living person, so the year fields are the only display fallback.
const KEY = "giq:recently-viewed:v4"
const MAX = 6

export interface RecentProfile {
  id: string
  firstName: string
  lastName: string
  birthPlace: string | null
  birthCountry: string | null
  isMemorialized: boolean
  role: string
  petSpecies: string | null
  petBreed: string | null
  birthDate: string | null // ISO 8601 — null when redacted (see birthYear)
  deathDate: string | null // ISO 8601 — null when redacted (see deathYear)
  birthYear: number | null
  deathYear: number | null
  avatarUrl: string | null
  viewedAt: number
}

// What recordView accepts — viewedAt is stamped on write.
export type RecentProfileInput = Omit<RecentProfile, "viewedAt">

// Stable empty reference for SSR snapshot — must never change
const EMPTY: RecentProfile[] = []

// Module-level cache so getClientSnapshot returns a stable reference
let clientSnapshot: RecentProfile[] | null = null

// Guards against stale/garbage entries (e.g. a half-written shape from an older
// deploy) so the render path never reads undefined fields off a malformed item.
function isRecentProfile(x: unknown): x is RecentProfile {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as RecentProfile).id === "string" &&
    typeof (x as RecentProfile).firstName === "string" &&
    typeof (x as RecentProfile).lastName === "string"
  )
}

function read(): RecentProfile[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter(isRecentProfile) : EMPTY
  } catch {
    return EMPTY
  }
}

function getClientSnapshot(): RecentProfile[] {
  if (clientSnapshot === null) clientSnapshot = read()
  return clientSnapshot
}

export function recordView(profile: RecentProfileInput) {
  const existing = read().filter((p) => p.id !== profile.id)
  const updated: RecentProfile[] = [{ ...profile, viewedAt: Date.now() }, ...existing].slice(0, MAX)
  localStorage.setItem(KEY, JSON.stringify(updated))
  clientSnapshot = null // invalidate so next read picks up fresh data
}

export function useRecentlyViewed() {
  return useSyncExternalStore(
    () => () => {},   // no subscription needed — data is read-once per session
    getClientSnapshot,
    () => EMPTY,      // SSR: always returns the same stable reference
  )
}
