import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@genealogiq/db'

vi.mock('server-only', () => ({}))
vi.mock('./credits', () => ({ reserveCreditForSale: vi.fn() }))
vi.mock('./email-outbox', () => ({ enqueueEmail: vi.fn(), notificationUrl: () => 'http://app.test/qr/CODE' }))
import { reserveCreditForSale } from './credits'
import { enqueueEmail } from './email-outbox'
import { grantPartnerConsumerPremium, revokePartnerConsumerPremium, recordCustomerGenCodeSale } from './partner-consumer-access'

const db = {
  $queryRaw: vi.fn(), appUser: { findFirst: vi.fn() }, subscription: { findFirst: vi.fn() },
  consumerAccessGrant: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  appSale: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  genCode: { findFirst: vi.fn(), updateMany: vi.fn() }, partnerSubscription: { findFirst: vi.fn() },
}
const tx = db as unknown as Prisma.TransactionClient
const input = { tenantId: 'tenant-1', appUserId: 'buyer-1', actorId: 'operator-1', requestId: 'request-1', currency: 'BRL' }
const now = new Date('2026-10-14T15:00:00Z')
const end = new Date('2027-10-14T15:00:00Z')

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now)
  db.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => sql.join('').includes('FROM gencodes') ? [{ id: 'code-1', genCode: 'AAAA-BBBB-CCCC-DDDD' }] : [])
  db.appUser.findFirst.mockResolvedValue({ id: 'buyer-1', email: 'ana@example.test', firstName: 'Ana', lastName: 'Silva', isActive: true })
  db.consumerAccessGrant.findUnique.mockResolvedValue(null); db.consumerAccessGrant.findFirst.mockResolvedValue(null)
  db.subscription.findFirst.mockResolvedValue({ id: 'premium-1' }); db.appSale.findMany.mockResolvedValue([])
  db.appSale.create.mockResolvedValue({ id: 'sale-1' }); db.consumerAccessGrant.create.mockResolvedValue({ id: 'grant-1' })
  db.appSale.updateMany.mockResolvedValue({ count: 1 }); db.genCode.updateMany.mockResolvedValue({ count: 1 })
  db.genCode.findFirst.mockResolvedValue(null); db.partnerSubscription.findFirst.mockResolvedValue(null)
})
afterEach(() => vi.useRealTimers())

