import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InsufficientCreditsError } from '@genealogiq/services/credits'

const { issue, transaction, session, refresh } = vi.hoisted(() => ({
  issue: vi.fn(), transaction: vi.fn(), session: vi.fn(), refresh: vi.fn(),
}))
vi.mock('@/lib/memorial-qr', async (original) => ({
  ...await original<typeof import('@/lib/memorial-qr')>(), issueCustomerMemorialQr: issue,
}))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: transaction } }))
vi.mock('@/lib/dal', () => ({ verifyTenantSession: session }))
vi.mock('next/cache', () => ({ revalidatePath: refresh }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
import { MemorialQrError } from '@/lib/memorial-qr'
import { getCustomerMemorialQr } from './memorial-qr.actions'

const tx = { fixture: 'transaction' }
beforeEach(() => {
  vi.resetAllMocks()
  session.mockResolvedValue({ customerId: 'tenant', user: { id: 'operator' } })
  transaction.mockImplementation((fn) => fn(tx))
  issue.mockResolvedValue({ profileUrl: 'https://example.test/profile/memorial', issued: true })
})

describe('customer memorial QR issuance', () => {
  it('uses the verified tenant and one transaction, then refreshes inventory and customer counters', async () => {
    expect(await getCustomerMemorialQr('customer', 'memorial')).toEqual({ ok: true, data: { profileUrl: 'https://example.test/profile/memorial' } })
    expect(issue).toHaveBeenCalledExactlyOnceWith(tx, { customerId: 'customer', profileId: 'memorial', tenantId: 'tenant', actorId: 'operator' })
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 })
    expect(refresh.mock.calls.flat()).toEqual(['/inventory/activations', '/dashboard', '/customers', '/customers/customer'])
  })
  it('returns the existing destination on re-export without invalidating unchanged stock', async () => {
    issue.mockResolvedValue({ profileUrl: 'https://example.test/qr/EXISTING', issued: false })
    expect(await getCustomerMemorialQr('customer', 'memorial')).toEqual({ ok: true, data: { profileUrl: 'https://example.test/qr/EXISTING' } })
    expect(refresh).not.toHaveBeenCalled()
  })
  it.each(['notFound', 'premiumRequired', 'limitReached', 'stockUnavailable'] as const)('reports %s without a successful generation', async (reason) => {
    issue.mockRejectedValue(new MemorialQrError(reason))
    expect(await getCustomerMemorialQr('customer', 'memorial')).toEqual({ ok: false, message: `qrCode.${reason}` })
    expect(refresh).not.toHaveBeenCalled()
  })
  it('reports missing credit after the transaction rolls back', async () => {
    issue.mockRejectedValue(new InsufficientCreditsError('tenant'))
    expect(await getCustomerMemorialQr('customer', 'memorial')).toEqual({ ok: false, message: 'qrCode.noCredit' })
    expect(refresh).not.toHaveBeenCalled()
  })
  it('propagates the session wall before any transaction', async () => {
    session.mockRejectedValue(new Error('Unauthorized'))
    await expect(getCustomerMemorialQr('customer', 'memorial')).rejects.toThrow('Unauthorized')
    expect(transaction).not.toHaveBeenCalled()
  })
  it.each([['', 'memorial'], ['customer', '  '], ['customer', 42]])('validates IDs before reading the database', async (customerId, profileId) => {
    expect(await getCustomerMemorialQr(customerId as string, profileId as string)).toEqual({ ok: false, message: 'common.invalidData' })
    expect(transaction).not.toHaveBeenCalled()
  })
})
