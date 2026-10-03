import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { db } = vi.hoisted(() => ({ db: { genCode: { count: vi.fn(), aggregate: vi.fn() }, appUser: { count: vi.fn() }, $queryRaw: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
import { getDashboardStats } from './dashboard'
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T12:00:00.000Z')) })
afterEach(() => vi.useRealTimers())
describe('tenant dashboard from independent aggregate rows', () => {
  it('folds null legacy channel as manual and preserves empty months', async () => {
    db.genCode.count.mockResolvedValue(4)
    db.appUser.count.mockResolvedValue(3)
    db.genCode.aggregate.mockResolvedValue({ _count: 2, _sum: { soldValue: '30.00' } })
    db.$queryRaw.mockResolvedValueOnce([
      { month: new Date('2026-10-01T12:00:00Z'), sold_via: null, revenue: '10.00', count: BigInt(1) },
      { month: new Date('2026-10-01T12:00:00Z'), sold_via: 'PLATFORM', revenue: '20.00', count: BigInt(1) },
    ]).mockResolvedValueOnce([{ month: new Date('2026-10-01T12:00:00Z'), count: BigInt(3) }])
    const result = await getDashboardStats('tenant-fixture')
    expect(result).toMatchObject({ availableQRCodes: 4, totalCustomers: 3, monthlyCount: 2, monthlyRevenue: 30, averageTicket: 15 })
    expect(result.monthlyRevenueChart).toHaveLength(12)
    expect(result.monthlyRevenueChart[0]).toEqual({ month: 'Nov', revenue: 0 })
    expect(result.monthlyRevenueChart[11]).toEqual({ month: 'Oct', revenue: 30 })
    expect(result.revenueByChannelChart).toEqual([{ name: 'PLATFORM', revenue: 20 }, { name: 'MANUAL', revenue: 10 }])
    expect(result.qrConsumptionChart[11]).toEqual({ month: 'Oct', count: 2 })
    expect(db.genCode.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-fixture', status: 'AVAILABLE' } })
    expect(db.appUser.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-fixture', role: 'APP_USER' } })
    for (const call of db.$queryRaw.mock.calls) expect(call.slice(1)).toContain('tenant-fixture')
  })
  it('reports empty measured values and avoids division by zero', async () => {
    db.genCode.count.mockResolvedValue(0); db.appUser.count.mockResolvedValue(0)
    db.genCode.aggregate.mockResolvedValue({ _count: 0, _sum: { soldValue: null } })
    db.$queryRaw.mockResolvedValue([])
    const result = await getDashboardStats('empty-tenant')
    expect(result.monthlyRevenue).toBe(0)
    expect(result.averageTicket).toBe(0)
    expect(result.monthlyRevenueChart.every((row) => row.revenue === 0)).toBe(true)
    expect(result.revenueByChannelChart).toEqual([])
  })
})
