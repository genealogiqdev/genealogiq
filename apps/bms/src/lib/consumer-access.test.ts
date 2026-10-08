import { beforeEach, describe, expect, it, vi } from 'vitest'

const { verify, lookup } = vi.hoisted(() => ({ verify: vi.fn(), lookup: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifyAdmin: verify }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: lookup } } }))
vi.mock('next/navigation', () => ({ forbidden: () => { throw new Error('FORBIDDEN') } }))
import { verifyConsumerAdmin } from './consumer-access'
import { isBmsStaff } from './staff-scope'

beforeEach(() => { vi.resetAllMocks(); verify.mockResolvedValue({ user: { id: 'operator' } }) })
describe('Genealogiq staff scope', () => {
  it.each(['OWNER', 'ADMIN', 'USER'])('rejects a tenant %s from BMS Credentials and Google scope', (role) => {
    expect(isBmsStaff({ role, tenantId: 'funeral-home' })).toBe(false)
  })
  it('allows platform staff and the unassignable platform SUPER_ADMIN role', () => {
    expect(isBmsStaff({ role: 'ADMIN', tenantId: null })).toBe(true)
    expect(isBmsStaff({ role: 'SUPER_ADMIN', tenantId: 'local-fixture' })).toBe(true)
  })
  it.each([
    null,
    { role: 'OWNER', isActive: true, tenantId: 'funeral-home' },
    { role: 'ADMIN', isActive: false, tenantId: null },
    { role: 'USER', isActive: true, tenantId: null },
  ])('rejects stale, deactivated, revoked or tenant-owned sessions before consumer access', async (current) => {
    lookup.mockResolvedValue(current)
    await expect(verifyConsumerAdmin()).rejects.toThrow('FORBIDDEN')
    expect(lookup).toHaveBeenCalledWith({ where: { id: 'operator' }, select: { role: true, isActive: true, tenantId: true } })
  })
  it('allows a currently active internal administrator', async () => {
    lookup.mockResolvedValue({ role: 'ADMIN', isActive: true, tenantId: null })
    expect(await verifyConsumerAdmin()).toEqual({ user: { id: 'operator' } })
  })
})
