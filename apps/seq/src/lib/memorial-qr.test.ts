import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@genealogiq/db'

const { customer, consume } = vi.hoisted(() => ({ customer: vi.fn(), consume: vi.fn() }))
vi.mock('@/queries/customers', () => ({ getCustomerForTenant: customer }))
vi.mock('@genealogiq/services/credits', () => ({ consumeCreditForActivation: consume }))
import { issueCustomerMemorialQr } from './memorial-qr'

const input = { tenantId: 'tenant', customerId: 'customer', profileId: 'profile', actorId: 'operator' }
const db = { $queryRaw: vi.fn(), genCode: { findUnique: vi.fn(), update: vi.fn() }, qrCode: { upsert: vi.fn() } }
const run = () => issueCustomerMemorialQr(db as unknown as Prisma.TransactionClient, input)
beforeEach(() => {
  vi.resetAllMocks()
  db.$queryRaw.mockResolvedValueOnce([{ id: 'profile' }]).mockResolvedValue([{ id: 'code', status: 'AVAILABLE', soldAt: null }])
  customer.mockResolvedValue({ guardiansOf: [{ appUser: { id: 'profile', qrAccess: 'allowed', profileUrl: 'https://example.test/profile/profile' } }] })
  consume.mockResolvedValue('credit-consume')
  db.qrCode.upsert.mockResolvedValue({ url: 'https://example.test/profile/profile' })
})

describe('memorial QR stock accounting', () => {
  it('records the buyer, operator, activation and credit before persisting the QR', async () => {
    expect(await run()).toEqual({ profileUrl: 'https://example.test/profile/profile', issued: true })
    expect(customer).toHaveBeenCalledWith('customer', 'tenant', db)
    expect(consume).toHaveBeenCalledExactlyOnceWith(db, { tenantId: 'tenant', genCodeId: 'code' })
    expect(db.genCode.update).toHaveBeenCalledWith({ where: { id: 'code' }, data: {
      status: 'ACTIVATED', appUserId: 'profile', activatedAt: expect.any(Date), creditTransactionId: 'credit-consume',
      soldAt: expect.any(Date), soldVia: 'PLATFORM', soldById: 'operator', soldToAppUserId: 'customer',
    } })
    expect(db.qrCode.upsert).toHaveBeenCalledWith({ where: { appUserId: 'profile' }, create: { appUserId: 'profile', url: 'https://example.test/profile/profile' }, update: {}, select: { url: true } })
  })
  it('preserves sale metadata when consuming a code already sold to the customer', async () => {
    db.$queryRaw.mockReset().mockResolvedValueOnce([{ id: 'profile' }]).mockResolvedValueOnce([{ id: 'purchased', status: 'SOLD', soldAt: new Date('2026-10-01') }])
    await run()
    expect(db.genCode.update).toHaveBeenCalledWith({ where: { id: 'purchased' }, data: {
      status: 'ACTIVATED', appUserId: 'profile', activatedAt: expect.any(Date), creditTransactionId: 'credit-consume', soldAt: new Date('2026-10-01'),
    } })
  })
  it('reuses a linked plaque even from another tenant without another consumption', async () => {
    db.genCode.findUnique.mockResolvedValue({ id: 'existing' })
    expect((await run()).issued).toBe(false)
    expect(consume).not.toHaveBeenCalled()
    expect(db.genCode.update).not.toHaveBeenCalled()
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
  })
  it.each(['premiumRequired', 'limitReached'])('checks %s before allocating stock', async (reason) => {
    customer.mockResolvedValue({ guardiansOf: [{ appUser: { id: 'profile', qrAccess: reason } }] })
    await expect(run()).rejects.toThrow(reason)
    expect(consume).not.toHaveBeenCalled()
    expect(db.qrCode.upsert).not.toHaveBeenCalled()
  })
  it('denies missing or foreign guardianships before reading customer data', async () => {
    db.$queryRaw.mockReset().mockResolvedValue([])
    await expect(run()).rejects.toThrow('notFound')
    expect(customer).not.toHaveBeenCalled()
  })
  it('rejects empty stock instead of creating an unaccounted QR', async () => {
    db.$queryRaw.mockReset().mockResolvedValueOnce([{ id: 'profile' }]).mockResolvedValueOnce([])
    await expect(run()).rejects.toThrow('stockUnavailable')
    expect(db.qrCode.upsert).not.toHaveBeenCalled()
  })
})
