import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { AppRole } from '@/api/app'
import { plainStorage } from '@/lib/storage'
import { useAppUser } from './session'

/** Raw data of a visited profile; labels are formatted at render time in the active locale. */
export interface RecentProfile {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  role: AppRole
  birthDate: string | null
  deathDate: string | null
  birthYear: number | null
  deathYear: number | null
  birthPlace: string | null
  birthCountry: string | null
  petSpecies: string | null
  petBreed: string | null
}

const MAX_RECENT = 12
const storageKey = (userId: string | null) => `gq.app.recent.${userId ?? 'visitor'}`
const queryKey = (userId: string | null) => ['app', 'recentlyViewed', userId ?? 'visitor'] as const

async function read(userId: string | null): Promise<RecentProfile[]> {
  const stored = await plainStorage.get<RecentProfile[]>(storageKey(userId))
  return Array.isArray(stored) ? stored.filter((entry) => entry && typeof entry.id === 'string') : []
}

/** Profiles opened on this device, newest first. Kept per account, never sent to the server. */
export function useRecentlyViewed() {
  const userId = useAppUser()?.id ?? null
  return useQuery({ queryKey: queryKey(userId), queryFn: () => read(userId), staleTime: 0 })
}

/** Returns a recorder to call when a profile is opened, and a way to clear the list. */
export function useRecordRecentlyViewed() {
  const userId = useAppUser()?.id ?? null
  const client = useQueryClient()
  const record = useCallback(
    async (profile: RecentProfile) => {
      // The viewer's own profile is not a "visit".
      if (profile.id === userId) return
      const current = await read(userId)
      const next = [profile, ...current.filter((entry) => entry.id !== profile.id)].slice(0, MAX_RECENT)
      await plainStorage.set(storageKey(userId), next)
      client.setQueryData(queryKey(userId), next)
    },
    [client, userId],
  )
  const forget = useCallback(
    async (profileId: string) => {
      const next = (await read(userId)).filter((entry) => entry.id !== profileId)
      await plainStorage.set(storageKey(userId), next)
      client.setQueryData(queryKey(userId), next)
    },
    [client, userId],
  )
  return { record, forget }
}
