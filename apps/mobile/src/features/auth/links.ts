import { SYSTEMS, type SystemId } from '@/config'

/**
 * Accept only an in-app path as a post-sign-in destination: it must start with
 * a single "/" (so "//host" and absolute URLs are rejected), matching the web's
 * `safeCallback` rule.
 */
export function safeInternalPath(value: string | string[] | null | undefined): string | null {
  const path = Array.isArray(value) ? value[0] : value
  if (typeof path !== 'string') return null
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null
  return path
}

export function systemFromParam(value: string | string[] | null | undefined, fallback: SystemId): SystemId {
  const system = Array.isArray(value) ? value[0] : value
  return system && (SYSTEMS as readonly string[]).includes(system) ? (system as SystemId) : fallback
}

/** Password rule per system: Genealogiq needs 8 characters; staff systems also need mixed character classes. */
export function passwordProblem(system: SystemId, password: string): 'short' | 'weak' | null {
  if (password.length < 8) return 'short'
  if (system === 'app') return null
  const strong = /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^a-zA-Z0-9]/.test(password)
  return strong ? null : 'weak'
}
