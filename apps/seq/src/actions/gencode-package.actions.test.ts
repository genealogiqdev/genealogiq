import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { verifyTenantSession, findFirst, openGenCodePackageCheckout } = vi.hoisted(() => ({
  verifyTenantSession: vi.fn(), findFirst: vi.fn(), openGenCodePackageCheckout: vi.fn(),
}))
vi.mock('@/lib/dal', () => ({ verifyTenantSession }))
vi.mock('@/lib/prisma', () => ({ prisma: { genCodePackage: { findFirst } } }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('@genealogiq/services/gencode-package', () => ({
  openGenCodePackageCheckout,
  GenCodePackageCheckoutError: class extends Error {
    constructor(readonly reason: string, message: string) { super(message) }
  },
}))
vi.mock('@genealogiq/services/partner-checkout', () => ({ CHECKOUT_ORIGINS: { seq: 'seq' } }))

import { purchaseGenCodePackage } from './gencode-package.actions'
import { GenCodePackageCheckoutError } from '@genealogiq/services/gencode-package'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('SEQUOIA_URL', 'https://seq.example.test')
  verifyTenantSession.mockResolvedValue({ customerId: 'own-tenant', user: { id: 'own-staff', role: 'USER' } })
  findFirst.mockResolvedValue({ id: 'canonical-package' })
  openGenCodePackageCheckout.mockResolvedValue({ url: 'https://checkout.stripe.test/fixture' })
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('self-service package purchase', () => {
  it('accepts only quantity from the browser and uses the verified tenant and operator', async () => {
    expect(await purchaseGenCodePackage({
      quantity: 50, tenantId: 'other-tenant', createdById: 'other-staff',
      packageId: 'private-package', discountCouponId: 'manual-100', totalAmount: 0,
    } as never)).toEqual({ ok: true, data: { url: 'https://checkout.stripe.test/fixture' } })
    expect(findFirst).toHaveBeenCalledWith({
      where: { code: 'GENCODE_VIRTUAL_BRL', currency: 'BRL', isActive: true }, select: { id: true },
    })
    expect(openGenCodePackageCheckout).toHaveBeenCalledWith({
      quantity: 50, tenantId: 'own-tenant', createdById: 'own-staff', packageId: 'canonical-package',
      origin: 'seq', successUrl: 'https://seq.example.test/purchasing/packages?status=success',
      cancelUrl: 'https://seq.example.test/purchasing/packages?status=cancel',
    })
  })

  it.each([19, 0, -1, 20.5, NaN, Infinity, '50', null])('rejects quantity %s before reading the catalog or creating a checkout', async (quantity) => {
    expect((await purchaseGenCodePackage({ quantity } as never)).ok).toBe(false)
    expect(findFirst).not.toHaveBeenCalled()
    expect(openGenCodePackageCheckout).not.toHaveBeenCalled()
  })

  it('propagates the session guard before catalog or payment work', async () => {
    verifyTenantSession.mockRejectedValue(new Error('session required'))
    await expect(purchaseGenCodePackage({ quantity: 20 })).rejects.toThrow('session required')
    expect(findFirst).not.toHaveBeenCalled()
    expect(openGenCodePackageCheckout).not.toHaveBeenCalled()
  })

  it('reports an inactive or missing catalog offer', async () => {
    findFirst.mockResolvedValue(null)
    expect(await purchaseGenCodePackage({ quantity: 20 })).toEqual({ ok: false, message: 'unavailable' })
    expect(openGenCodePackageCheckout).not.toHaveBeenCalled()
  })

  it.each([
    ['package-not-synced', 'unavailable'], ['tenant-inactive', 'tenantInactive'], ['invalid-quantity', 'invalidQuantity'],
  ] as const)('translates %s into useful feedback', async (reason, message) => {
    openGenCodePackageCheckout.mockRejectedValue(new GenCodePackageCheckoutError(reason, 'internal details'))
    expect(await purchaseGenCodePackage({ quantity: 20 })).toEqual({ ok: false, message })
  })

  it('does not expose provider error details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    openGenCodePackageCheckout.mockRejectedValue(new Error('private provider detail'))
    expect(await purchaseGenCodePackage({ quantity: 20 })).toEqual({ ok: false, message: 'checkoutFailed' })
  })

  it('returns to SEQ port 3002 when no origin is configured', async () => {
    vi.stubEnv('SEQUOIA_URL', undefined)
    await purchaseGenCodePackage({ quantity: 20 })
    expect(openGenCodePackageCheckout).toHaveBeenCalledWith(expect.objectContaining({
      successUrl: 'http://localhost:3002/purchasing/packages?status=success',
      cancelUrl: 'http://localhost:3002/purchasing/packages?status=cancel',
    }))
  })
})