describe('partner customer Premium', () => {
  it('records a finite zero-value year and operator audit in the caller transaction', async () => {
    expect(await grantPartnerConsumerPremium(tx, input)).toEqual({ grantId: 'grant-1', expiresAt: end, alreadyGranted: false })
    expect(db.appSale.create).toHaveBeenCalledWith({ data: {
      appUserId: 'buyer-1', tenantId: 'tenant-1', soldById: 'operator-1', subscriptionId: 'premium-1', value: 0,
      currency: 'BRL', cadence: 'annual', status: 'active', currentPeriodEnd: end, cancelAtPeriodEnd: true,
    }, select: { id: true } })
    expect(db.consumerAccessGrant.create.mock.calls[0][0].data).toMatchObject({ recipientId: 'buyer-1', appUserId: 'buyer-1',
      resultId: 'sale-1', appSaleId: 'sale-1', startsAt: now, expiresAt: end, createdById: 'operator-1' })
    expect(db.genCode.updateMany).not.toHaveBeenCalled()
  })
  it('clamps a leap-day grant to February 28', async () => {
    vi.setSystemTime(new Date('2028-02-29T15:00:00Z'))
    expect((await grantPartnerConsumerPremium(tx, input)).expiresAt).toEqual(new Date('2029-02-28T15:00:00Z'))
  })
  it('does not extend a live grant on a second operator request', async () => {
    db.consumerAccessGrant.findFirst.mockResolvedValue({ id: 'existing', expiresAt: end })
    expect(await grantPartnerConsumerPremium(tx, input)).toEqual({ grantId: 'existing', expiresAt: end, alreadyGranted: true })
    expect(db.appSale.create).not.toHaveBeenCalled()
  })
  it('preserves purchased time and removes only the exact historical test allowance', async () => {
    const testId = `test-premium-${createHash('md5').update('buyer-1').digest('hex')}`
    db.appSale.findMany.mockResolvedValue([
      { id: testId, value: 0, subscriptionId: 'premium-1', currentPeriodEnd: new Date('2099-12-31') },
      { id: 'paid', value: 150, subscriptionId: 'premium-1', currentPeriodEnd: new Date('2027-01-31T15:00:00Z') },
    ])
    expect((await grantPartnerConsumerPremium(tx, input)).expiresAt).toEqual(new Date('2028-01-31T15:00:00Z'))
    expect(db.appSale.update).toHaveBeenCalledExactlyOnceWith({ where: { id: testId },
      data: { status: 'canceled', cancelAtPeriodEnd: true, canceledAt: now, endedAt: now } })
  })
  it('rejects a hidden recurring subscription without changing entitlement', async () => {
    db.appSale.findMany.mockResolvedValue([{ subscriptionId: 'premium-1', stripeSubscriptionId: 'sub-existing' }])
    await expect(grantPartnerConsumerPremium(tx, input)).rejects.toThrow('active-subscription')
    expect(db.appSale.create).not.toHaveBeenCalled()
  })
  it('rejects an unavailable customer before any write and scopes the lookup', async () => {
    db.appUser.findFirst.mockResolvedValue(null)
    await expect(grantPartnerConsumerPremium(tx, input)).rejects.toThrow('customer-unavailable')
    expect(db.appUser.findFirst.mock.calls[0][0].where).toEqual({ id: 'buyer-1', tenantId: 'tenant-1', role: 'APP_USER' })
    expect(db.appSale.create).not.toHaveBeenCalled()
  })
  it('rejects an inactive customer or missing email', async () => {
    for (const customer of [{ isActive: false, email: 'a@example.test' }, { isActive: true, email: null }]) {
      db.appUser.findFirst.mockResolvedValue(customer)
      await expect(grantPartnerConsumerPremium(tx, input)).rejects.toThrow('customer-unavailable')
    }
    expect(db.appSale.create).not.toHaveBeenCalled()
  })
  it('rejects a reused request with a different recipient or a revoked result', async () => {
    db.consumerAccessGrant.findUnique.mockResolvedValue({ requestHash: 'different' })
    await expect(grantPartnerConsumerPremium(tx, input)).rejects.toThrow('request-conflict')
    const hash = createHash('sha256').update(JSON.stringify({ tenantId: 'tenant-1', appUserId: 'buyer-1', actorId: 'operator-1' })).digest('hex')
    db.consumerAccessGrant.findUnique.mockResolvedValue({ requestHash: hash, revokedAt: now })
    await expect(grantPartnerConsumerPremium(tx, input)).rejects.toThrow('grant-revoked')
    expect(db.appSale.create).not.toHaveBeenCalled()
  })
})

