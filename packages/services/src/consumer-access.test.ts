import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { tx, db } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    appUser: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    appSale: { findMany: vi.fn(), create: vi.fn() },
    subscription: { findFirst: vi.fn() },
    consumerAccessGrant: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  }
  return { tx, db: { $transaction: vi.fn() } }
})
vi.mock('server-only', () => ({}))
vi.mock('@genealogiq/db', () => ({ prisma: db }))

import { grantConsumerPremium, type ConsumerAccessInput } from './consumer-access'

const input: ConsumerAccessInput = {
  requestId: 'e4ad9a98-7114-4fe5-9153-839edb0a2502', firstName: ' Ana ', lastName: ' Silva ',
  email: ' ANA@GENEALOGIQ.TEST ', notes: ' Legacy family ', passwordHash: '$2b$12$fixture.hash',
  createdById: 'operator-1', locale: 'pt-BR', currency: 'BRL',
}
const buyer = {
  id: 'consumer-1', email: 'ana@genealogiq.test', firstName: 'Existing name',
  role: 'APP_USER', isActive: true, tenantId: null, password: 'existing-hash', googleId: null,
  emailVerified: new Date('2025-01-01T00:00:00Z'),
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-07T15:00:00Z'))
  db.$transaction.mockImplementation((fn) => fn(tx))
  tx.appUser.findMany.mockResolvedValue([])
  tx.appUser.create.mockImplementation(({ data }) => ({ ...buyer, ...data }))
  tx.appSale.findMany.mockResolvedValue([])
  tx.appSale.create.mockResolvedValue({ id: 'sale-1' })
  tx.subscription.findFirst.mockResolvedValue({ id: 'premium-1' })
  tx.consumerAccessGrant.findUnique.mockResolvedValue(null)
  tx.consumerAccessGrant.findFirst.mockResolvedValue(null)
  tx.consumerAccessGrant.create.mockImplementation(({ data }) => ({ id: 'grant-1', ...data }))
})
afterEach(() => vi.useRealTimers())

