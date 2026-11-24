import { describe, expect, it } from 'vitest'
import { isLiveSession, toStoredSession } from './session-shape'

describe('stored sessions', () => {
  const valid = { token: 't', expiresAt: '2026-12-24T00:00:00.000Z', user: { id: 'u1', name: 'Ana', email: 'a@b.co', image: null, role: 'APP_USER' } }

  it('accepts a complete session and fills optional fields', () => {
    expect(toStoredSession(valid)).toEqual(valid)
    expect(toStoredSession({ ...valid, user: { id: 'u1', role: 'OWNER' } })?.user).toEqual({ id: 'u1', role: 'OWNER', name: '', email: '', image: null })
  })

  it('rejects what a corrupted store or a wrong server could hold', () => {
    for (const bad of [null, undefined, 'null', 42, {}, { ...valid, token: '' }, { ...valid, expiresAt: 'later' }, { ...valid, user: null }, { ...valid, user: { id: 'u1' } }]) {
      expect(toStoredSession(bad)).toBeNull()
    }
  })

  it('is live only before its expiry', () => {
    const now = Date.parse('2026-11-24T12:00:00Z')
    expect(isLiveSession(toStoredSession(valid), now)).toBe(true)
    expect(isLiveSession(toStoredSession({ ...valid, expiresAt: '2026-11-24T11:59:59Z' }), now)).toBe(false)
    expect(isLiveSession(null, now)).toBe(false)
  })
})
