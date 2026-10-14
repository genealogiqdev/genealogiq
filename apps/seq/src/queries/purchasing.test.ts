import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { verifyTenantSession, findFirst, findMany } = vi.hoisted(() => ({
  verifyTenantSession: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
}))
vi.mock('@/lib/dal', () => ({ verifyTenantSession }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  genCodePackage: { findFirst }, genCodeOrder: { findMany },
} }))
import { getGenCodePackageOffer, getGenCodePackageOrders } from './purchasing'

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'))
  verifyTenantSession.mockResolvedValue({ customerId: 'own-tenant' })
})
afterEach(() => vi.useRealTimers())

describe('package storefront reads', () => {
  it('offers only the active BRL package and serializes the catalog price', async () => {
    findFirst.mockResolvedValue({ unitPrice: '150.00', currency: 'BRL', minimumQuantity: 20, stripeProductId: 'prod_1', stripePriceId: 'price_1' })
    expect(await getGenCodePackageOffer()).toEqual({ unitPrice: 150, currency: 'BRL', minimumQuantity: 20, available: true })
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'GENCODE_VIRTUAL_BRL', currency: 'BRL', isActive: true } }))
  })

  it('allows a preview but disables buying an unsynchronized offer', async () => {
    findFirst.mockResolvedValue({ unitPrice: '150.00', currency: 'BRL', minimumQuantity: 20, stripeProductId: null, stripePriceId: null })
    expect(await getGenCodePackageOffer()).toMatchObject({ unitPrice: 150, available: false })
  })

  it('scopes every order to the current tenant and preserves paid price snapshots', async () => {
    findMany.mockResolvedValue([
      { id: 'paid', quantity: 50, totalAmount: '6750.00', discountAmount: '750.00', discountCode: 'GENCODES10', status: 'PAID', checkoutExpiresAt: new Date('2026-10-13T12:00:00Z') },
      { id: 'old-link', totalAmount: '3000.00', discountAmount: '0.00', status: 'PENDING', checkoutExpiresAt: new Date('2026-10-14T12:00:00Z') },
      { id: 'current-link', totalAmount: '3000.00', discountAmount: '0.00', status: 'PENDING', checkoutExpiresAt: new Date('2026-10-15T12:00:00Z') },
    ])
    expect(await getGenCodePackageOrders()).toMatchObject([
      { id: 'paid', totalAmount: 6750, discountAmount: 750, status: 'PAID' },
      { id: 'old-link', status: 'EXPIRED' },
      { id: 'current-link', status: 'PENDING' },
    ])
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'own-tenant' }, orderBy: { createdAt: 'desc' } }))
  })

  it('does not read offers or orders after a session rejection', async () => {
    verifyTenantSession.mockRejectedValue(new Error('session required'))
    await expect(getGenCodePackageOffer()).rejects.toThrow('session required')
    await expect(getGenCodePackageOrders()).rejects.toThrow('session required')
    expect(findFirst).not.toHaveBeenCalled()
    expect(findMany).not.toHaveBeenCalled()
  })
})
