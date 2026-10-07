import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@genealogiq/db'
import type { ManualCouponInput } from './manual-coupon'

vi.mock('server-only', () => ({}))

// Use a disposable, migrated schema, never the normal local or deployed DB.
const url = process.env.MANUAL_COUPON_TEST_DATABASE_URL
describe.skipIf(!url)('manual coupons on PostgreSQL', () => {
  let db: PrismaClient
  let redeem: typeof import('./manual-coupon').redeemManualCoupon
  let base: ManualCouponInput
  let tenantId: string
  let partnerId: string
  let consumerEmail: string
  let planId: string
  let subscriptionId: string
  let oldGrantId: string
  const prefix = randomUUID().slice(0, 8)

  beforeAll(async () => {
    const target = new URL(url!)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
      || !/^\/genealogiq_coupon_qa_[a-z0-9_]+$/.test(target.pathname)) {
      throw new Error('Coupon integration tests require a disposable loopback genealogiq_coupon_qa_* database')
    }
    process.env.DATABASE_URL = url!
    process.env.STRIPE_SECRET_KEY = ''
    db = (await import('@genealogiq/db')).prisma
    redeem = (await import('./manual-coupon')).redeemManualCoupon
    const admin = await db.user.create({ data: { email: `${prefix}@coupon.test`, firstName: 'Coupon', lastName: 'Operator', role: 'ADMIN' } })
    const tenant = await db.tenant.create({ data: { entityType: 'COMPANY', email: `${prefix}-stock@coupon.test`, name: 'Existing stock', tradeName: 'Existing stock', phone: '5550100', taxId: `${prefix}-stock` } })
    tenantId = tenant.id
    const partner = await db.tenant.create({ data: { entityType: 'COMPANY', email: `${prefix}-partner@coupon.test`, name: 'New partner', tradeName: 'New partner', phone: '5550101', taxId: `${prefix}-partner` } })
    partnerId = partner.id
    const consumer = await db.appUser.create({ data: { firstName: 'Coupon', lastName: 'Consumer', email: `${prefix}-consumer@coupon.test` } })
    consumerEmail = consumer.email!
    const product = await db.genCodePackage.create({ data: { code: `${prefix}-PACKAGE`, name: 'QA package', unitPrice: 50, minimumQuantity: 2 } })
    const plan = await db.partnerPlan.create({ data: { code: `${prefix}-PLAN`, name: 'QA annual plan', annualAllowance: 20 } })
    planId = plan.id
    const subscription = await db.subscription.create({ data: { code: `${prefix}-PREMIUM`, name: 'QA consumer plan', termLength: 12 } })
    subscriptionId = subscription.id
    await db.planPrice.createMany({ data: [
      { partnerPlanId: planId, currency: 'BRL', annualCashAmount: 1000, effectiveFrom: new Date('2020-01-01') },
      { subscriptionId, currency: 'BRL', annualCashAmount: 240, installmentCount: 12, installmentAmount: 24, effectiveFrom: new Date('2020-01-01') },
    ] })
    const old = await db.creditGrant.create({ data: { tenantId, source: 'TOPUP', grantedQty: 5, remainingQty: 5, expiresAt: new Date('2099-01-01') } })
    oldGrantId = old.id
    await db.creditTransaction.create({ data: { grantId: old.id, tenantId, type: 'GRANT', quantity: 5, balanceAfter: 5, idempotencyKey: `${prefix}-old` } })
    await db.genCode.createMany({ data: Array.from({ length: 5 }, (_, i) => ({ tenantId, genCode: `${prefix}${i}` })) })
    const coupon = await db.discountCoupon.findFirstOrThrow({ where: { code: 'Gen2026' } })
    base = { requestId: randomUUID(), couponId: coupon.id, kind: 'package', productId: product.id, tenantId,
      quantity: 2, cadence: 'annual', source: 'external_payment', reference: `${prefix}-package`, externalAmount: 90,
      confirmed: true, createdById: admin.id, currency: 'BRL' }
  }, 30_000)

  afterAll(async () => { await db?.$disconnect() })

  it('preserves five existing units and grants exactly two more; simultaneous retries do not duplicate', async () => {
    const results = await Promise.all([redeem(base), redeem(base)])
    expect(results[0].id).toBe(results[1].id)
    expect(results.map((r) => r.alreadyApplied).sort()).toEqual([false, true])
    expect(await db.genCode.count({ where: { tenantId } })).toBe(7)
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: oldGrantId } })).remainingQty).toBe(5)
    const order = await db.genCodeOrder.findUniqueOrThrow({ where: { id: results[0].resultId }, include: { creditGrant: true } })
    expect(order.status).toBe('PAID')
    expect(Number(order.discountAmount)).toBe(100)
    expect(Number(order.totalAmount)).toBe(0)
    expect(order.stripeCheckoutSessionId).toBeNull()
    expect(order.creditGrant?.remainingQty).toBe(2)
    expect(await db.creditTransaction.count({ where: { idempotencyKey: `grant:topup:${order.id}` } })).toBe(1)
    await expect(redeem({ ...base, requestId: randomUUID() })).rejects.toMatchObject({ reason: 'reference-used' })
    expect(await db.genCode.count({ where: { tenantId } })).toBe(7)
  })

  it('opens a B2B cycle, then renews with exactly six rollover and twenty annual credits', async () => {
    const sale = { ...base, requestId: randomUUID(), kind: 'partner' as const, productId: planId, tenantId: partnerId, reference: `${prefix}-partner` }
    const first = await redeem(sale)
    const current = await db.subscriptionCycle.findUniqueOrThrow({ where: { id: first.resultId }, include: { subscription: true } })
    expect(current.subscription.autoRenew).toBe(false)
    expect(current.subscription.stripeSubscriptionId).toBeNull()
    expect(current.subscription.status).toBe('ACTIVE')
    expect(current.priceSnapshot).toMatchObject({ amountPaid: 0, subtotalAmount: 1000, discountAmount: 1000, currency: 'BRL' })
    expect(await db.genCode.count({ where: { tenantId: partnerId } })).toBe(20)
    await db.subscriptionCycle.update({ where: { id: current.id }, data: { endAt: new Date(Date.now() - 60_000), graceEndAt: new Date(Date.now() + 86_400_000) } })
    const renewal = await redeem({ ...sale, requestId: randomUUID(), reference: `${prefix}-renewal` })
    const next = await db.subscriptionCycle.findUniqueOrThrow({ where: { id: renewal.resultId }, include: { grants: true } })
    expect(next.renewedFromCycleId).toBe(current.id)
    expect(next.subscriptionId).toBe(current.subscriptionId)
    expect(next.grants.map((g) => [g.source, g.remainingQty]).sort()).toEqual([['ANNUAL', 20], ['ROLLOVER', 6]])
    expect(await db.genCode.count({ where: { tenantId: partnerId } })).toBe(26)
    expect((await db.creditGrant.aggregate({ where: { tenantId: partnerId }, _sum: { remainingQty: true } }))._sum.remainingQty).toBe(26)
  })

  it('creates a usable, finite B2C entitlement without a Stripe subscription', async () => {
    const result = await redeem({ ...base, requestId: randomUUID(), kind: 'consumer', productId: subscriptionId, consumerEmail, reference: `${prefix}-consumer` })
    const sale = await db.appSale.findUniqueOrThrow({ where: { id: result.resultId }, include: { couponRedemption: true } })
    expect(sale.status).toBe('active')
    expect(sale.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 364 * 86_400_000)
    expect(sale.stripeSubscriptionId).toBeNull()
    expect(sale.cancelAtPeriodEnd).toBe(true)
    expect(Number(sale.value)).toBe(0)
    expect(Number(sale.couponRedemption?.subtotalAmount)).toBe(240)
    expect(sale.couponRedemption?.code).toBe('Gen2026')
  })

  it('serializes competing redemptions at the usage limit', async () => {
    const coupon = await db.discountCoupon.create({ data: { code: `${prefix}-LIMIT`, redemptionMode: 'manual', discountType: 'percent', percentOff: 100, duration: 'once', maxRedemptions: 1, createdById: base.createdById } })
    const before = await db.genCode.count({ where: { tenantId } })
    const results = await Promise.allSettled([1, 2].map((i) => redeem({ ...base, requestId: randomUUID(), couponId: coupon.id, reference: `${prefix}-limit-${i}` })))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { reason: 'coupon-exhausted' } })
    expect(await db.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(1)
    expect(await db.genCode.count({ where: { tenantId } })).toBe(before + 2)
  })

  it('rejects a live Stripe subscription even when a manual plan runs longer', async () => {
    const buyer = await db.appUser.findUniqueOrThrow({ where: { email: consumerEmail } })
    await db.appSale.create({ data: { appUserId: buyer.id, subscriptionId,
      stripeSubscriptionId: `qa_sub_${prefix}`, status: 'active', currentPeriodEnd: new Date(Date.now() + 86_400_000) } })
    const before = await db.appSale.count({ where: { appUserId: buyer.id } })
    await expect(redeem({ ...base, requestId: randomUUID(), kind: 'consumer', productId: subscriptionId,
      consumerEmail, reference: `${prefix}-conflicting` })).rejects.toMatchObject({ reason: 'active-subscription' })
    expect(await db.appSale.count({ where: { appUserId: buyer.id } })).toBe(before)
  })

  it('enforces manual coupon terms at the database boundary', async () => {
    await expect(db.discountCoupon.create({ data: { code: `${prefix}-INVALID`, redemptionMode: 'manual',
      discountType: 'percent', percentOff: null, duration: 'once', createdById: base.createdById } })).rejects.toThrow()
    expect(await db.discountCoupon.count({ where: { code: `${prefix}-INVALID` } })).toBe(0)
  })

  it('rolls back all grants and codes when the final audit write fails', async () => {
    const before = await Promise.all([db.genCodeOrder.count(), db.creditGrant.count(), db.creditTransaction.count(), db.genCode.count()])
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION reject_coupon_qa_audit() RETURNS trigger AS $$ BEGIN IF NEW.reference LIKE '%-ROLLBACK' THEN RAISE EXCEPTION 'QA audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`)
    await db.$executeRawUnsafe('CREATE TRIGGER coupon_qa_audit_failure BEFORE INSERT ON coupon_redemptions FOR EACH ROW EXECUTE FUNCTION reject_coupon_qa_audit()')
    try {
      await expect(redeem({ ...base, requestId: randomUUID(), reference: `${prefix}-ROLLBACK` })).rejects.toThrow()
      expect(await Promise.all([db.genCodeOrder.count(), db.creditGrant.count(), db.creditTransaction.count(), db.genCode.count()])).toEqual(before)
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER coupon_qa_audit_failure ON coupon_redemptions')
      await db.$executeRawUnsafe('DROP FUNCTION reject_coupon_qa_audit()')
    }
  })

  it('allows consumer account deletion while retaining the receipt, cap and retry identity', async () => {
    const buyer = await db.appUser.create({ data: { firstName: 'Disposable', lastName: 'Consumer', email: `${prefix}-deletion@coupon.test` } })
    const input = { ...base, requestId: randomUUID(), kind: 'consumer' as const, productId: subscriptionId,
      consumerEmail: buyer.email!, reference: `${prefix}-deletion` }
    const result = await redeem(input)
    const usageBefore = await db.couponRedemption.count({ where: { couponId: base.couponId } })
    await db.appUser.delete({ where: { id: buyer.id } })
    expect(await db.appSale.findUnique({ where: { id: result.resultId } })).toBeNull()
    const receipt = await db.couponRedemption.findUniqueOrThrow({ where: { id: result.id } })
    expect(receipt.appSaleId).toBeNull()
    expect(receipt.resultId).toBe(result.resultId)
    expect(Number(receipt.subtotalAmount)).toBe(240)
    expect(Number(receipt.discountAmount)).toBe(240)
    expect(await db.couponRedemption.count({ where: { couponId: base.couponId } })).toBe(usageBefore)
    await expect(redeem(input)).resolves.toEqual({ ...result, alreadyApplied: true })
    await expect(redeem({ ...input, requestId: randomUUID() })).rejects.toMatchObject({ reason: 'reference-used' })
    expect(await db.appSale.findUnique({ where: { id: result.resultId } })).toBeNull()
  })
})