describe('direct consumer Premium gift', () => {
  it('creates an active independent APP account, zero-value 12-month Premium and operator audit together', async () => {
    const result = await grantConsumerPremium(input)
    expect(result).toMatchObject({ appUserId: 'consumer-1', email: 'ana@genealogiq.test', firstName: 'Ana',
      expiresAt: new Date('2027-10-07T15:00:00Z'), credentialsCreated: true, alreadyGranted: false, emailSentAt: null })
    expect(tx.appUser.create.mock.calls[0][0].data).toEqual({
      firstName: 'Ana', lastName: 'Silva', email: 'ana@genealogiq.test', role: 'APP_USER', isActive: true,
      tenantId: null, password: '$2b$12$fixture.hash', emailVerified: new Date('2026-10-07T15:00:00Z'), preferredLocale: 'pt-BR', createdById: 'operator-1',
    })
    expect(tx.appSale.create.mock.calls[0][0].data).toEqual({
      appUserId: 'consumer-1', subscriptionId: 'premium-1', tenantId: null, soldById: 'operator-1',
      value: 0, currency: 'BRL', cadence: 'annual', status: 'active', cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date('2027-10-07T15:00:00Z'),
    })
    expect(tx.consumerAccessGrant.create.mock.calls[0][0].data).toMatchObject({
      recipientId: 'consumer-1', appUserId: 'consumer-1', resultId: 'sale-1', appSaleId: 'sale-1', createdById: 'operator-1',
      startsAt: new Date('2026-10-07T15:00:00Z'), expiresAt: new Date('2027-10-07T15:00:00Z'), notes: 'Legacy family',
    })
    expect(result).not.toHaveProperty('password')
    expect(result).not.toHaveProperty('passwordHash')
  })

  it('keeps a leap-day grant finite and clamps to February 28 the next year', async () => {
    vi.setSystemTime(new Date('2028-02-29T10:30:00Z'))
    expect((await grantConsumerPremium(input)).expiresAt).toEqual(new Date('2029-02-28T10:30:00Z'))
  })

  it('preserves an existing account/password and adds twelve months after already-held Premium', async () => {
    tx.appUser.findMany.mockResolvedValue([buyer])
    tx.appSale.findMany.mockResolvedValue([{ subscriptionId: 'premium-1', stripeSubscriptionId: null, currentPeriodEnd: new Date('2027-02-28T17:00:00Z') }])
    expect(await grantConsumerPremium(input)).toMatchObject({ credentialsCreated: false, firstName: 'Existing name', expiresAt: new Date('2028-02-28T17:00:00Z') })
    expect(tx.appUser.create).not.toHaveBeenCalled()
    expect(tx.appUser.update).not.toHaveBeenCalled()
    expect(tx.consumerAccessGrant.create.mock.calls[0][0].data.startsAt).toEqual(new Date('2027-02-28T17:00:00Z'))
  })

  it('keeps an existing Google-only account passwordless', async () => {
    tx.appUser.findMany.mockResolvedValue([{ ...buyer, password: null, googleId: 'google-1' }])
    expect((await grantConsumerPremium(input)).credentialsCreated).toBe(false)
    expect(tx.appUser.update).not.toHaveBeenCalled()
  })

  it('gives an old invitation its first password and verifies it without replacing profile details', async () => {
    tx.appUser.findMany.mockResolvedValue([{ ...buyer, password: null, emailVerified: null }])
    expect((await grantConsumerPremium(input)).credentialsCreated).toBe(true)
    expect(tx.appUser.update).toHaveBeenCalledWith({ where: { id: 'consumer-1' }, data: {
      password: '$2b$12$fixture.hash', emailVerified: new Date('2026-10-07T15:00:00Z'), updatedById: 'operator-1',
    } })
  })

  it.each([
    [{ ...buyer, tenantId: 'funeral-1' }, 'partner-account'],
    [{ ...buyer, isActive: false }, 'recipient-unavailable'],
    [{ ...buyer, role: 'APP_MEMO' }, 'recipient-unavailable'],
  ])('rejects an ineligible account without modifying it', async (account, reason) => {
    tx.appUser.findMany.mockResolvedValue([account])
    await expect(grantConsumerPremium(input)).rejects.toMatchObject({ reason })
    expect(tx.appUser.update).not.toHaveBeenCalled()
    expect(tx.appSale.create).not.toHaveBeenCalled()
  })

  it('rejects ambiguous case-insensitive email matches', async () => {
    tx.appUser.findMany.mockResolvedValue([buyer, { ...buyer, id: 'other', email: 'ANA@genealogiq.test' }])
    await expect(grantConsumerPremium(input)).rejects.toMatchObject({ reason: 'email-conflict' })
    expect(tx.appSale.create).not.toHaveBeenCalled()
  })

  it.each([
    [{ subscriptionId: 'premium-1', stripeSubscriptionId: 'sub_existing' }],
    [{ subscriptionId: 'other-plan', stripeSubscriptionId: null }],
    [{ subscriptionId: 'premium-1', stripeSubscriptionId: null }, { subscriptionId: 'premium-1', stripeSubscriptionId: 'shorter_live_stripe' }],
  ])('rejects every live conflicting subscription, including a shorter one', async (...sales) => {
    tx.appUser.findMany.mockResolvedValue([buyer])
    tx.appSale.findMany.mockResolvedValue(sales.map((sale) => ({ ...sale, currentPeriodEnd: new Date('2027-01-01T00:00:00Z') })))
    await expect(grantConsumerPremium(input)).rejects.toMatchObject({ reason: 'active-subscription' })
    expect(tx.appSale.create).not.toHaveBeenCalled()
  })

  it('rejects a missing Premium catalog before creating an account', async () => {
    tx.subscription.findFirst.mockResolvedValue(null)
    await expect(grantConsumerPremium(input)).rejects.toMatchObject({ reason: 'premium-unavailable' })
    expect(tx.appUser.create).not.toHaveBeenCalled()
  })

  it('replays the same request with a fresh hash without creating credentials or another grant', async () => {
    await grantConsumerPremium(input)
    const saved = tx.consumerAccessGrant.create.mock.calls[0][0].data
    tx.consumerAccessGrant.findUnique.mockResolvedValue({ ...saved, id: 'grant-1', emailSentAt: null, appUser: buyer })
    tx.appUser.create.mockClear(); tx.appSale.create.mockClear(); tx.consumerAccessGrant.create.mockClear()
    expect(await grantConsumerPremium({ ...input, passwordHash: '$2b$12$fresh.hash' })).toMatchObject({ id: 'grant-1', alreadyGranted: true, credentialsCreated: false })
    expect(tx.appUser.create).not.toHaveBeenCalled()
    expect(tx.appSale.create).not.toHaveBeenCalled()
    expect(tx.consumerAccessGrant.create).not.toHaveBeenCalled()
    await expect(grantConsumerPremium({ ...input, email: 'other@genealogiq.test' })).rejects.toMatchObject({ reason: 'request-conflict' })
  })

  it('returns the existing live gift when a second operator registers the same email', async () => {
    tx.appUser.findMany.mockResolvedValue([buyer])
    tx.consumerAccessGrant.findFirst.mockResolvedValue({ id: 'old-gift', appSaleId: 'old-sale', appUser: buyer, expiresAt: new Date('2027-10-01T00:00:00Z'), emailSentAt: null })
    expect(await grantConsumerPremium(input)).toMatchObject({ id: 'old-gift', alreadyGranted: true, expiresAt: new Date('2027-10-01T00:00:00Z') })
    expect(tx.appSale.create).not.toHaveBeenCalled()
    expect(tx.appUser.update).not.toHaveBeenCalled()
  })
})
