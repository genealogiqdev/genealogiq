import { useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import type { SystemId } from '@/config'

/**
 * Screen data. Keys always start with the system id so signing out of one
 * system can drop exactly that system's cache (`removeQueries({ queryKey: [system] })`).
 */
export function useView<T>(
  system: SystemId,
  key: readonly unknown[],
  load: () => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>,
): UseQueryResult<T> {
  return useQuery({ queryKey: [system, ...key], queryFn: load, ...options })
}

/** Invalidate cached views of one system by key prefix after a mutation. */
export function useInvalidate(system: SystemId) {
  const client = useQueryClient()
  return (...keys: readonly unknown[][]) =>
    Promise.all(
      (keys.length > 0 ? keys : [[]]).map((key) => client.invalidateQueries({ queryKey: [system, ...key] })),
    )
}
