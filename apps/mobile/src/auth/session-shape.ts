// Pure checks on session data: no React Native imports, so they are unit-testable.

export interface SessionUser {
  id: string
  name: string
  email: string
  image: string | null
  role: string
  customerId?: string
}

export interface StoredSession {
  token: string
  expiresAt: string
  user: SessionUser
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0

/**
 * A session the app may act on: a token, a parseable expiry and a user with an
 * id and a role. Anything else (including what a server that does not run the
 * mobile API answers) is rejected, so a system is never marked signed in
 * without a usable token.
 */
export function toStoredSession(value: unknown): StoredSession | null {
  if (typeof value !== 'object' || value === null) return null
  const { token, expiresAt, user } = value as Record<string, unknown>
  if (!isNonEmptyString(token) || !isNonEmptyString(expiresAt) || Number.isNaN(Date.parse(expiresAt))) return null
  if (typeof user !== 'object' || user === null) return null
  const { id, name, email, image, role, customerId } = user as Record<string, unknown>
  if (!isNonEmptyString(id) || !isNonEmptyString(role)) return null
  return {
    token,
    expiresAt,
    user: {
      id,
      role,
      name: typeof name === 'string' ? name : '',
      email: typeof email === 'string' ? email : '',
      image: typeof image === 'string' ? image : null,
      ...(isNonEmptyString(customerId) ? { customerId } : {}),
    },
  }
}

export function isLiveSession(session: StoredSession | null | undefined, now: number = Date.now()): session is StoredSession {
  return !!session && Date.parse(session.expiresAt) > now
}
