import { beforeEach, expect, it, vi } from 'vitest'
const { count, verify } = vi.hoisted(() => ({ count: vi.fn(), verify: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { genCode: { count } } }))
vi.mock('@/lib/dal', () => ({ verifyTenantSession: verify }))
import { getLicenseSummary } from './licenses'
beforeEach(() => { vi.resetAllMocks(); verify.mockResolvedValue({ customerId: 'tenant-1' }) })
it('keeps activated sales in the sold total and scopes every count to the partner', async () => {
  count.mockResolvedValueOnce(400).mockResolvedValueOnce(398).mockResolvedValueOnce(2).mockResolvedValueOnce(1)
  expect(await getLicenseSummary()).toEqual({ total: 400, available: 398, sold: 2, activated: 1 })
  expect(count.mock.calls.map(([args]) => args.where)).toEqual([
    { tenantId: 'tenant-1' }, { tenantId: 'tenant-1', status: 'AVAILABLE' },
    { tenantId: 'tenant-1', soldAt: { not: null } }, { tenantId: 'tenant-1', status: 'ACTIVATED' },
  ])
})
