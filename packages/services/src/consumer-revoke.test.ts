import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { tx, db } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    appSale: { updateMany: vi.fn() },
    consumerAccessGrant: { findUnique: vi.fn(), update: vi.fn() },
  }
  return { tx, db: { $transaction: vi.fn() } }
})
vi.mock('server-only', () => ({}))
vi.mock('@genealogiq/db', () => ({ prisma: db }))
import { revokeConsumerPremium } from './consumer-access'

const now = new Date('2026-10-09T15:00:00Z')
const gift = {
  id: 'gift-1', recipientId: 'consumer-1', resultId: 'gift-sale-1', revokedAt: null,
  expiresAt: new Date('2027-10-09T15:00:00Z'),
  appUser: { id: 'consumer-1', role: 'APP_USER', tenantId: null, isActive: true, email: 'ana@genealogiq.test' },
  appSale: {
    id: 'gift-sale-1', appUserId: 'consumer-1', tenantId: null, value: 0, status: 'active',
    stripeSubscriptionId: null, stripePriceId: null, couponRedemption: null,
    currentPeriodEnd: new Date('2027-10-09T15:00:00Z'), subscription: { code: 'PREMIUM' },
  },
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  db.$transaction.mockImplementation((fn) => fn(tx))
  tx.consumerAccessGrant.findUnique.mockResolvedValue(gift)
  tx.appSale.updateMany.mockResolvedValue({ count: 1 })
})
afterEach(() => vi.useRealTimers())

describe('revoke a named consumer Premium gift', () => {
  it('cancels only that zero-value gift and records the operator without rewriting the granted period', async () => {
    expect(await revokeConsumerPremium('gift-1', 'admin-1')).toEqual({ alreadyRevoked: false })
    expect(tx.appSale.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: 'gift-sale-1', appUserId: 'consumer-1', tenantId: null, value: 0,
        stripeSubscriptionId: null, stripePriceId: null, couponRedemption: { is: null },
        subscription: { code: 'PREMIUM' }, status: { in: ['active', 'trialing'] },
        currentPeriodEnd: new Date('2027-10-09T15:00:00Z'),
      },
      data: { status: 'canceled', cancelAtPeriodEnd: true, canceledAt: now, endedAt: now },
    })
    expect(tx.consumerAccessGrant.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'gift-1' }, data: { revokedAt: now, revokedById: 'admin-1' },
    })
  })

  it('locks the stored recipient before rereading the gift, without accepting a submitted sale or recipient', async () => {
    await revokeConsumerPremium('gift-1', 'admin-1')
    expect(tx.consumerAccessGrant.findUnique.mock.calls[0][0]).toEqual({ where: { id: 'gift-1' }, select: { recipientId: true } })
    expect(tx.$queryRaw.mock.calls[0][0].join('?')).toBe('SELECT id FROM app_users WHERE id = ? FOR UPDATE')
    expect(tx.$queryRaw.mock.calls[0][1]).toBe('consumer-1')
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.consumerAccessGrant.findUnique.mock.invocationCallOrder[1])
  })

  it('keeps the first revocation audit on retry, even if a later gift or deleted account exists', async () => {
    tx.consumerAccessGrant.findUnique.mockResolvedValue({ ...gift, revokedAt: new Date('2026-10-08T12:00:00Z'), appUser: null, appSale: null })
    expect(await revokeConsumerPremium('gift-1', 'different-admin')).toEqual({ alreadyRevoked: true })
    expect(tx.appSale.updateMany).not.toHaveBeenCalled()
    expect(tx.consumerAccessGrant.update).not.toHaveBeenCalled()
  })

  it('can remove a gift from an inactive independent customer without an email', async () => {
    tx.consumerAccessGrant.findUnique.mockResolvedValue({ ...gift, appUser: { ...gift.appUser, isActive: false, email: null } })
    expect(await revokeConsumerPremium('gift-1', 'admin-1')).toEqual({ alreadyRevoked: false })
  })

  it.each([
    [null, 'grant-unavailable'],
    [{ ...gift, appUser: null }, 'recipient-unavailable'],
    [{ ...gift, appUser: { ...gift.appUser, role: 'APP_MEMO' } }, 'recipient-unavailable'],
    [{ ...gift, appUser: { ...gift.appUser, tenantId: 'partner-1' } }, 'partner-account'],
    [{ ...gift, appSale: null }, 'grant-unavailable'],
    [{ ...gift, expiresAt: now }, 'grant-unavailable'],
  ])('rejects a missing, expired or out-of-scope gift before any write', async (row, reason) => {
    tx.consumerAccessGrant.findUnique.mockResolvedValue(row)
    await expect(revokeConsumerPremium('gift-1', 'admin-1')).rejects.toMatchObject({ reason })
    expect(tx.appSale.updateMany).not.toHaveBeenCalled()
    expect(tx.consumerAccessGrant.update).not.toHaveBeenCalled()
  })

  it.each([
    { id: 'another-sale' }, { appUserId: 'another-consumer' }, { tenantId: 'partner-1' },
    { value: 150 }, { value: null }, { stripeSubscriptionId: 'sub_paid' }, { stripePriceId: 'price_paid' },
    { couponRedemption: { id: 'receipt-1' } }, { subscription: { code: 'OTHER' } },
    { status: 'canceled' }, { currentPeriodEnd: null }, { currentPeriodEnd: new Date('2028-10-09T15:00:00Z') },
  ])('preserves a sale that is no longer the original live complimentary Premium: %j', async (override) => {
    tx.consumerAccessGrant.findUnique.mockResolvedValue({ ...gift, appSale: { ...gift.appSale, ...override } })
    await expect(revokeConsumerPremium('gift-1', 'admin-1')).rejects.toMatchObject({ reason: 'grant-unavailable' })
    expect(tx.appSale.updateMany).not.toHaveBeenCalled()
    expect(tx.consumerAccessGrant.update).not.toHaveBeenCalled()
  })

  it('rejects a sale changed by another writer instead of recording a false cancellation', async () => {
    tx.appSale.updateMany.mockResolvedValue({ count: 0 })
    await expect(revokeConsumerPremium('gift-1', 'admin-1')).rejects.toMatchObject({ reason: 'grant-unavailable' })
    expect(tx.consumerAccessGrant.update).not.toHaveBeenCalled()
  })

  it.each([['', 'admin'], ['gift-1', ''], ['x'.repeat(129), 'admin']])('rejects invalid identifiers before a transaction', async (grantId, actor) => {
    await expect(revokeConsumerPremium(grantId, actor)).rejects.toMatchObject({ reason: 'invalid-data' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
