import { createHash, randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@genealogiq/db'

vi.mock('server-only', () => ({}))
const url = process.env.CONSUMER_ACCESS_TEST_DATABASE_URL
describe.skipIf(!url)('consumer Premium revocation on PostgreSQL', () => {
  let db: PrismaClient
  let grant: typeof import('./consumer-access').grantConsumerPremium
  let revoke: typeof import('./consumer-access').revokeConsumerPremium
  let operatorId: string
  let premiumId: string
  const prefix = `revoke-${randomUUID().slice(0, 8)}`
  const now = new Date('2026-10-09T15:00:00Z')
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
    const service = await import('./consumer-access')
    grant = service.grantConsumerPremium
    revoke = service.revokeConsumerPremium
    operatorId = (await db.user.create({ data: { email: `${prefix}-operator@genealogiq.test`, firstName: 'QA', lastName: 'Operator', role: 'SUPER_ADMIN', isActive: true } })).id
    premiumId = (await db.subscription.findUniqueOrThrow({ where: { code: 'PREMIUM' } })).id
  })
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
  afterEach(() => vi.useRealTimers())
  afterAll(async () => { await db?.$disconnect() })

  const activeSales = (appUserId: string) => db.appSale.findMany({
    where: { appUserId, status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: now } },
    orderBy: { currentPeriodEnd: 'desc' },
  })

  it('ends only the gift and falls back to the independently purchased Premium period', async () => {
    const request = input('paid')
    const user = await db.appUser.create({ data: { firstName: 'Original', lastName: 'Name', email: request.email, password: 'original-hash', isActive: true, emailVerified: new Date('2025-01-01T00:00:00Z') } })
    const paid = await db.appSale.create({ data: { appUserId: user.id, subscriptionId: premiumId, status: 'active', value: 150, currentPeriodEnd: new Date('2027-01-31T15:00:00Z') } })
    const gifted = await grant({ ...request, notes: 'Original reason' })
    await db.consumerAccessGrant.update({ where: { id: gifted.id }, data: { emailSentAt: new Date('2026-10-09T15:01:00Z') } })
    const beforeUser = await db.appUser.findUniqueOrThrow({ where: { id: user.id } })
    expect(await revoke(gifted.id, operatorId)).toEqual({ alreadyRevoked: false })
    expect(await activeSales(user.id)).toEqual([paid])
    expect(await db.appUser.findUniqueOrThrow({ where: { id: user.id } })).toEqual(beforeUser)
    const audit = await db.consumerAccessGrant.findUniqueOrThrow({ where: { id: gifted.id }, include: { appSale: true } })
    expect(audit).toMatchObject({ startsAt: new Date('2027-01-31T15:00:00Z'), expiresAt: new Date('2028-01-31T15:00:00Z'),
      notes: 'Original reason', emailSentAt: new Date('2026-10-09T15:01:00Z'), createdById: operatorId, revokedAt: now, revokedById: operatorId })
    expect(audit.appSale).toMatchObject({ status: 'canceled', canceledAt: now, endedAt: now, cancelAtPeriodEnd: true, currentPeriodEnd: new Date('2028-01-31T15:00:00Z') })
    expect(await db.appSale.count({ where: { appUserId: user.id } })).toBe(2)
  })

  it('removes the only entitlement without deleting the account, password or its access recovery link', async () => {
    const request = input('only')
    const gifted = await grant(request)
    const account = await db.appUser.findUniqueOrThrow({ where: { id: gifted.appUserId } })
    const token = await db.passwordResetToken.create({ data: { appUserId: gifted.appUserId, token: `${prefix}-hashed-fixture`, expiresAt: new Date('2026-10-12T15:00:00Z') } })
    await revoke(gifted.id, operatorId)
    expect(await activeSales(gifted.appUserId)).toEqual([])
    expect(await db.appUser.findUniqueOrThrow({ where: { id: gifted.appUserId } })).toEqual(account)
    expect(await db.passwordResetToken.findUnique({ where: { id: token.id } })).toEqual(token)
    expect(await db.consumerAccessGrant.count({ where: { recipientId: gifted.appUserId } })).toBe(1)
  })

  it('does not resurrect migration-origin test access when the replacement gift is revoked', async () => {
    const request = input('legacy')
    const user = await db.appUser.create({ data: { firstName: 'Legacy', lastName: 'Family', email: request.email } })
    const legacyId = `test-premium-${createHash('md5').update(user.id).digest('hex')}`
    await db.appSale.create({ data: { id: legacyId, appUserId: user.id, subscriptionId: premiumId, status: 'active', value: 0, currentPeriodEnd: new Date('2099-12-31T23:59:59Z') } })
    const gifted = await grant(request)
    expect(gifted.expiresAt).toEqual(new Date('2027-10-09T15:00:00Z'))
    await revoke(gifted.id, operatorId)
    expect(await activeSales(user.id)).toEqual([])
    expect(await db.appSale.findUnique({ where: { id: legacyId } })).toMatchObject({ status: 'canceled', endedAt: now })
  })

  it('serializes two administrators and preserves the first cancellation audit on further retries', async () => {
    const gifted = await grant(input('concurrent'))
    const other = await db.user.create({ data: { email: `${prefix}-other@genealogiq.test`, firstName: 'Other', lastName: 'Admin', role: 'SUPER_ADMIN' } })
    const results = await Promise.all([revoke(gifted.id, operatorId), revoke(gifted.id, other.id)])
    expect(results.filter((r) => r.alreadyRevoked)).toHaveLength(1)
    expect(results.filter((r) => !r.alreadyRevoked)).toHaveLength(1)
    const firstAudit = await db.consumerAccessGrant.findUniqueOrThrow({ where: { id: gifted.id } })
    expect([operatorId, other.id]).toContain(firstAudit.revokedById)
    vi.setSystemTime(new Date('2026-10-10T15:00:00Z'))
    expect(await revoke(gifted.id, other.id)).toEqual({ alreadyRevoked: true })
    expect(await db.consumerAccessGrant.findUniqueOrThrow({ where: { id: gifted.id } })).toEqual(firstAudit)
    expect(await activeSales(gifted.appUserId)).toEqual([])
  })

  it('allows a fresh gift after cancellation but neither an old grant request nor a stale revoke can change it', async () => {
    const request = input('replacement')
    const first = await grant(request)
    await revoke(first.id, operatorId)
    await expect(grant(request)).rejects.toMatchObject({ reason: 'grant-revoked' })
    vi.setSystemTime(new Date('2026-10-10T15:00:00Z'))
    const replacement = await grant({ ...request, requestId: randomUUID() })
    expect(replacement).toMatchObject({ appUserId: first.appUserId, alreadyGranted: false, credentialsCreated: false, expiresAt: new Date('2027-10-10T15:00:00Z') })
    expect(replacement.id).not.toBe(first.id)
    expect(await revoke(first.id, operatorId)).toEqual({ alreadyRevoked: true })
    const sales = await activeSales(first.appUserId)
    expect(sales).toHaveLength(1)
    expect(sales[0]).toMatchObject({ status: 'active', currentPeriodEnd: new Date('2027-10-10T15:00:00Z') })
    expect(await db.consumerAccessGrant.count({ where: { recipientId: first.appUserId } })).toBe(2)
  })

  it('rejects an arbitrary paid sale id and a gift transferred to a partner', async () => {
    const gifted = await grant(input('partner'))
    const audit = await db.consumerAccessGrant.findUniqueOrThrow({ where: { id: gifted.id } })
    await expect(revoke(audit.resultId, operatorId)).rejects.toMatchObject({ reason: 'grant-unavailable' })
    const tenant = await db.tenant.findFirstOrThrow()
    await db.appUser.update({ where: { id: gifted.appUserId }, data: { tenantId: tenant.id } })
    await expect(revoke(gifted.id, operatorId)).rejects.toMatchObject({ reason: 'partner-account' })
    expect(await db.consumerAccessGrant.findUnique({ where: { id: gifted.id } })).toMatchObject({ revokedAt: null, revokedById: null })
    expect(await activeSales(gifted.appUserId)).toHaveLength(1)
  })

  it('allows removal from an inactive independent account even after its email is removed', async () => {
    const gifted = await grant(input('inactive'))
    await db.appUser.update({ where: { id: gifted.appUserId }, data: { isActive: false, email: null } })
    expect(await revoke(gifted.id, operatorId)).toEqual({ alreadyRevoked: false })
    expect(await db.appUser.findUnique({ where: { id: gifted.appUserId } })).toMatchObject({ isActive: false, email: null })
    expect(await activeSales(gifted.appUserId)).toEqual([])
  })

  it('does not cancel an expired gift or a gift row that now represents a provider payment', async () => {
    const expired = await grant(input('expired'))
    vi.setSystemTime(new Date('2027-10-09T15:00:00Z'))
    await expect(revoke(expired.id, operatorId)).rejects.toMatchObject({ reason: 'grant-unavailable' })
    vi.setSystemTime(now)
    const provider = await grant(input('provider'))
    const sale = await db.appSale.findFirstOrThrow({ where: { appUserId: provider.appUserId } })
    await db.appSale.update({ where: { id: sale.id }, data: { stripeSubscriptionId: `${prefix}-subscription`, value: 199 } })
    await expect(revoke(provider.id, operatorId)).rejects.toMatchObject({ reason: 'grant-unavailable' })
    expect(await db.appSale.findUnique({ where: { id: sale.id } })).toMatchObject({ status: 'active', canceledAt: null, endedAt: null })
  })

  it('rolls back the sale cancellation when the final audit update fails', async () => {
    const gifted = await grant({ ...input('rollback'), notes: 'qa-force-revocation-rollback' })
    const before = await activeSales(gifted.appUserId)
    await db.$executeRaw`ALTER TABLE consumer_access_grants ADD CONSTRAINT consumer_revoke_qa_failure CHECK (notes IS DISTINCT FROM 'qa-force-revocation-rollback' OR revoked_at IS NULL)`
    try {
      await expect(revoke(gifted.id, operatorId)).rejects.toThrow()
      expect(await activeSales(gifted.appUserId)).toEqual(before)
      expect(await db.consumerAccessGrant.findUnique({ where: { id: gifted.id } })).toMatchObject({ revokedAt: null, revokedById: null })
    } finally { await db.$executeRaw`ALTER TABLE consumer_access_grants DROP CONSTRAINT consumer_revoke_qa_failure` }
    expect(await revoke(gifted.id, operatorId)).toEqual({ alreadyRevoked: false })
  })

  it('retains cancellation identity after account deletion and never restores it on either replay', async () => {
    const request = input('deleted')
    const gifted = await grant(request)
    await revoke(gifted.id, operatorId)
    await db.appUser.delete({ where: { id: gifted.appUserId } })
    expect(await revoke(gifted.id, operatorId)).toEqual({ alreadyRevoked: true })
    expect(await db.consumerAccessGrant.findUnique({ where: { id: gifted.id } })).toMatchObject({ appUserId: null, appSaleId: null, recipientId: gifted.appUserId, revokedAt: now, revokedById: operatorId })
    await expect(grant(request)).rejects.toMatchObject({ reason: 'grant-revoked' })
    expect(await db.appUser.count({ where: { email: request.email } })).toBe(0)
  })
})
