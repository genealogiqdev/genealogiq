import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, verify } = vi.hoisted(() => ({ verify: vi.fn(), db: {
  appUser: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
} }))
vi.mock('@genealogiq/db', () => ({ prisma: db }))
vi.mock('@/lib/consumer-access', () => ({ verifyConsumerAdmin: verify }))
import { getConsumers, getConsumerForRegistration } from './consumers'

beforeEach(() => { vi.resetAllMocks(); db.appUser.count.mockResolvedValue(26); db.appUser.findMany.mockResolvedValue([]) })
describe('BMS independent consumer directory', () => {
  it('requires privileged access before listing or reading customer details', async () => {
    verify.mockRejectedValue(new Error('FORBIDDEN'))
    await expect(getConsumers()).rejects.toThrow('FORBIDDEN')
    await expect(getConsumerForRegistration('consumer')).rejects.toThrow('FORBIDDEN')
    expect(db.appUser.findMany).not.toHaveBeenCalled()
    expect(db.appUser.findFirst).not.toHaveBeenCalled()
  })
  it('limits directory and searched results to independent living APP customers with bounded pagination', async () => {
    expect(await getConsumers(' Ana ', 2)).toMatchObject({ total: 26, page: 2, pages: 2 })
    const query = db.appUser.findMany.mock.calls[0][0]
    expect(query.where).toEqual({ role: 'APP_USER', tenantId: null, email: { not: null }, OR: [
      { firstName: { contains: 'Ana', mode: 'insensitive' } }, { lastName: { contains: 'Ana', mode: 'insensitive' } }, { email: { contains: 'Ana', mode: 'insensitive' } },
    ] })
    expect(query).toMatchObject({ take: 25, skip: 25 })
    expect(query.select).not.toHaveProperty('password')
    expect(query.select).not.toHaveProperty('googleId')
  })
  it('does not prefill a tenant-owned or inactive account by a submitted id', async () => {
    await getConsumerForRegistration('submitted-id')
    expect(db.appUser.findFirst.mock.calls[0][0].where).toEqual({ id: 'submitted-id', tenantId: null, role: 'APP_USER', isActive: true })
  })
})
