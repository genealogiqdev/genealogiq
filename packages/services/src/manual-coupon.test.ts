import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { tx, db, grant, cycle, KnownError } = vi.hoisted(() => {
  class KnownError extends Error { code = 'P2002' }
  const tx = {
    $queryRaw: vi.fn(),
    discountCoupon: { findUnique: vi.fn() },
    couponRedemption: { findUnique: vi.fn(), create: vi.fn() },
    tenant: { findFirst: vi.fn() },
    appUser: { findFirst: vi.fn() },
    genCodePackage: { findFirst: vi.fn() }, genCodeOrder: { create: vi.fn() },
    partnerPlan: { findFirst: vi.fn() }, partnerSubscription: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    subscription: { findFirst: vi.fn() }, appSale: { findMany: vi.fn(), create: vi.fn() },
  }
  return { tx, db: { $transaction: vi.fn(), couponRedemption: { findUnique: vi.fn() } }, grant: vi.fn(), cycle: vi.fn(), KnownError }
})
vi.mock('server-only', () => ({}))
vi.mock('@genealogiq/db', () => ({ prisma: db, Prisma: { PrismaClientKnownRequestError: KnownError } }))
vi.mock('./gencode-package', () => ({ grantGenCodeOrder: grant, GENCODE_PACKAGE_CREDIT_MONTHS: 12 }))
vi.mock('./partner-billing', () => ({ openPartnerCycle: cycle, partnerCycleSelect: { id: true } }))

import { redeemManualCoupon, type ManualCouponInput } from './manual-coupon'
import { addBillingMonths } from './billing-dates'

const input: ManualCouponInput = {
  requestId: 'request-1', couponId: 'coupon-1', productId: 'package-1', kind: 'package', tenantId: 'tenant-1',
  quantity: 20, cadence: 'annual', source: 'external_payment', reference: ' InfinitePay AB123 ',
  externalAmount: 350, confirmed: true, createdById: 'admin-1', currency: 'BRL',
}
const coupon = {
  id: 'coupon-1', code: 'Gen2026', isActive: true, redemptionMode: 'manual', discountType: 'percent',
  percentOff: 100, duration: 'once', stripeCouponId: null, stripePromotionCodeId: null, redeemBy: null,
  maxRedemptions: null, _count: { redemptions: 0 }, appliesTo: [], genCodePackages: [], subscriptions: [],
}
const price = { id: 'price-1', annualCashAmount: 400, installmentCount: 12, installmentAmount: 40, version: 3 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-07T15:00:00Z'))
  db.$transaction.mockImplementation((fn) => fn(tx))
  tx.couponRedemption.findUnique.mockResolvedValue(null)
  tx.couponRedemption.create.mockImplementation(({ data }) => ({ id: 'redemption-1', genCodeOrderId: null, subscriptionCycleId: null, appSaleId: null, ...data }))
  tx.discountCoupon.findUnique.mockResolvedValue(coupon)
  tx.tenant.findFirst.mockResolvedValue({ id: 'tenant-1' })
  tx.appUser.findFirst.mockResolvedValue({ id: 'consumer-1' })
  tx.genCodePackage.findFirst.mockResolvedValue({ id: 'package-1', unitPrice: 20, minimumQuantity: 20, currency: 'BRL', activationTrialMonths: 12, activationTrialPlanCode: 'PREMIUM' })
  tx.genCodeOrder.create.mockResolvedValue({ id: 'order-1' })
  tx.subscription.findFirst.mockResolvedValue({ id: 'premium', termLength: 12, prices: [price] })
  tx.appSale.findMany.mockResolvedValue([])
  tx.appSale.create.mockResolvedValue({ id: 'sale-1' })
  tx.partnerPlan.findFirst.mockResolvedValue({ id: 'plan-1', prices: [price] })
  tx.partnerSubscription.findFirst.mockResolvedValue(null)
  tx.partnerSubscription.create.mockResolvedValue({ id: 'contract-1' })
  cycle.mockResolvedValue({ id: 'cycle-1' })
})
afterEach(() => vi.useRealTimers())

