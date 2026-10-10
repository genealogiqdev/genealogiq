import { beforeEach, describe, expect, it, vi } from 'vitest'

const { revoke, verify, refresh, ServiceError } = vi.hoisted(() => {
  class ServiceError extends Error { constructor(readonly reason: string) { super(reason) } }
  return { revoke: vi.fn(), verify: vi.fn(), refresh: vi.fn(), ServiceError }
})
vi.mock('@/lib/consumer-access', () => ({ verifyConsumerAdmin: verify }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/email', () => ({ sendConsumerPremiumEmail: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: refresh }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('@genealogiq/services/consumer-access', () => ({ revokeConsumerPremium: revoke, ConsumerAccessError: ServiceError }))
import { revokeConsumerAccess } from './consumer.actions'

beforeEach(() => {
  vi.resetAllMocks()
  verify.mockResolvedValue({ user: { id: 'verified-admin' } })
  revoke.mockResolvedValue({ alreadyRevoked: false })
})

describe('BMS consumer Premium revocation action', () => {
  it('requires current platform privilege before any revocation', async () => {
    verify.mockRejectedValue(new Error('FORBIDDEN'))
    await expect(revokeConsumerAccess('gift-1')).rejects.toThrow('FORBIDDEN')
    expect(revoke).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it.each(['', ' ', 'x'.repeat(129), null, { grantId: 'gift-1', revokedById: 'attacker' }])('rejects malformed gift identity: %j', async (id) => {
    expect(await revokeConsumerAccess(id as string)).toEqual({ ok: false, message: 'errors.grant-unavailable' })
    expect(revoke).not.toHaveBeenCalled()
  })

  it('uses the session operator and refreshes the directory after committing', async () => {
    expect(await revokeConsumerAccess('gift-1')).toEqual({ ok: true, message: 'revoked' })
    expect(revoke).toHaveBeenCalledExactlyOnceWith('gift-1', 'verified-admin')
    expect(refresh).toHaveBeenCalledExactlyOnceWith('/consumers')
  })

  it('reports a repeated request without suggesting another cancellation', async () => {
    revoke.mockResolvedValue({ alreadyRevoked: true })
    expect(await revokeConsumerAccess('gift-1')).toEqual({ ok: true, message: 'alreadyRevoked' })
  })

  it.each(['grant-unavailable', 'partner-account', 'recipient-unavailable'])('translates %s and does not claim success', async (reason) => {
    revoke.mockRejectedValue(new ServiceError(reason))
    expect(await revokeConsumerAccess('gift-1')).toEqual({ ok: false, message: `errors.${reason}` })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('returns a retryable error without exposing database details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    revoke.mockRejectedValue(new Error('private database details'))
    try {
      expect(await revokeConsumerAccess('gift-1')).toEqual({ ok: false, message: 'errors.revoke-failed' })
      expect(log).toHaveBeenCalledExactlyOnceWith('[consumer-access] revocation transaction failed')
      expect(refresh).not.toHaveBeenCalled()
    } finally { log.mockRestore() }
  })
})
