import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, verify, revalidate } = vi.hoisted(() => ({
  db: { $transaction: vi.fn(), $queryRaw: vi.fn(), appUser: { findFirst: vi.fn(), updateMany: vi.fn() }, tenant: { findFirst: vi.fn() } },
  verify: vi.fn(), revalidate: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/consumer-access', () => ({ verifyConsumerAdmin: verify }))
vi.mock('next/cache', () => ({ revalidatePath: revalidate }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
import { linkConsumerPartner } from './consumer-partner.actions'

beforeEach(() => {
  vi.resetAllMocks()
  verify.mockResolvedValue({ user: { id: 'live-platform-admin' } })
  db.$transaction.mockImplementation((run) => run(db))
  db.appUser.findFirst.mockResolvedValue({ tenantId: null })
  db.tenant.findFirst.mockResolvedValue({ id: 'partner-a' })
  db.appUser.updateMany.mockResolvedValue({ count: 1 })
})

describe('link an existing APP customer to a Sequoia company', () => {
  it('updates only affiliation and the live operator; leaves account, plan, guardians and codes intact', async () => {
    expect(await linkConsumerPartner(' consumer-a ', ' partner-a ')).toEqual({ ok: true, message: 'linked' })
    expect(db.appUser.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'consumer-a', role: 'APP_USER' }, select: { tenantId: true },
    })
    expect(db.tenant.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'partner-a', isActive: true, users: { some: { isActive: true } } }, select: { id: true },
    })
    expect(db.appUser.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'consumer-a', role: 'APP_USER', tenantId: null },
      data: { tenantId: 'partner-a', updatedById: 'live-platform-admin' },
    })
    expect(db.$queryRaw.mock.calls[0][0].join('?')).toBe('SELECT id FROM app_users WHERE id = ? FOR UPDATE')
    expect(db.$queryRaw.mock.calls[0][1]).toBe('consumer-a')
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.appUser.findFirst.mock.invocationCallOrder[0])
    expect(revalidate).toHaveBeenCalledWith('/consumers')
  })

  it('denies ordinary staff or revoked platform sessions before any database work', async () => {
    verify.mockRejectedValue(new Error('FORBIDDEN'))
    await expect(linkConsumerPartner('consumer', 'partner')).rejects.toThrow('FORBIDDEN')
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it.each([['', 'partner'], ['consumer', ' '], ['x'.repeat(129), 'partner'], ['consumer', 'x'.repeat(129)]])(
    'rejects malformed identifiers', async (consumer, partner) => {
      expect(await linkConsumerPartner(consumer, partner)).toEqual({ ok: false, message: 'errors.invalidData' })
      expect(db.$transaction).not.toHaveBeenCalled()
    })

  it('rejects a missing customer or a memorial/pet profile', async () => {
    db.appUser.findFirst.mockResolvedValue(null)
    expect(await linkConsumerPartner('memorial', 'partner-a')).toEqual({ ok: false, message: 'errors.consumerUnavailable' })
    expect(db.appUser.updateMany).not.toHaveBeenCalled()
    expect(db.tenant.findFirst).not.toHaveBeenCalled()
  })

  it('rechecks company activation and active staff at submission, not just in the picker', async () => {
    db.tenant.findFirst.mockResolvedValue(null)
    expect(await linkConsumerPartner('consumer-a', 'inactive-partner')).toEqual({ ok: false, message: 'errors.partnerUnavailable' })
    expect(db.appUser.updateMany).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('returns an idempotent success for the same company without rewriting the operator', async () => {
    db.appUser.findFirst.mockResolvedValue({ tenantId: 'partner-a' })
    expect(await linkConsumerPartner('consumer-a', 'partner-a')).toEqual({ ok: true, message: 'alreadyLinked' })
    expect(db.appUser.updateMany).not.toHaveBeenCalled()
  })

  it('never transfers a customer already linked by another operator', async () => {
    db.appUser.findFirst.mockResolvedValue({ tenantId: 'partner-b' })
    expect(await linkConsumerPartner('consumer-a', 'partner-a')).toEqual({ ok: false, message: 'errors.alreadyAssigned' })
    expect(db.appUser.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a conditional write conflict and never reports false success', async () => {
    db.appUser.updateMany.mockResolvedValue({ count: 0 })
    expect(await linkConsumerPartner('consumer-a', 'partner-a')).toEqual({ ok: false, message: 'errors.alreadyAssigned' })
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('returns a recoverable error on transaction failure without exposing details', async () => {
    db.$transaction.mockRejectedValue(new Error('private database detail'))
    expect(await linkConsumerPartner('consumer-a', 'partner-a')).toEqual({ ok: false, message: 'errors.failed' })
    expect(revalidate).not.toHaveBeenCalled()
  })
})