function gift() {
  return { id: 'grant-1', recipientId: 'buyer-1', appUserId: 'buyer-1', resultId: 'sale-1', revokedAt: null, expiresAt: end,
    appSale: { id: 'sale-1', tenantId: 'tenant-1', appUserId: 'buyer-1', value: 0, subscription: { code: 'PREMIUM' },
      status: 'active', currentPeriodEnd: end, stripeSubscriptionId: null, stripePriceId: null, couponRedemption: null } }
}
describe('partner Premium revocation', () => {
  it('cancels only the named grant with the original date and records the actor without touching a GenCode', async () => {
    db.consumerAccessGrant.findUnique.mockResolvedValue(gift())
    await revokePartnerConsumerPremium(tx, { ...input, grantId: 'grant-1' })
    expect(db.appSale.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'sale-1', appUserId: 'buyer-1', tenantId: 'tenant-1', value: 0,
      currentPeriodEnd: end, stripeSubscriptionId: null, stripePriceId: null, couponRedemption: { is: null } })
    expect(db.consumerAccessGrant.update).toHaveBeenCalledExactlyOnceWith({ where: { id: 'grant-1' }, data: { revokedAt: now, revokedById: 'operator-1' } })
    expect(db.genCode.updateMany).not.toHaveBeenCalled(); expect(reserveCreditForSale).not.toHaveBeenCalled()
  })
  it('rejects another tenant or a purchased/provider sale', async () => {
    for (const override of [{ tenantId: 'other' }, { value: 10 }, { stripeSubscriptionId: 'sub-real' }, { couponRedemption: { id: 'paid-coupon' } }]) {
      db.consumerAccessGrant.findUnique.mockResolvedValue({ ...gift(), appSale: { ...gift().appSale, ...override } })
      await expect(revokePartnerConsumerPremium(tx, { ...input, grantId: 'grant-1' })).rejects.toThrow('grant-unavailable')
    }
    expect(db.appSale.updateMany).not.toHaveBeenCalled()
  })
  it('repeated or stale revocation keeps the first audit and cannot select a replacement grant', async () => {
    db.consumerAccessGrant.findUnique.mockResolvedValue({ ...gift(), revokedAt: now })
    expect(await revokePartnerConsumerPremium(tx, { ...input, grantId: 'grant-1' })).toEqual({ alreadyRevoked: true })
    expect(db.appSale.updateMany).not.toHaveBeenCalled(); expect(db.consumerAccessGrant.update).not.toHaveBeenCalled()
  })
})

describe('customer GenCode sale', () => {
  it('reserves exactly one identified credit in the same transaction and queues a receipt after the write-off', async () => {
    expect(await recordCustomerGenCodeSale(tx, input)).toMatchObject({ genCode: 'AAAA-BBBB-CCCC-DDDD', alreadySold: false })
    expect(reserveCreditForSale).toHaveBeenCalledExactlyOnceWith({ tenantId: 'tenant-1', genCodeId: 'code-1', committed: true,
      buyerId: 'buyer-1', committedMonths: 12, actorId: 'operator-1' }, tx)
    expect(db.genCode.updateMany).toHaveBeenCalledWith({ where: { id: 'code-1', tenantId: 'tenant-1', status: 'AVAILABLE' }, data: {
      status: 'SOLD', soldAt: now, soldVia: 'PLATFORM', soldById: 'operator-1', soldToAppUserId: 'buyer-1', soldToName: null, soldValue: null,
    } })
    expect(enqueueEmail).toHaveBeenCalledWith(tx, expect.objectContaining({ recipient: 'ana@example.test',
      context: { type: 'gencode-sale', appUserId: 'buyer-1', genCode: 'AAAA-BBBB-CCCC-DDDD', soldAt: now.toISOString() } }))
  })
  it('does not sell or grant access when no stock or no credit is available', async () => {
    db.$queryRaw.mockResolvedValue([])
    await expect(recordCustomerGenCodeSale(tx, input)).rejects.toThrow('gencode-unavailable')
    db.$queryRaw.mockResolvedValue([{ id: 'code-1', genCode: 'AAAA-BBBB-CCCC-DDDD' }])
    vi.mocked(reserveCreditForSale).mockRejectedValue(new Error('no credits'))
    await expect(recordCustomerGenCodeSale(tx, input)).rejects.toThrow('no credits')
    expect(db.appSale.create).not.toHaveBeenCalled(); expect(db.genCode.updateMany).not.toHaveBeenCalled(); expect(enqueueEmail).not.toHaveBeenCalled()
  })
  it.each(['SOLD', 'ACTIVATED'])('retries a specific %s code without spending stock, adding a year or re-enabling Premium', async (status) => {
    db.genCode.findFirst.mockResolvedValue({ genCode: 'AAAA-BBBB-CCCC-DDDD', status, soldToAppUserId: 'buyer-1', soldAt: now })
    expect(await recordCustomerGenCodeSale(tx, { ...input, genCode: 'AAAA-BBBB-CCCC-DDDD' })).toEqual({ genCode: 'AAAA-BBBB-CCCC-DDDD', emailId: null, alreadySold: true })
    expect(db.appSale.create).not.toHaveBeenCalled(); expect(reserveCreditForSale).not.toHaveBeenCalled(); expect(enqueueEmail).not.toHaveBeenCalled()
  })
})
