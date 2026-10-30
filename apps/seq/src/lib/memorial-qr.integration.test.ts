import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@genealogiq/db'

const url = process.env.SEQ_QR_TEST_DATABASE_URL
// HTTP session verification is covered by the action tests/runtime. This suite
// exercises the actual SQL authorization using the explicit tenant argument.
vi.mock('@/lib/dal', () => ({ verifyTenantSession: () => { throw new Error('Unexpected session read') } }))

describe.skipIf(!url)('SEQ QR issuance on PostgreSQL', () => {
  let db: PrismaClient
  let issue: typeof import('./memorial-qr').issueCustomerMemorialQr
  let grant: typeof import('@genealogiq/services/partner-onboarding').grantInitialGenCodes
  let sell: typeof import('@genealogiq/services/partner-consumer-access').recordCustomerGenCodeSale
  let actorId: string
  let premiumId: string
  const prefix = `seq-qr-${randomUUID().slice(0, 8)}`

  beforeAll(async () => {
    const target = new URL(url!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
      || !/^\/genealogiq_coupon_qa_[a-z0-9_]+$/.test(target.pathname)) throw new Error('Disposable loopback database required')
    process.env.DATABASE_URL = url!
    db = (await import('@genealogiq/db')).prisma
    issue = (await import('./memorial-qr')).issueCustomerMemorialQr
    grant = (await import('@genealogiq/services/partner-onboarding')).grantInitialGenCodes
    sell = (await import('@genealogiq/services/partner-consumer-access')).recordCustomerGenCodeSale
    actorId = (await db.user.create({ data: { email: `${prefix}@genealogiq.test`, firstName: 'QR', lastName: 'Operator', role: 'ADMIN', isActive: true } })).id
    premiumId = (await db.subscription.findUniqueOrThrow({ where: { code: 'PREMIUM' } })).id
  })
  afterAll(async () => { await db?.$disconnect() })

  async function fixture(quantity: number, premium = true) {
    const key = `${prefix}-${randomUUID().slice(0, 8)}`
    const tenant = await db.tenant.create({ data: { name: key, tradeName: key, taxId: key, email: `${key}@genealogiq.test`, phone: '11999999999', entityType: 'COMPANY' } })
    if (quantity) await db.$transaction((tx) => grant(tx, { tenantId: tenant.id, quantity, createdById: actorId }))
    const customer = await db.appUser.create({ data: { tenantId: tenant.id, firstName: 'QR', lastName: 'Customer', email: `${key}-customer@genealogiq.test`, isActive: true } })
    if (premium) await db.appSale.create({ data: { appUserId: customer.id, tenantId: tenant.id, subscriptionId: premiumId, status: 'active', currentPeriodEnd: new Date('2030-01-01'), value: 0 } })
    const profile = await db.appUser.create({ data: { firstName: 'QR', lastName: 'Memorial', role: 'APP_MEMO', guardedBy: { create: { guardianId: customer.id, status: 'ACCEPTED' } } } })
    return { tenantId: tenant.id, customerId: customer.id, profileId: profile.id, actorId }
  }
  const run = (input: Parameters<typeof issue>[1]) => db.$transaction((tx) => issue(tx, input), { timeout: 15_000 })
  async function counts(tenantId: string) {
    return {
      available: await db.genCode.count({ where: { tenantId, status: 'AVAILABLE' } }),
      sold: await db.genCode.count({ where: { tenantId, soldAt: { not: null } } }),
      activated: await db.genCode.count({ where: { tenantId, status: 'ACTIVATED' } }),
      consumed: await db.creditTransaction.count({ where: { tenantId, type: 'CONSUME' } }),
    }
  }

  it('changes 400/0/0 to 399/1/1 once, including concurrent generation and reload', async () => {
    const input = await fixture(400)
    expect(await counts(input.tenantId)).toEqual({ available: 400, sold: 0, activated: 0, consumed: 0 })
    const results = await Promise.all([run(input), run(input), run(input)])
    expect(results.filter((r) => r.issued)).toHaveLength(1)
    expect(await counts(input.tenantId)).toEqual({ available: 399, sold: 1, activated: 1, consumed: 1 })
    expect(await db.genCode.findUnique({ where: { appUserId: input.profileId } })).toMatchObject({ soldToAppUserId: input.customerId, soldById: actorId, status: 'ACTIVATED' })
    expect(await db.qrCode.count({ where: { appUserId: input.profileId } })).toBe(1)
    expect((await run(input)).issued).toBe(false)
    expect(await counts(input.tenantId)).toEqual({ available: 399, sold: 1, activated: 1, consumed: 1 })
  })
  it('accounts for a legacy QR while preserving its URL and print status', async () => {
    const input = await fixture(1)
    await db.qrCode.create({ data: { appUserId: input.profileId, url: 'https://example.test/preserved', status: 'PRINTED', printedAt: new Date('2026-10-01') } })
    expect(await run(input)).toEqual({ issued: true, profileUrl: 'https://example.test/preserved' })
    expect(await db.qrCode.findUnique({ where: { appUserId: input.profileId } })).toMatchObject({ status: 'PRINTED', printedAt: new Date('2026-10-01') })
    expect(await counts(input.tenantId)).toEqual({ available: 0, sold: 1, activated: 1, consumed: 1 })
  })
  it('uses the existing customer purchase and its committed credit without another stock deduction', async () => {
    const input = await fixture(2)
    const purchase = await db.$transaction((tx) => sell(tx, { tenantId: input.tenantId, appUserId: input.customerId, actorId, requestId: randomUUID(), currency: 'BRL' }))
    expect(await counts(input.tenantId)).toEqual({ available: 1, sold: 1, activated: 0, consumed: 0 })
    await run(input)
    expect(await counts(input.tenantId)).toEqual({ available: 1, sold: 1, activated: 1, consumed: 1 })
    expect(await db.genCode.findUnique({ where: { genCode: purchase.genCode } })).toMatchObject({ appUserId: input.profileId })
    expect(await db.creditReservation.findFirst({ where: { tenantId: input.tenantId } })).toMatchObject({ status: 'CONSUMED' })
  })
  it('allows only one of two different memorials to take the last unit', async () => {
    const input = await fixture(1)
    const other = await db.appUser.create({ data: { firstName: 'QR', lastName: 'Pet', role: 'APP_PET', guardedBy: { create: { guardianId: input.customerId, status: 'ACCEPTED' } } } })
    const results = await Promise.allSettled([run(input), run({ ...input, profileId: other.id })])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    expect(await counts(input.tenantId)).toEqual({ available: 0, sold: 1, activated: 1, consumed: 1 })
    expect(await db.qrCode.count({ where: { appUserId: { in: [input.profileId, other.id] } } })).toBe(1)
  })
  it('reuses a plaque for an accepted guardian in another tenant without consuming that tenant stock', async () => {
    const owner = await fixture(1)
    const other = await fixture(1, false)
    const first = await run(owner)
    await db.appUserGuardian.create({ data: { appUserId: owner.profileId, guardianId: other.customerId, status: 'ACCEPTED' } })
    expect(await run({ ...other, profileId: owner.profileId })).toEqual({ ...first, issued: false })
    expect(await counts(owner.tenantId)).toEqual({ available: 0, sold: 1, activated: 1, consumed: 1 })
    expect(await counts(other.tenantId)).toEqual({ available: 1, sold: 0, activated: 0, consumed: 0 })
    expect(await db.appUser.findUnique({ where: { id: owner.profileId } })).toMatchObject({ tenantId: null })
  })
  it('never takes the only code when it was sold to another buyer', async () => {
    const input = await fixture(1)
    const buyer = await db.appUser.create({ data: { tenantId: input.tenantId, firstName: 'Another', lastName: 'Buyer', email: `${randomUUID()}@genealogiq.test`, isActive: true } })
    await db.$transaction((tx) => sell(tx, { tenantId: input.tenantId, appUserId: buyer.id, actorId, requestId: randomUUID(), currency: 'BRL' }))
    await expect(run(input)).rejects.toThrow('stockUnavailable')
    expect(await counts(input.tenantId)).toEqual({ available: 0, sold: 1, activated: 0, consumed: 0 })
    expect(await db.qrCode.count({ where: { appUserId: input.profileId } })).toBe(0)
  })
  it('denies another tenant, pending guardianship and FREE before any stock write', async () => {
    const input = await fixture(1, false)
    await expect(run({ ...input, tenantId: 'foreign' })).rejects.toThrow('notFound')
    await expect(run(input)).rejects.toThrow('premiumRequired')
    await db.appUserGuardian.update({ where: { appUserId_guardianId: { appUserId: input.profileId, guardianId: input.customerId } }, data: { status: 'PENDING' } })
    await expect(run(input)).rejects.toThrow('notFound')
    expect(await counts(input.tenantId)).toEqual({ available: 1, sold: 0, activated: 0, consumed: 0 })
    expect(await db.qrCode.count({ where: { appUserId: input.profileId } })).toBe(0)
  })
  it('rejects empty stock and unfunded inventory without persisting a QR', async () => {
    const input = await fixture(0)
    await expect(run(input)).rejects.toThrow('stockUnavailable')
    await db.genCode.create({ data: { tenantId: input.tenantId, genCode: `${prefix}-unfunded` } })
    await expect(run(input)).rejects.toThrow('no credit available')
    expect(await counts(input.tenantId)).toEqual({ available: 1, sold: 0, activated: 0, consumed: 0 })
    expect(await db.qrCode.count({ where: { appUserId: input.profileId } })).toBe(0)
  })
  it('rolls back the debit and binding if persisting the QR fails', async () => {
    const input = await fixture(1)
    await expect(db.$transaction((tx) => issue({ ...tx, qrCode: { ...tx.qrCode, upsert: async () => { throw new Error('QR storage failed') } } } as unknown as typeof tx, input))).rejects.toThrow('QR storage failed')
    expect(await counts(input.tenantId)).toEqual({ available: 1, sold: 0, activated: 0, consumed: 0 })
    expect(await db.creditGrant.findFirst({ where: { tenantId: input.tenantId } })).toMatchObject({ remainingQty: 1 })
    expect(await db.qrCode.count({ where: { appUserId: input.profileId } })).toBe(0)
  })
})
