import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, verify } = vi.hoisted(() => ({ verify: vi.fn(), db: {
  appUser: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
} }))
vi.mock('@genealogiq/db', () => ({ prisma: db }))
vi.mock('@/lib/consumer-access', () => ({ verifyConsumerAdmin: verify }))
import { getConsumers, getConsumerForRegistration } from './consumers'

beforeEach(() => { vi.resetAllMocks(); db.appUser.count.mockResolvedValue(26); db.appUser.findMany.mockResolvedValue([]) })
describe('BMS APP consumer directory', () => {
  it('requires privileged access before listing or reading customer details', async () => {
    verify.mockRejectedValue(new Error('FORBIDDEN'))
    await expect(getConsumers()).rejects.toThrow('FORBIDDEN')
    await expect(getConsumerForRegistration('consumer')).rejects.toThrow('FORBIDDEN')
    expect(db.appUser.findMany).not.toHaveBeenCalled()
    expect(db.appUser.count).not.toHaveBeenCalled()
    expect(db.appUser.findFirst).not.toHaveBeenCalled()
  })
  it('searches APP customers and their partner company with bounded pagination', async () => {
    expect(await getConsumers(' Ana ', 2)).toMatchObject({ total: 26, page: 2, pages: 2 })
    const query = db.appUser.findMany.mock.calls[0][0]
    expect(query.where).toEqual({ role: 'APP_USER', OR: [
      { firstName: { contains: 'Ana', mode: 'insensitive' } }, { lastName: { contains: 'Ana', mode: 'insensitive' } }, { email: { contains: 'Ana', mode: 'insensitive' } },
      { tenant: { is: { OR: [
        { name: { contains: 'Ana', mode: 'insensitive' } },
        { tradeName: { contains: 'Ana', mode: 'insensitive' } },
      ] } } },
    ] })
    expect(query).toMatchObject({ take: 25, skip: 25 })
    expect(query.select).not.toHaveProperty('password')
    expect(query.select).not.toHaveProperty('googleId')
    expect(query.select).toMatchObject({
      isActive: true, createdAt: true, tenantId: true,
      tenant: { select: { id: true, name: true, tradeName: true } },
    })
  })
  it('includes every APP_USER regardless of partner, creator, activation or missing email by default', async () => {
    expect(await getConsumers()).toMatchObject({ status: 'all' })
    expect(db.appUser.count).toHaveBeenCalledWith({ where: { role: 'APP_USER' } })
    expect(db.appUser.findMany.mock.calls[0][0].where).toEqual({ role: 'APP_USER' })
  })
  it('includes the stable gift identity, revocation date and actual sale status for safe directory actions', async () => {
    await getConsumers()
    expect(db.appUser.findMany.mock.calls[0][0].select.consumerAccessGrants).toEqual({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: {
        id: true, expiresAt: true, emailSentAt: true, revokedAt: true,
        appSale: { select: { status: true, currentPeriodEnd: true } },
      },
    })
  })
  it.each([
    ['active', true],
    ['inactive', false],
  ] as const)('filters %s accounts across all partners in both the count and results', async (status, isActive) => {
    expect(await getConsumers('', 1, status)).toMatchObject({ status })
    expect(db.appUser.count).toHaveBeenCalledWith({ where: { role: 'APP_USER', isActive } })
    expect(db.appUser.findMany.mock.calls[0][0].where).toEqual({ role: 'APP_USER', isActive })
  })
  it('ignores an unknown status and resets an invalid page without hiding accounts', async () => {
    expect(await getConsumers('', -1, 'unexpected')).toMatchObject({ status: 'all', page: 1 })
    expect(db.appUser.findMany.mock.calls[0][0]).toMatchObject({ where: { role: 'APP_USER' }, take: 25, skip: 0 })
  })
  it('does not prefill a tenant-owned or inactive account by a submitted id', async () => {
    await getConsumerForRegistration('submitted-id')
    expect(db.appUser.findFirst.mock.calls[0][0].where).toEqual({ id: 'submitted-id', tenantId: null, role: 'APP_USER', isActive: true })
  })
})
