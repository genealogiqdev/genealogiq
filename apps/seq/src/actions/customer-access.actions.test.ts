import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, verify, grant, revoke, sell, deliver } = vi.hoisted(() => ({ db: { $transaction: vi.fn() },
  verify: vi.fn(), grant: vi.fn(), revoke: vi.fn(), sell: vi.fn(), deliver: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/customer-access', () => ({ verifyCustomerAccessAdmin: verify }))
vi.mock('@genealogiq/services/partner-consumer-access', () => ({ grantPartnerConsumerPremium: grant, revokePartnerConsumerPremium: revoke,
  recordCustomerGenCodeSale: sell, PartnerConsumerAccessError: class extends Error {} }))
vi.mock('@genealogiq/services/email-outbox', () => ({ deliverEmail: deliver }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'pt-BR', getTranslations: async () => (key: string) => key }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { grantCustomerPremium, revokeCustomerPremium, sellCustomerGenCode } from './customer-access.actions'

const requestId = '05a067ee-0814-4182-9e6b-cd9f31969cc3'
beforeEach(() => {
  vi.resetAllMocks()
  verify.mockResolvedValue({ customerId: 'verified-tenant', user: { id: 'verified-operator' } })
  db.$transaction.mockImplementation((run) => run(db))
  grant.mockResolvedValue({ alreadyGranted: false }); revoke.mockResolvedValue({ alreadyRevoked: false })
  sell.mockResolvedValue({ genCode: 'AAAA-BBBB-CCCC-DDDD', emailId: 'receipt', alreadySold: false })
  deliver.mockResolvedValue('sent')
})
describe('SEQ customer access actions', () => {
  it('uses the verified tenant/actor and never records a sale for a Premium toggle', async () => {
    expect(await grantCustomerPremium('customer', requestId)).toEqual({ ok: true, message: 'granted' })
    expect(grant).toHaveBeenCalledWith(db, { appUserId: 'customer', requestId, tenantId: 'verified-tenant', actorId: 'verified-operator', currency: 'BRL' })
    expect(await revokeCustomerPremium('customer', 'original-gift')).toEqual({ ok: true, message: 'revoked' })
    expect(revoke).toHaveBeenCalledWith(db, { appUserId: 'customer', grantId: 'original-gift', tenantId: 'verified-tenant', actorId: 'verified-operator' })
    expect(sell).not.toHaveBeenCalled(); expect(deliver).not.toHaveBeenCalled()
  })
  it('requires live administration on all three mutations', async () => {
    verify.mockRejectedValue(new Error('FORBIDDEN'))
    await expect(grantCustomerPremium('customer', requestId)).rejects.toThrow('FORBIDDEN')
    await expect(revokeCustomerPremium('customer', 'gift')).rejects.toThrow('FORBIDDEN')
    await expect(sellCustomerGenCode('customer', 'AAAA-BBBB-CCCC-DDDD', requestId)).rejects.toThrow('FORBIDDEN')
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('rejects a blank existing-customer code and malformed request before a transaction', async () => {
    expect((await sellCustomerGenCode('customer', ' ', requestId)).ok).toBe(false)
    expect((await grantCustomerPremium('customer', 'bad-request')).ok).toBe(false)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('commits a specific-code sale and reports pending mail as a completed operation', async () => {
    deliver.mockRejectedValue(new Error('mail unavailable'))
    expect(await sellCustomerGenCode('customer', ' aaaa-bbbb-cccc-dddd ', requestId)).toEqual({ ok: true, message: 'soldEmailPending' })
    expect(sell).toHaveBeenCalledWith(db, { appUserId: 'customer', genCode: 'AAAA-BBBB-CCCC-DDDD', requestId,
      tenantId: 'verified-tenant', actorId: 'verified-operator', currency: 'BRL' })
    expect(db.$transaction).toHaveBeenCalledOnce()
  })
})
