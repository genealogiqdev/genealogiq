import { beforeEach, describe, expect, it, vi } from 'vitest'
const { db, verify, grant, revoke } = vi.hoisted(() => ({ db: { $transaction: vi.fn(), appUser: { findFirst: vi.fn() } },
  verify: vi.fn(), grant: vi.fn(), revoke: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/consumer-access', () => ({ verifyConsumerAdmin: verify }))
vi.mock('@genealogiq/services/partner-consumer-access', () => ({ grantPartnerConsumerPremium: grant, revokePartnerConsumerPremium: revoke,
  PartnerConsumerAccessError: class extends Error { constructor(readonly reason: string) { super(reason) } } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'pt-BR', getTranslations: async () => (key: string) => key }))
import { grantPartnerPremium, revokePartnerPremium } from './partner-consumer.actions'
const requestId = '05a067ee-0814-4182-9e6b-cd9f31969cc3'
beforeEach(() => {
  vi.resetAllMocks(); verify.mockResolvedValue({ user: { id: 'platform-operator' } })
  db.$transaction.mockImplementation((run) => run(db)); db.appUser.findFirst.mockResolvedValue({ tenantId: 'stored-tenant' })
  grant.mockResolvedValue({ alreadyGranted: false }); revoke.mockResolvedValue({ alreadyRevoked: false })
})
describe('BMS partner Premium management', () => {
  it('derives affiliation from the database and uses the live platform operator', async () => {
    expect((await grantPartnerPremium('customer', requestId)).ok).toBe(true)
    expect(grant).toHaveBeenCalledWith(db, { appUserId: 'customer', requestId, actorId: 'platform-operator', tenantId: 'stored-tenant', currency: 'BRL' })
    expect((await revokePartnerPremium('customer', 'confirmed-grant')).ok).toBe(true)
    expect(revoke).toHaveBeenCalledWith(db, { appUserId: 'customer', grantId: 'confirmed-grant', actorId: 'platform-operator', tenantId: 'stored-tenant' })
  })
  it('rejects tenant staff and stale platform privileges before reading or writing', async () => {
    verify.mockRejectedValue(new Error('FORBIDDEN'))
    await expect(grantPartnerPremium('customer', requestId)).rejects.toThrow('FORBIDDEN')
    await expect(revokePartnerPremium('customer', 'grant')).rejects.toThrow('FORBIDDEN')
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('keeps independent customers in the existing direct-access workflow', async () => {
    db.appUser.findFirst.mockResolvedValue({ tenantId: null })
    expect(await grantPartnerPremium('independent', requestId)).toEqual({ ok: false, message: 'errors.customer-unavailable' })
    expect(grant).not.toHaveBeenCalled()
  })
})
