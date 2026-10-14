import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query, verify } = vi.hoisted(() => ({ query: vi.fn(), verify: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: query } }))
vi.mock('@/lib/consumer-access', () => ({ verifyConsumerAdmin: verify }))
import { getPartnerGenCodeOverview } from './partner-gencodes'

beforeEach(() => vi.resetAllMocks())
describe('partner GenCode overview', () => {
  it('requires live platform administration before reading partner sales', async () => {
    verify.mockRejectedValue(new Error('FORBIDDEN'))
    await expect(getPartnerGenCodeOverview()).rejects.toThrow('FORBIDDEN')
    expect(query).not.toHaveBeenCalled()
  })
  it('shows zero-stock partners and counts an activated sale in both sold and activated', async () => {
    query.mockResolvedValue([
      { tenantId: 'a', tenantName: 'A', available: BigInt(398), sold: BigInt(2), activated: BigInt(1), pending: BigInt(1), lastSaleAt: new Date('2026-10-14') },
      { tenantId: 'b', tenantName: 'B', available: BigInt(0), sold: BigInt(0), activated: BigInt(0), pending: BigInt(0), lastSaleAt: null },
    ])
    const result = await getPartnerGenCodeOverview(' A ')
    expect(result.totals).toEqual({ available: 398, sold: 2, activated: 1, pending: 1 })
    expect(result.partners).toHaveLength(2)
    expect(result.partners[1]).toMatchObject({ available: 0, sold: 0, lastSaleAt: null })
    expect(result.search).toBe('A')
    const sql = query.mock.calls[0][0].join('')
    expect(sql).toContain('LEFT JOIN gencodes')
    expect(sql).toContain("FILTER (WHERE g.sold_at IS NOT NULL) AS sold")
    expect(sql).toContain("FILTER (WHERE g.status = 'ACTIVATED') AS activated")
  })
  it('does not turn a failed query into reassuring zero totals', async () => {
    query.mockRejectedValue(new Error('database unavailable'))
    await expect(getPartnerGenCodeOverview()).rejects.toThrow('database unavailable')
  })
})
