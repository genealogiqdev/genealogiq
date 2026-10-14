import { beforeEach, describe, expect, it, vi } from 'vitest'

const { user, verify } = vi.hoisted(() => ({ user: vi.fn(), verify: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifyTenantSession: verify }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: user } } }))
vi.mock('next/navigation', () => ({ forbidden: () => { throw new Error('FORBIDDEN') } }))
import { canManageCustomerAccess, verifyCustomerAccessAdmin } from './customer-access'

beforeEach(() => {
  vi.resetAllMocks()
  verify.mockResolvedValue({ customerId: 'tenant-1', user: { id: 'operator-1', role: 'SUPER_ADMIN' } })
  user.mockResolvedValue({ role: 'OWNER', isActive: true, tenantId: 'tenant-1', tenant: { isActive: true } })
})
describe('SEQ live Premium administration', () => {
  it('allows the live administrator of the same active tenant', async () => {
    expect(await canManageCustomerAccess()).toBe(true)
    expect(await verifyCustomerAccessAdmin()).toMatchObject({ customerId: 'tenant-1' })
  })
  it.each([
    { role: 'USER', isActive: true, tenantId: 'tenant-1', tenant: { isActive: true } },
    { role: 'OWNER', isActive: false, tenantId: 'tenant-1', tenant: { isActive: true } },
    { role: 'OWNER', isActive: true, tenantId: 'other', tenant: { isActive: true } },
    { role: 'OWNER', isActive: true, tenantId: 'tenant-1', tenant: { isActive: false } },
    null,
  ])('rejects stale privilege, inactivity, changed affiliation or deleted staff', async (operator) => {
    user.mockResolvedValue(operator)
    expect(await canManageCustomerAccess()).toBe(false)
    await expect(verifyCustomerAccessAdmin()).rejects.toThrow('FORBIDDEN')
  })
})