describe('manual coupon settlement', () => {
  it('settles 20 codes at R$20 with R$400 discount, zero due and one 12-month grant', async () => {
    expect(await redeemManualCoupon(input)).toEqual({ id: 'redemption-1', kind: 'package', resultId: 'order-1', alreadyApplied: false })
    expect(tx.genCodeOrder.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      quantity: 20, unitPrice: 20, discountAmount: 400, totalAmount: 0, status: 'PAID',
      discountCode: 'Gen2026', createdById: 'admin-1', creditExpiresAt: new Date('2027-10-07T15:00:00Z'),
    }), select: { id: true } })
    expect(grant).toHaveBeenCalledExactlyOnceWith(tx, 'order-1', new Date('2027-10-07T15:00:00Z'))
    expect(tx.couponRedemption.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      reference: 'INFINITEPAY AB123', externalAmount: 350, subtotalAmount: 400, discountAmount: 400, totalAmount: 0,
      recipientId: 'tenant-1', couponId: 'coupon-1', createdById: 'admin-1',
    }) })
    expect(tx.genCodeOrder.create.mock.calls[0][0].data).not.toHaveProperty('stripeCheckoutSessionId')
  })

  it('records legacy stock without claiming an external payment', async () => {
    await redeemManualCoupon({ ...input, source: 'legacy_stock', externalAmount: 500 })
    expect(tx.couponRedemption.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: 'legacy_stock', externalAmount: null, totalAmount: 0 }) })
  })

  it.each([
    { confirmed: false }, { quantity: 1.5 }, { quantity: 10_001 }, { reference: ' ' },
    { externalAmount: 0 }, { externalAmount: Infinity }, { externalAmount: 0.001 }, { tenantId: '' },
  ])('rejects malformed or unconfirmed input before opening a transaction: %j', async (override) => {
    await expect(redeemManualCoupon({ ...input, ...override })).rejects.toMatchObject({ reason: 'invalid-data' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it.each([
    { isActive: false }, { percentOff: 99 }, { redemptionMode: 'stripe' }, { duration: 'forever' },
    { redeemBy: new Date('2026-10-07T15:00:00Z') }, { stripePromotionCodeId: 'promo-1' },
  ])('rejects an unavailable coupon without granting anything: %j', async (override) => {
    tx.discountCoupon.findUnique.mockResolvedValue({ ...coupon, ...override })
    await expect(redeemManualCoupon(input)).rejects.toMatchObject({ reason: 'coupon-unavailable' })
    expect(tx.genCodeOrder.create).not.toHaveBeenCalled()
    expect(tx.couponRedemption.create).not.toHaveBeenCalled()
  })

  it('enforces the usage limit after locking the coupon', async () => {
    tx.discountCoupon.findUnique.mockResolvedValue({ ...coupon, maxRedemptions: 2, _count: { redemptions: 2 } })
    await expect(redeemManualCoupon(input)).rejects.toMatchObject({ reason: 'coupon-exhausted' })
    expect(tx.$queryRaw).toHaveBeenCalledOnce()
    expect(grant).not.toHaveBeenCalled()
  })

  it('does not treat a B2C-restricted coupon as a global package coupon', async () => {
    tx.discountCoupon.findUnique.mockResolvedValue({ ...coupon, subscriptions: [{ id: 'premium' }] })
    await expect(redeemManualCoupon(input)).rejects.toMatchObject({ reason: 'product-not-applicable' })
    expect(grant).not.toHaveBeenCalled()
  })

  it('rejects inactive recipients and quantities below the package minimum', async () => {
    tx.tenant.findFirst.mockResolvedValueOnce(null)
    await expect(redeemManualCoupon(input)).rejects.toMatchObject({ reason: 'recipient-inactive' })
    await expect(redeemManualCoupon({ ...input, quantity: 19 })).rejects.toMatchObject({ reason: 'invalid-quantity' })
    expect(grant).not.toHaveBeenCalled()
  })

  it('returns the original result on retry without another grant, even if the coupon later expires', async () => {
    await redeemManualCoupon(input)
    const saved = { id: 'redemption-1', appSaleId: null, subscriptionCycleId: null, ...tx.couponRedemption.create.mock.calls[0][0].data }
    tx.couponRedemption.findUnique.mockResolvedValue(saved)
    tx.discountCoupon.findUnique.mockResolvedValue({ ...coupon, isActive: false })
    expect(await redeemManualCoupon(input)).toEqual({ id: 'redemption-1', kind: 'package', resultId: 'order-1', alreadyApplied: true })
    expect(grant).toHaveBeenCalledOnce()
    await expect(redeemManualCoupon({ ...input, quantity: 30 })).rejects.toMatchObject({ reason: 'request-conflict' })
    await expect(redeemManualCoupon({ ...input, createdById: 'another-admin' })).rejects.toMatchObject({ reason: 'request-conflict' })
  })

  it('rejects a receipt repeated with a new request key', async () => {
    tx.couponRedemption.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'already-used' })
    await expect(redeemManualCoupon(input)).rejects.toMatchObject({ reason: 'reference-used' })
    expect(grant).not.toHaveBeenCalled()
  })

  it('replays the durable receipt after its consumer account and sale have been deleted', async () => {
    const consumer = { ...input, kind: 'consumer' as const, productId: 'premium', consumerEmail: 'consumer@example.test' }
    await redeemManualCoupon(consumer)
    const saved = { id: 'redemption-1', ...tx.couponRedemption.create.mock.calls[0][0].data, appSaleId: null }
    tx.couponRedemption.findUnique.mockResolvedValueOnce(saved)
    tx.appUser.findFirst.mockClear()
    tx.appSale.create.mockClear()
    await expect(redeemManualCoupon(consumer)).resolves.toEqual({ id: 'redemption-1', kind: 'consumer', resultId: 'sale-1', alreadyApplied: true })
    expect(tx.appUser.findFirst).not.toHaveBeenCalled()
    expect(tx.appSale.create).not.toHaveBeenCalled()
  })

  it('opens a finite B2B contract through the shared cycle writer with no automatic renewal', async () => {
    await redeemManualCoupon({ ...input, kind: 'partner', productId: 'plan-1' })
    expect(tx.partnerSubscription.create).toHaveBeenCalledWith(expect.objectContaining({ data: { tenantId: 'tenant-1', planId: 'plan-1', autoRenew: false } }))
    expect(cycle).toHaveBeenCalledWith(tx, {
      subscription: { id: 'contract-1' }, now: new Date('2026-10-07T15:00:00Z'),
      price: expect.objectContaining({ planPriceId: 'price-1', amountPaid: 0, discountAmount: 400, currency: 'BRL', book: { id: 'price-1', version: 3, annualCashAmount: '400' } }),
    })
  })

  it('reuses the B2B contract in its renewal window, preserving the shared rollover path', async () => {
    tx.partnerSubscription.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'old-contract' })
    tx.partnerSubscription.update.mockResolvedValue({ id: 'old-contract', founderRolloverEligible: true })
    await redeemManualCoupon({ ...input, kind: 'partner', productId: 'plan-1' })
    expect(tx.partnerSubscription.create).not.toHaveBeenCalled()
    expect(cycle.mock.calls[0][1].subscription).toEqual({ id: 'old-contract', founderRolloverEligible: true })
  })

  it('rejects an overlapping B2B contract', async () => {
    tx.partnerSubscription.findFirst.mockResolvedValueOnce({ id: 'active-contract' })
    await expect(redeemManualCoupon({ ...input, kind: 'partner' })).rejects.toMatchObject({ reason: 'active-subscription' })
    expect(cycle).not.toHaveBeenCalled()
  })

  it('activates a B2C year and preserves its zero-charge audit', async () => {
    await redeemManualCoupon({ ...input, kind: 'consumer', productId: 'premium', consumerEmail: ' Consumer@Example.Test ' })
    expect(tx.appUser.findFirst).toHaveBeenCalledWith({ where: { email: { equals: 'consumer@example.test', mode: 'insensitive' }, role: 'APP_USER', isActive: true }, select: { id: true } })
    expect(tx.appSale.create).toHaveBeenCalledWith({ data: {
      appUserId: 'consumer-1', subscriptionId: 'premium', soldById: 'admin-1', value: 0, currency: 'BRL',
      cadence: 'annual', status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: new Date('2027-10-07T15:00:00Z'),
    }, select: { id: true } })
  })

  it('grants a single B2C month at month-end, never the whole annual term', async () => {
    vi.setSystemTime(new Date('2027-01-31T12:30:00Z'))
    await redeemManualCoupon({ ...input, kind: 'consumer', consumerEmail: 'consumer@example.test', cadence: 'monthly' })
    expect(tx.appSale.create.mock.calls[0][0].data.currentPeriodEnd).toEqual(new Date('2027-02-28T12:30:00Z'))
    expect(tx.couponRedemption.create.mock.calls[0][0].data.subtotalAmount).toBe(40)
  })

  it('extends the same manual B2C plan from its paid-through date', async () => {
    tx.appSale.findMany.mockResolvedValue([{ stripeSubscriptionId: null, subscriptionId: 'premium', currentPeriodEnd: new Date('2027-03-20T12:00:00Z') }])
    await redeemManualCoupon({ ...input, kind: 'consumer', consumerEmail: 'consumer@example.test' })
    expect(tx.appSale.create.mock.calls[0][0].data.currentPeriodEnd).toEqual(new Date('2028-03-20T12:00:00Z'))
  })

  it.each([{ stripeSubscriptionId: 'sub-1', subscriptionId: 'premium' }, { stripeSubscriptionId: null, subscriptionId: 'other' }])('rejects conflicting B2C subscriptions: %j', async (active) => {
    tx.appSale.findMany.mockResolvedValue([active])
    await expect(redeemManualCoupon({ ...input, kind: 'consumer', consumerEmail: 'consumer@example.test' })).rejects.toMatchObject({ reason: 'active-subscription' })
    expect(tx.appSale.create).not.toHaveBeenCalled()
  })

  it('rejects a shorter live Stripe subscription even when a manual term ends later', async () => {
    tx.appSale.findMany.mockResolvedValue([
      { stripeSubscriptionId: null, subscriptionId: 'premium', currentPeriodEnd: new Date('2027-10-07T15:00:00Z') },
      { stripeSubscriptionId: 'sub-overlap', subscriptionId: 'premium', currentPeriodEnd: new Date('2026-11-07T15:00:00Z') },
    ])
    await expect(redeemManualCoupon({ ...input, kind: 'consumer', consumerEmail: 'consumer@example.test' })).rejects.toMatchObject({ reason: 'active-subscription' })
    expect(tx.appSale.create).not.toHaveBeenCalled()
  })
})

it('clamps a leap-day annual term and does not mutate its start date', () => {
  const start = new Date('2028-02-29T15:20:00Z')
  expect(addBillingMonths(start, 12)).toEqual(new Date('2029-02-28T15:20:00Z'))
  expect(start).toEqual(new Date('2028-02-29T15:20:00Z'))
})
