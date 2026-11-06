import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import type { PrismaClient } from '@genealogiq/db'

const url = process.env.B2B_TEST_DATABASE_URL
describe.skipIf(!url)('B2B resale on PostgreSQL', () => {
  let db: PrismaClient
  let sell: typeof import('./business-gencode-sale').recordBusinessGenCodeSale
  let assign: typeof import('./business-gencode-recipient').assignBusinessGenCode
  let grant: typeof import('@genealogiq/services/partner-onboarding').grantInitialGenCodes
  let credits: typeof import('@genealogiq/services/credits')
  let claim: typeof import('@genealogiq/services/reseller-activation').claimResellerCode
  let actorId: string
  const prefix = `b2b-${randomUUID().slice(0, 8)}`
  beforeAll(async () => {
    const target = new URL(url!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !/^\/genealogiq_coupon_qa_[a-z0-9_]+$/.test(target.pathname)) throw new Error('Disposable loopback database required')
    process.env.DATABASE_URL = url!
    db = (await import('@genealogiq/db')).prisma
    sell = (await import('./business-gencode-sale')).recordBusinessGenCodeSale
    assign = (await import('./business-gencode-recipient')).assignBusinessGenCode
    grant = (await import('@genealogiq/services/partner-onboarding')).grantInitialGenCodes
    credits = await import('@genealogiq/services/credits')
    claim = (await import('@genealogiq/services/reseller-activation')).claimResellerCode
    actorId = (await db.user.create({ data: { email: `${prefix}@genealogiq.test`, firstName: 'B2B', lastName: 'Admin', role: 'ADMIN', isActive: true } })).id
  })
  afterAll(async () => { await db?.$disconnect() })
  async function fixture(quantity: number) {
    const key = `${prefix}-${randomUUID().slice(0, 8)}`
    const tenant = await db.tenant.create({ data: { name: key, tradeName: key, taxId: key, email: `${key}@genealogiq.test`, entityType: 'COMPANY', phone: '11999999999' } })
    if (quantity) await db.$transaction(tx => grant(tx, { tenantId: tenant.id, quantity, createdById: actorId }))
    const business = await db.businessCustomer.create({ data: { tenantId: tenant.id, name: 'Acme Print', tradeName: 'Acme', taxId: '11222333000181', segment: 'PLAQUE_PRINTER', contactName: '', email: '', phone: '' } })
    return { tenantId: tenant.id, customerId: business.id, actorId, requestId: randomUUID(), quantity, genCode: '' }
  }
  const recipient = (input: Awaited<ReturnType<typeof fixture>>, genCode: string, email = `${randomUUID()}@genealogiq.test`) => ({
    tenantId: input.tenantId, businessCustomerId: input.customerId, actorId, genCode, email,
    firstName: 'Ana', lastName: 'Silva', token: `synthetic-${randomUUID()}`, currency: 'BRL',
  })
  it('claims a printed wholesale code from a self-registered account without prior SEQ delivery', async () => {
    const input = await fixture(20)
    const stock = await db.genCode.findMany({ where: { tenantId: input.tenantId }, orderBy: { genCode: 'asc' } })
    await db.genCode.updateMany({ where: { tenantId: input.tenantId }, data: { printedAt: new Date() } })
    await sell(db, { ...input, genCode: stock.map(code => code.genCode).join(',') })
    expect(await db.appUser.count({ where: { tenantId: input.tenantId } })).toBe(0)
    const buyer = await db.appUser.create({ data: { firstName: 'Final', lastName: 'Buyer', email: `${randomUUID()}@genealogiq.test`, role: 'APP_USER', isActive: true } })
    const code = stock[0]
    await db.$transaction(async tx => {
      await claim(tx, { genCodeId: code.id, tenantId: input.tenantId, buyerId: buyer.id, currency: 'BRL' })
      const memo = await tx.appUser.create({ data: { firstName: 'Urn', lastName: 'Memorial', role: 'APP_MEMO' } })
      const creditTransactionId = await credits.consumeCreditForActivation(tx, { tenantId: input.tenantId, genCodeId: code.id })
      await tx.genCode.update({ where: { id: code.id }, data: { status: 'ACTIVATED', appUserId: memo.id, activatedAt: new Date(), creditTransactionId } })
    })
    expect(await db.appUser.findUnique({ where: { id: buyer.id } })).toMatchObject({ tenantId: input.tenantId })
    expect(await db.genCode.findUnique({ where: { id: code.id } })).toMatchObject({ soldToAppUserId: buyer.id, status: 'ACTIVATED', businessSaleId: input.requestId })
    expect(await db.appSale.count({ where: { appUserId: buyer.id, tenantId: input.tenantId } })).toBe(1)
    expect(await credits.getCreditBalance(input.tenantId)).toMatchObject({ total: 19, general: 0, committed: 19 })
    expect(await db.genCode.count({ where: { tenantId: input.tenantId, status: 'SOLD', soldToAppUserId: null } })).toBe(19)
  })
  it('allows one final buyer under a claim race and rolls back a failed memorial after claiming', async () => {
    const input = await fixture(1); await sell(db, input)
    const code = await db.genCode.findFirstOrThrow({ where: { businessSaleId: input.requestId } })
    const buyers = await Promise.all([1,2].map(() => db.appUser.create({ data: { firstName: 'Buyer', lastName: 'Test', email: `${randomUUID()}@genealogiq.test`, role: 'APP_USER', isActive: true } })))
    await expect(db.$transaction(async tx => { await claim(tx, { genCodeId: code.id, tenantId: input.tenantId, buyerId: buyers[0].id, currency: 'BRL' }); throw new Error('memorial failure') })).rejects.toThrow('memorial failure')
    expect(await db.appUser.findUnique({ where: { id: buyers[0].id } })).toMatchObject({ tenantId: null })
    expect(await db.genCode.findUnique({ where: { id: code.id } })).toMatchObject({ soldToAppUserId: null })
    const results = await Promise.allSettled(buyers.map(buyer => db.$transaction(tx => claim(tx, { genCodeId: code.id, tenantId: input.tenantId, buyerId: buyer.id, currency: 'BRL' }))))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await db.appSale.count({ where: { tenantId: input.tenantId } })).toBe(1)
  })
  it('rejects a foreign final account and expired wholesale stock without moving the customer', async () => {
    const input = await fixture(1); await sell(db, input)
    const other = await fixture(0)
    const buyer = await db.appUser.create({ data: { firstName: 'Foreign', lastName: 'Buyer', email: `${randomUUID()}@genealogiq.test`, tenantId: other.tenantId, role: 'APP_USER', isActive: true } })
    const code = await db.genCode.findFirstOrThrow({ where: { businessSaleId: input.requestId } })
    await expect(db.$transaction(tx => claim(tx, { genCodeId: code.id, tenantId: input.tenantId, buyerId: buyer.id, currency: 'BRL' }))).rejects.toThrow('recipient')
    await db.appUser.update({ where: { id: buyer.id }, data: { tenantId: null } })
    await db.creditReservation.update({ where: { genCodeId: code.id }, data: { expiresAt: new Date('2000-01-01') } })
    await expect(db.$transaction(tx => claim(tx, { genCodeId: code.id, tenantId: input.tenantId, buyerId: buyer.id, currency: 'BRL' }))).rejects.toThrow()
    expect(await db.appUser.findUnique({ where: { id: buyer.id } })).toMatchObject({ tenantId: null })
    expect(await db.genCode.findUnique({ where: { id: code.id } })).toMatchObject({ soldToAppUserId: null })
  })
  it('sells 50, assigns one, activates one, and never debits a second stock unit or credit', async () => {
    const input = await fixture(50)
    await sell(db, input)
    await sell(db, input)
    expect(await db.genCode.count({ where: { tenantId: input.tenantId, status: 'AVAILABLE' } })).toBe(0)
    expect(await db.genCode.count({ where: { tenantId: input.tenantId, status: 'SOLD', soldToAppUserId: null } })).toBe(50)
    expect(await db.businessGenCodeSale.count({ where: { tenantId: input.tenantId } })).toBe(1)
    expect(await credits.getCreditBalance(input.tenantId)).toMatchObject({ total: 50, general: 0, committed: 50 })
    const code = await db.genCode.findFirstOrThrow({ where: { businessSaleId: input.requestId } })
    const delivery = recipient(input, code.genCode)
    const first = await db.$transaction(tx => assign(tx, delivery))
    const second = await db.$transaction(tx => assign(tx, delivery))
    expect(second.consumer.id).toBe(first.consumer.id)
    expect(await db.appUser.count({ where: { email: delivery.email } })).toBe(1)
    expect(await db.appSale.count({ where: { appUserId: first.consumer.id } })).toBe(1)
    expect(await db.genCode.count({ where: { tenantId: input.tenantId, status: 'SOLD', soldToAppUserId: null } })).toBe(49)
    expect(await credits.getCreditBalance(input.tenantId)).toMatchObject({ total: 50, general: 0, committed: 50 })
    expect(await credits.canActivate(input.tenantId, code.id)).toBe(true)
    await db.$transaction(async tx => {
      const memo = await tx.appUser.create({ data: { firstName: 'Memorial', lastName: 'Test', role: 'APP_MEMO' } })
      const transactionId = await credits.consumeCreditForActivation(tx, { tenantId: input.tenantId, genCodeId: code.id })
      await tx.genCode.update({ where: { id: code.id }, data: { status: 'ACTIVATED', appUserId: memo.id, activatedAt: new Date(), creditTransactionId: transactionId } })
    })
    expect(await credits.getCreditBalance(input.tenantId)).toMatchObject({ total: 49, general: 0, committed: 49 })
    expect(await db.genCode.count({ where: { tenantId: input.tenantId, status: 'ACTIVATED' } })).toBe(1)
    expect(await db.creditTransaction.count({ where: { tenantId: input.tenantId, type: 'CONSUME' } })).toBe(1)
    expect(await db.genCode.count({ where: { businessSaleId: input.requestId } })).toBe(50)
  }, 30000)
  it('rolls back the whole lot if there are too few codes or no backing credits', async () => {
    const input = await fixture(1)
    await expect(sell(db, { ...input, quantity: 2 })).rejects.toThrow('stockUnavailable')
    await db.creditGrant.updateMany({ where: { tenantId: input.tenantId }, data: { remainingQty: 0 } })
    await expect(sell(db, input)).rejects.toThrow('creditsUnavailable')
    expect(await db.businessGenCodeSale.count({ where: { tenantId: input.tenantId } })).toBe(0)
    expect(await db.genCode.count({ where: { tenantId: input.tenantId, status: 'AVAILABLE' } })).toBe(1)
  })
  it('allows only one reseller to buy the final unit', async () => {
    const input = await fixture(1)
    const other = await db.businessCustomer.create({ data: { tenantId: input.tenantId, name: 'Other', tradeName: '', taxId: 'other', segment: 'OTHER', contactName: '', email: '', phone: '' } })
    const results = await Promise.allSettled([sell(db, input), sell(db, { ...input, customerId: other.id, requestId: randomUUID() })])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await db.businessGenCodeSale.count({ where: { tenantId: input.tenantId } })).toBe(1)
    expect(await db.genCode.count({ where: { tenantId: input.tenantId, status: 'SOLD' } })).toBe(1)
  })
  it('rejects changed request data, another tenant and inactive resellers', async () => {
    const input = await fixture(2)
    await sell(db, input)
    await expect(sell(db, { ...input, quantity: 1 })).rejects.toThrow('requestConflict')
    await expect(sell(db, { ...input, tenantId: 'foreign' })).rejects.toThrow('notFound')
    await db.businessCustomer.update({ where: { id: input.customerId }, data: { isActive: false } })
    await expect(sell(db, { ...input, requestId: randomUUID() })).rejects.toThrow('inactive')
  })
  it('uses an existing account unchanged and preserves its purchased Premium time', async () => {
    const input = await fixture(1); await sell(db, input)
    const code = await db.genCode.findFirstOrThrow({ where: { businessSaleId: input.requestId } })
    const email = `${randomUUID()}@genealogiq.test`
    const customer = await db.appUser.create({ data: { email, firstName: 'Original', lastName: 'Name', password: 'existing-hash', tenantId: input.tenantId, role: 'APP_USER', isActive: true } })
    const premium = await db.subscription.findUniqueOrThrow({ where: { code: 'PREMIUM' } })
    await db.appSale.create({ data: { appUserId: customer.id, subscriptionId: premium.id, value: 100, status: 'active', currentPeriodEnd: new Date('2030-01-01T00:00:00Z') } })
    const result = await db.$transaction(tx => assign(tx, recipient(input, code.genCode, email)))
    expect(result.consumer).toMatchObject({ id: customer.id, firstName: 'Original', lastName: 'Name', password: 'existing-hash' })
    expect(result.needsOnboarding).toBe(false)
    expect(await db.appSale.findFirst({ where: { appUserId: customer.id, value: 0 } })).toMatchObject({ currentPeriodEnd: new Date('2031-01-01T00:00:00Z') })
  })
  it('rejects foreign recipients, expired stock and reassignment with no partial account', async () => {
    const input = await fixture(1); await sell(db, input)
    const code = await db.genCode.findFirstOrThrow({ where: { businessSaleId: input.requestId } })
    const foreign = await fixture(0)
    const email = `${randomUUID()}@genealogiq.test`
    await db.appUser.create({ data: { email, firstName: 'Other', lastName: 'Tenant', tenantId: foreign.tenantId } })
    await expect(db.$transaction(tx => assign(tx, recipient(input, code.genCode, email)))).rejects.toThrow('recipientUnavailable')
    await db.creditReservation.update({ where: { genCodeId: code.id }, data: { expiresAt: new Date('2020-01-01') } })
    const delivery = recipient(input, code.genCode)
    await expect(db.$transaction(tx => assign(tx, delivery))).rejects.toThrow('no credit')
    expect(await db.appUser.count({ where: { email: delivery.email } })).toBe(0)
    expect(await db.genCode.findUnique({ where: { id: code.id } })).toMatchObject({ soldToAppUserId: null })
  })
  it('rejects two buyers for one code and rolls back the losing new account', async () => {
    const input = await fixture(1); await sell(db, input)
    const code = await db.genCode.findFirstOrThrow({ where: { businessSaleId: input.requestId } })
    const a = recipient(input, code.genCode); const b = recipient(input, code.genCode)
    const results = await Promise.allSettled([db.$transaction(tx => assign(tx, a)), db.$transaction(tx => assign(tx, b))])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await db.appUser.count({ where: { email: { in: [a.email, b.email] } } })).toBe(1)
    expect(await db.creditTransaction.count({ where: { tenantId: input.tenantId, idempotencyKey: { startsWith: 'reseller-buyer:' } } })).toBe(1)
  })
})
