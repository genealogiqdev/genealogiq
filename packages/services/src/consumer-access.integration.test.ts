import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@genealogiq/db'

vi.mock('server-only', () => ({}))
const url = process.env.CONSUMER_ACCESS_TEST_DATABASE_URL
describe.skipIf(!url)('consumer Premium access on PostgreSQL', () => {
  let db: PrismaClient
  let grant: typeof import('./consumer-access').grantConsumerPremium
  let operatorId: string
  let premiumId: string
  const prefix = `consumer-${randomUUID().slice(0, 8)}`
  const input = (label: string) => ({
    requestId: randomUUID(), firstName: 'Ana', lastName: 'Silva', email: `${prefix}-${label}@genealogiq.test`,
    passwordHash: '$2b$12$disposable.integration.fixture.only', createdById: operatorId, locale: 'pt-BR', currency: 'BRL',
  })
  beforeAll(async () => {
    const target = new URL(url!)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
      || !/^\/genealogiq_coupon_qa_[a-z0-9_]+$/.test(target.pathname)) throw new Error('Disposable loopback test database required')
    process.env.DATABASE_URL = url!
    db = (await import('@genealogiq/db')).prisma
    grant = (await import('./consumer-access')).grantConsumerPremium
    const operator = await db.user.create({ data: { email: `${prefix}-operator@genealogiq.test`, firstName: 'QA', lastName: 'Operator', role: 'SUPER_ADMIN', isActive: true } })
    operatorId = operator.id
    premiumId = (await db.subscription.findUniqueOrThrow({ where: { code: 'PREMIUM' } })).id
  })
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-07T15:00:00Z')) })
  afterEach(() => vi.useRealTimers())
  afterAll(async () => { await db?.$disconnect() })

  it('commits one active independent APP account and an exact free twelve-month entitlement without staff/tenant/purchase rows', async () => {
    const before = { staff: await db.user.count(), tenants: await db.tenant.count(), orders: await db.genCodeOrder.count() }
    const request = input('new')
    const result = await grant({ ...request, email: ` ${request.email.toUpperCase()} ` })
    const user = await db.appUser.findUniqueOrThrow({ where: { id: result.appUserId } })
    const sale = await db.appSale.findFirstOrThrow({ where: { appUserId: user.id }, include: { subscription: true, consumerAccessGrant: true } })
    expect(user).toMatchObject({ tenantId: null, role: 'APP_USER', isActive: true, email: request.email, password: request.passwordHash, emailVerified: new Date('2026-10-07T15:00:00Z') })
    expect(sale).toMatchObject({ tenantId: null, status: 'active', cancelAtPeriodEnd: true, stripeSubscriptionId: null, currentPeriodEnd: new Date('2027-10-07T15:00:00Z') })
    expect(Number(sale.value)).toBe(0)
    expect(sale.subscription.code).toBe('PREMIUM')
    expect(sale.consumerAccessGrant).toMatchObject({ createdById: operatorId, recipientId: user.id, startsAt: new Date('2026-10-07T15:00:00Z'), expiresAt: new Date('2027-10-07T15:00:00Z'), emailSentAt: null })
    expect({ staff: await db.user.count(), tenants: await db.tenant.count(), orders: await db.genCodeOrder.count() }).toEqual(before)
    expect(await db.genCode.count({ where: { soldToAppUserId: user.id } })).toBe(0)
  })

  it('serializes double clicks and two operators for the same new email into one account and gift', async () => {
    const request = input('concurrent')
    const results = await Promise.all([
      grant(request), grant(request), grant({ ...request, requestId: randomUUID(), email: request.email.toUpperCase() }),
    ])
    expect(new Set(results.map((r) => r.id)).size).toBe(1)
    expect(results.filter((r) => r.credentialsCreated)).toHaveLength(1)
    expect(results.filter((r) => r.alreadyGranted)).toHaveLength(2)
    expect(await db.appUser.count({ where: { email: { equals: request.email, mode: 'insensitive' } } })).toBe(1)
    expect(await db.consumerAccessGrant.count({ where: { recipientId: results[0].appUserId } })).toBe(1)
    expect(await db.appSale.count({ where: { appUserId: results[0].appUserId } })).toBe(1)
  })

  it('keeps an existing customer/password and preserves paid-through days', async () => {
    const request = input('existing')
    const user = await db.appUser.create({ data: { email: request.email, firstName: 'Original', lastName: 'Name', password: 'existing-password-hash', emailVerified: new Date('2025-01-01T00:00:00Z') } })
    await db.appSale.create({ data: { appUserId: user.id, subscriptionId: premiumId, status: 'active', currentPeriodEnd: new Date('2027-01-31T15:00:00Z'), value: 100 } })
    const result = await grant(request)
    expect(result).toMatchObject({ appUserId: user.id, credentialsCreated: false, expiresAt: new Date('2028-01-31T15:00:00Z') })
    expect(await db.appUser.findUnique({ where: { id: user.id } })).toMatchObject({ firstName: 'Original', lastName: 'Name', password: 'existing-password-hash' })
    expect(await db.consumerAccessGrant.findUnique({ where: { id: result.id } })).toMatchObject({ startsAt: new Date('2027-01-31T15:00:00Z') })
  })

  it('rejects a partner-owned customer without removing its funeral-home link', async () => {
    const request = input('partner')
    const tenant = await db.tenant.findFirstOrThrow()
    const user = await db.appUser.create({ data: { email: request.email, firstName: 'Partner', lastName: 'Customer', tenantId: tenant.id } })
    await expect(grant(request)).rejects.toMatchObject({ reason: 'partner-account' })
    expect(await db.appUser.findUnique({ where: { id: user.id } })).toMatchObject({ tenantId: tenant.id, password: null })
    expect(await db.appSale.count({ where: { appUserId: user.id } })).toBe(0)
  })

  it('blocks a live Stripe subscription even when another manual sale has a later end date', async () => {
    const request = input('stripe')
    const user = await db.appUser.create({ data: { email: request.email, firstName: 'Stripe', lastName: 'Customer' } })
    await db.appSale.createMany({ data: [
      { appUserId: user.id, subscriptionId: premiumId, status: 'active', currentPeriodEnd: new Date('2027-10-01T00:00:00Z') },
      { appUserId: user.id, subscriptionId: premiumId, status: 'active', currentPeriodEnd: new Date('2026-11-01T00:00:00Z'), stripeSubscriptionId: `${prefix}-stripe` },
    ] })
    await expect(grant(request)).rejects.toMatchObject({ reason: 'active-subscription' })
    expect(await db.consumerAccessGrant.count({ where: { recipientId: user.id } })).toBe(0)
    expect(await db.appSale.count({ where: { appUserId: user.id } })).toBe(2)
  })

  it('rolls back the newly created account and entitlement when the final audit write fails', async () => {
    const request = input('rollback')
    const salesBefore = await db.appSale.count()
    await db.$executeRaw`ALTER TABLE consumer_access_grants ADD CONSTRAINT consumer_access_qa_failure CHECK (notes IS DISTINCT FROM 'qa-force-rollback')`
    try {
      await expect(grant({ ...request, notes: 'qa-force-rollback' })).rejects.toThrow()
      expect(await db.appUser.count({ where: { email: request.email } })).toBe(0)
      expect(await db.appSale.count()).toBe(salesBefore)
    } finally {
      await db.$executeRaw`ALTER TABLE consumer_access_grants DROP CONSTRAINT consumer_access_qa_failure`
    }
  })

  it('retains immutable audit/request identity after consumer deletion and does not recreate access on retry', async () => {
    const request = input('deleted')
    const result = await grant(request)
    await db.appUser.delete({ where: { id: result.appUserId } })
    expect(await db.consumerAccessGrant.findUnique({ where: { id: result.id } })).toMatchObject({ appUserId: null, appSaleId: null, recipientId: result.appUserId, requestId: request.requestId, createdById: operatorId })
    await expect(grant(request)).rejects.toMatchObject({ reason: 'request-completed' })
    expect(await db.appUser.count({ where: { email: request.email } })).toBe(0)
  })

  it('a request cannot be reused to grant a different email', async () => {
    const request = input('request')
    await grant(request)
    const other = input('changed').email
    await expect(grant({ ...request, email: other })).rejects.toMatchObject({ reason: 'request-conflict' })
    expect(await db.appUser.count({ where: { email: other } })).toBe(0)
  })

  it('a fresh gift after expiry lasts twelve months from today, preserving the earlier audit', async () => {
    const request = input('renewal')
    const first = await grant(request)
    vi.setSystemTime(new Date('2027-10-07T15:00:00Z'))
    const renewed = await grant({ ...request, requestId: randomUUID() })
    expect(renewed).toMatchObject({ appUserId: first.appUserId, expiresAt: new Date('2028-10-07T15:00:00Z'), credentialsCreated: false, alreadyGranted: false })
    expect(await db.consumerAccessGrant.count({ where: { recipientId: first.appUserId } })).toBe(2)
  })
})
