import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@genealogiq/db'

vi.mock('server-only', () => ({}))
const url = process.env.MANUAL_COUPON_TEST_DATABASE_URL
describe.skipIf(!url)('partner onboarding on PostgreSQL', () => {
  let db: PrismaClient
  let grant: typeof import('./partner-onboarding').grantInitialGenCodes
  let credits: typeof import('./credits')
  const prefix = `onboarding-${randomUUID().slice(0, 8)}`
  const tenantData = (label: string) => ({ entityType: 'COMPANY' as const, name: label, tradeName: label,
    taxId: `${prefix}-${label}`, email: `${prefix}-${label}@genealogiq.test`, phone: '11955550100' })
  beforeAll(async () => {
    const target = new URL(url!)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
      || !/^\/genealogiq_coupon_qa_[a-z0-9_]+$/.test(target.pathname)) throw new Error('Disposable loopback test database required')
    process.env.DATABASE_URL = url!
    db = (await import('@genealogiq/db')).prisma
    grant = (await import('./partner-onboarding')).grantInitialGenCodes
    credits = await import('./credits')
  })
  afterAll(async () => { await db?.$disconnect() })

  it('funds exactly three activations without a purchase and rejects the fourth', async () => {
    const tenant = await db.$transaction(async (tx) => {
      const row = await tx.tenant.create({ data: tenantData('three') })
      await grant(tx, { tenantId: row.id, quantity: 3, createdById: 'fixture-operator' })
      return row
    })
    const codes = await db.genCode.findMany({ where: { tenantId: tenant.id } })
    expect(codes).toHaveLength(3)
    expect(await db.genCodeOrder.count({ where: { tenantId: tenant.id } })).toBe(0)
    expect(await db.partnerSubscription.count({ where: { tenantId: tenant.id } })).toBe(0)
    expect(await credits.getCreditBalance(tenant.id)).toMatchObject({ general: 3, total: 3 })
    expect(await credits.canActivate(tenant.id, codes[0].id)).toBe(true)
    for (const code of codes) await db.$transaction((tx) => credits.consumeCreditForActivation(tx, { tenantId: tenant.id, genCodeId: code.id }))
    expect(await credits.getCreditBalance(tenant.id)).toMatchObject({ general: 0, total: 0 })
    expect(await credits.canActivate(tenant.id, 'fourth')).toBe(false)
    await expect(db.$transaction((tx) => credits.consumeCreditForActivation(tx, { tenantId: tenant.id, genCodeId: 'fourth' }))).rejects.toThrow('no credit available')
    expect(await db.creditTransaction.count({ where: { tenantId: tenant.id, type: 'CONSUME' } })).toBe(3)
    expect(await db.creditTransaction.findUnique({ where: { idempotencyKey: `grant:registration:${tenant.id}` } })).toMatchObject({ actorId: 'fixture-operator', quantity: 3 })
  })

  it('zero persists the tenant with no credit or code and cannot activate', async () => {
    const tenant = await db.$transaction(async (tx) => {
      const row = await tx.tenant.create({ data: tenantData('zero') })
      await grant(tx, { tenantId: row.id, quantity: 0, createdById: 'fixture-operator' })
      return row
    })
    expect(await db.genCode.count({ where: { tenantId: tenant.id } })).toBe(0)
    expect(await db.creditGrant.count({ where: { tenantId: tenant.id } })).toBe(0)
    expect(await credits.canActivate(tenant.id, 'none')).toBe(false)
  })

  it('rolls back the tenant, owner, ledger and codes if registration fails', async () => {
    let tenantId = ''
    await expect(db.$transaction(async (tx) => {
      const row = await tx.tenant.create({ data: tenantData('rollback') })
      tenantId = row.id
      await tx.user.create({ data: { tenantId, email: `${prefix}-owner@genealogiq.test`, firstName: 'Test', lastName: 'Owner', role: 'OWNER', isActive: true } })
      await grant(tx, { tenantId, quantity: 2, createdById: 'fixture-operator' })
      throw new Error('fixture rollback')
    })).rejects.toThrow('fixture rollback')
    expect(await db.tenant.count({ where: { id: tenantId } })).toBe(0)
    expect(await db.user.count({ where: { tenantId } })).toBe(0)
    expect(await db.creditGrant.count({ where: { tenantId } })).toBe(0)
    expect(await db.creditTransaction.count({ where: { tenantId } })).toBe(0)
    expect(await db.genCode.count({ where: { tenantId } })).toBe(0)
  })

  it('a duplicate grant cannot increase the initial balance or stock', async () => {
    const tenant = await db.tenant.create({ data: tenantData('duplicate') })
    const input = { tenantId: tenant.id, quantity: 2, createdById: 'fixture-operator' }
    await db.$transaction((tx) => grant(tx, input))
    await expect(db.$transaction((tx) => grant(tx, input))).rejects.toMatchObject({ code: 'P2002' })
    expect(await db.creditGrant.count({ where: { tenantId: tenant.id } })).toBe(1)
    expect(await db.genCode.count({ where: { tenantId: tenant.id } })).toBe(2)
    expect(await credits.getCreditBalance(tenant.id)).toMatchObject({ total: 2 })
  })
})
