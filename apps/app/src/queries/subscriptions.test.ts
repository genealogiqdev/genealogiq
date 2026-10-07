import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findMany, prices } = vi.hoisted(() => ({ findMany: vi.fn(), prices: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { subscription: { findMany } } }))
vi.mock('@genealogiq/i18n/server', () => ({ resolveLocale: async () => 'pt-BR' }))
vi.mock('@genealogiq/services/subscription-price', () => ({ mapSubscriptionPrices: prices }))

import { getActiveSubscriptions } from './subscriptions'

beforeEach(() => {
  vi.resetAllMocks()
  findMany.mockResolvedValue([])
  prices.mockResolvedValue(new Map())
})

describe('subscription catalog and manually activated plans', () => {
  it('keeps arbitrary staff-created plans out of anonymous self-service offers', async () => {
    await getActiveSubscriptions()
    expect(findMany.mock.calls[0][0].where).toEqual({ OR: [{ isActive: true, code: { in: ['FREE', 'PREMIUM'] } }] })
  })

  it('includes the account’s manual plan with its actual price and quotas, even outside the public catalog', async () => {
    findMany.mockResolvedValue([{
      id: 'manual-plan', code: 'B2C-PARTNER', name: 'Family plan', description: null, termLength: 12,
      treeMaxMembers: 128, bioMaxChars: 8192, mediaMaxImages: 128, mediaMaxVideos: 32,
      documentsMax: 64, geoPlacesMax: 12, memorialsMax: 5, petsMax: 2, qrCodeMax: 5,
    }])
    prices.mockResolvedValue(new Map([['manual-plan', { annualAmount: 240, monthlyAmount: 24, currency: 'BRL' }]]))
    const rows = await getActiveSubscriptions('manual-plan')
    expect(findMany.mock.calls[0][0].where.OR).toEqual([
      { isActive: true, code: { in: ['FREE', 'PREMIUM'] } }, { id: 'manual-plan' },
    ])
    expect(rows).toEqual([expect.objectContaining({
      id: 'manual-plan', name: 'Family plan', price: 240, monthlyPrice: 24, currency: 'BRL',
      quotas: expect.objectContaining({ treeMaxMembers: 128, documentsMax: 64, petsMax: 2 }),
    })])
  })
})
