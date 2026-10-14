import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@genealogiq/db'

vi.mock('server-only', () => ({}))
const url = process.env.PARTNER_CUSTOMER_TEST_DATABASE_URL

describe.skipIf(!url)('partner customers on PostgreSQL', () => {
  let db: PrismaClient
  let service: typeof import('./partner-consumer-access')
  let grantCodes: typeof import('./partner-onboarding').grantInitialGenCodes
  let operatorId: string
  let premiumId: string
  const prefix = `partner-customer-${randomUUID().slice(0, 8)}`
  const request = (tenantId: string, appUserId: string) => ({ tenantId, appUserId, actorId: operatorId, requestId: randomUUID(), currency: 'BRL' })

  beforeAll(async () => {
    const target = new URL(url!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
      || !/^\/genealogiq_coupon_qa_[a-z0-9_]+$/.test(target.pathname)) throw new Error('Disposable loopback test database required')
    process.env.DATABASE_URL = url!
    db = (await import('@genealogiq/db')).prisma
    service = await import('./partner-consumer-access')
    grantCodes = (await import('./partner-onboarding')).grantInitialGenCodes
    operatorId = (await db.user.create({ data: { email: `${prefix}-admin@genealogiq.test`, firstName: 'Local', lastName: 'Operator', role: 'SUPER_ADMIN', isActive: true } })).id
    premiumId = (await db.subscription.findUniqueOrThrow({ where: { code: 'PREMIUM' } })).id
  })
  afterAll(async () => { await db?.$disconnect() })

  async function tenant(label: string, quantity: number) {
    const row = await db.tenant.create({ data: { name: label, tradeName: label, taxId: `${prefix}-${label}`, email: `${prefix}-${label}@genealogiq.test`, phone: '11999999999', entityType: 'COMPANY' } })
    if (quantity) await db.$transaction((tx) => grantCodes(tx, { tenantId: row.id, quantity, createdById: operatorId }))
    return row.id
  }
  async function buyer(tenantId: string, label: string) {
    return db.appUser.create({ data: { tenantId, firstName: 'Ana', lastName: label, email: `${prefix}-${label}@genealogiq.test`, isActive: true, password: 'unchanged-fixture-password' } })
  }
  async function register(tenantId: string, label: string) {
    return db.$transaction(async (tx) => {
      const customer = await tx.appUser.create({ data: { tenantId, firstName: 'Ana', lastName: label, email: `${prefix}-${label}@genealogiq.test`, isActive: true } })
      await tx.passwordResetToken.create({ data: { appUserId: customer.id, token: randomUUID(), expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) } })
      return { appUserId: customer.id, ...await service.recordCustomerGenCodeSale(tx, { ...request(tenantId, customer.id), genCode: '' }) }
    }, { timeout: 15_000 })
  }

  it('automatically selects one available code for a blank form field and atomically registers the customer with finite Premium', async () => {
    const tenantId = await tenant('one-sale', 3)
    const before = new Date()
    const result = await register(tenantId, 'new')
    const code = await db.genCode.findUniqueOrThrow({ where: { genCode: result.genCode } })
    expect(code).toMatchObject({ tenantId, status: 'SOLD', soldToAppUserId: result.appUserId, soldById: operatorId, soldVia: 'PLATFORM', activatedAt: null })
    expect(await db.genCode.count({ where: { tenantId, status: 'AVAILABLE' } })).toBe(2)
    expect(await db.genCode.count({ where: { tenantId, soldAt: { not: null } } })).toBe(1)
    expect(await db.creditGrant.findFirst({ where: { tenantId, source: 'TOPUP' } })).toMatchObject({ remainingQty: 2 })
    expect(await db.creditGrant.findFirst({ where: { tenantId, source: 'COMMITTED' } })).toMatchObject({ remainingQty: 1, buyerId: result.appUserId, genCodeId: code.id })
    expect(await db.creditReservation.count({ where: { tenantId, status: 'HELD' } })).toBe(1)
    const gift = await db.consumerAccessGrant.findFirstOrThrow({ where: { appUserId: result.appUserId }, include: { appSale: true } })
    expect(gift.expiresAt.getUTCFullYear()).toBe(before.getUTCFullYear() + 1)
    expect(gift.expiresAt.getUTCMonth()).toBe(before.getUTCMonth())
    expect(gift.expiresAt.getUTCDate()).toBe(before.getUTCDate())
    expect(gift.appSale).toMatchObject({ tenantId, status: 'active', cancelAtPeriodEnd: true, stripeSubscriptionId: null })
    expect(Number(gift.appSale!.value)).toBe(0)
    expect(await db.emailOutbox.count({ where: { id: result.emailId! } })).toBe(1)
    expect(await db.passwordResetToken.count({ where: { appUserId: result.appUserId } })).toBe(1)
  })

  it('lets only one simultaneous registration take the final unit and rolls back the losing account', async () => {
    const tenantId = await tenant('last-unit', 1)
    const results = await Promise.allSettled([register(tenantId, 'race-a'), register(tenantId, 'race-b')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    expect(await db.appUser.count({ where: { tenantId } })).toBe(1)
    expect(await db.appSale.count({ where: { tenantId } })).toBe(1)
    expect(await db.genCode.count({ where: { tenantId, status: 'SOLD' } })).toBe(1)
    expect(await db.creditTransaction.count({ where: { tenantId, type: 'RESERVE' } })).toBe(1)
  })

  it('rolls back account and token when stock exists without a valid credit', async () => {
    const tenantId = await tenant('unfunded', 0)
    await db.genCode.create({ data: { tenantId, genCode: `${prefix}-unfunded` } })
    await expect(register(tenantId, 'no-credit')).rejects.toThrow('no credit available')
    expect(await db.appUser.count({ where: { tenantId } })).toBe(0)
    expect(await db.appSale.count({ where: { tenantId } })).toBe(0)
    expect(await db.genCode.count({ where: { tenantId, status: 'AVAILABLE' } })).toBe(1)
  })

  it('rolls back the credit reservation and registration when the final grant audit fails', async () => {
    const tenantId = await tenant('audit-rollback', 2)
    await db.$executeRawUnsafe(`ALTER TABLE consumer_access_grants ADD CONSTRAINT partner_customer_qa_audit_failure CHECK (notes <> 'Partner customer Premium access') NOT VALID`)
    try { await expect(register(tenantId, 'bad-audit')).rejects.toThrow('partner_customer_qa_audit_failure') }
    finally { await db.$executeRawUnsafe('ALTER TABLE consumer_access_grants DROP CONSTRAINT partner_customer_qa_audit_failure') }
    expect(await db.appUser.count({ where: { tenantId } })).toBe(0)
    expect(await db.appSale.count({ where: { tenantId } })).toBe(0)
    expect(await db.genCode.count({ where: { tenantId, status: 'AVAILABLE' } })).toBe(2)
    expect(await db.creditGrant.findFirst({ where: { tenantId, source: 'TOPUP' } })).toMatchObject({ remainingQty: 2 })
    expect(await db.creditGrant.count({ where: { tenantId, source: 'COMMITTED' } })).toBe(0)
    expect(await db.creditReservation.count({ where: { tenantId } })).toBe(0)
    expect(await db.creditTransaction.count({ where: { tenantId, type: 'RESERVE' } })).toBe(0)
  })

  it('retries the same sold code without a second sale or grant, including after disabling Premium', async () => {
    const tenantId = await tenant('retry-sale', 2)
    const result = await register(tenantId, 'repeat-buyer')
    const gift = await db.consumerAccessGrant.findFirstOrThrow({ where: { appUserId: result.appUserId } })
    await db.$transaction((tx) => service.revokePartnerConsumerPremium(tx, { tenantId, appUserId: result.appUserId, actorId: operatorId, grantId: gift.id }))
    const repeat = await db.$transaction((tx) => service.recordCustomerGenCodeSale(tx, { ...request(tenantId, result.appUserId), genCode: result.genCode }))
    expect(repeat).toMatchObject({ alreadySold: true, emailId: null })
    expect(await db.consumerAccessGrant.count({ where: { appUserId: result.appUserId } })).toBe(1)
    expect(await db.appSale.count({ where: { appUserId: result.appUserId, status: 'active' } })).toBe(0)
    expect(await db.genCode.count({ where: { tenantId, status: 'AVAILABLE' } })).toBe(1)
    expect(await db.genCode.count({ where: { tenantId, status: 'SOLD' } })).toBe(1)
    expect(await db.creditReservation.count({ where: { tenantId, status: 'HELD' } })).toBe(1)
  })

  it('preserves paid-through dates and protects a replacement grant from a stale revocation', async () => {
    const tenantId = await tenant('paid-customer', 0)
    const customer = await buyer(tenantId, 'paid-buyer')
    const paid = await db.appSale.create({ data: { appUserId: customer.id, subscriptionId: premiumId, value: 100,
      status: 'active', currentPeriodEnd: new Date('2027-01-31T15:00:00Z') } })
    const input = request(tenantId, customer.id)
    const first = await db.$transaction((tx) => service.grantPartnerConsumerPremium(tx, input))
    expect(first.expiresAt).toEqual(new Date('2028-01-31T15:00:00Z'))
    await db.$transaction((tx) => service.revokePartnerConsumerPremium(tx, { ...input, grantId: first.grantId }))
    await expect(db.$transaction((tx) => service.grantPartnerConsumerPremium(tx, input))).rejects.toThrow('grant-revoked')
    const next = await db.$transaction((tx) => service.grantPartnerConsumerPremium(tx, { ...input, requestId: randomUUID() }))
    await db.$transaction((tx) => service.revokePartnerConsumerPremium(tx, { ...input, grantId: first.grantId }))
    expect(await db.appSale.findUnique({ where: { id: paid.id } })).toMatchObject({ status: 'active', currentPeriodEnd: new Date('2027-01-31T15:00:00Z') })
    expect(await db.consumerAccessGrant.findUnique({ where: { id: next.grantId } })).toMatchObject({ revokedAt: null, expiresAt: new Date('2028-01-31T15:00:00Z') })
    expect(await db.appUser.findUnique({ where: { id: customer.id } })).toMatchObject({ password: 'unchanged-fixture-password' })
    expect(await db.genCode.count({ where: { tenantId } })).toBe(0)
  })

  it('rejects another tenant customer and never consumes the current tenant stock', async () => {
    const tenantId = await tenant('scope-a', 1)
    const otherId = await tenant('scope-b', 1)
    const customer = await buyer(otherId, 'other-buyer')
    await expect(db.$transaction((tx) => service.recordCustomerGenCodeSale(tx, request(tenantId, customer.id)))).rejects.toThrow('customer-unavailable')
    expect(await db.appSale.count({ where: { appUserId: customer.id } })).toBe(0)
    expect(await db.genCode.count({ where: { tenantId, status: 'AVAILABLE' } })).toBe(1)
  })
})
