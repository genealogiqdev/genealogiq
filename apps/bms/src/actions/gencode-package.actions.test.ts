import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, checkoutMock, syncMock, emailMock, revalidateMock } = vi.hoisted(() => ({
  prismaMock: { tenant: { findUnique: vi.fn() } },
  checkoutMock: vi.fn(),
  syncMock: vi.fn(),
  emailMock: vi.fn(),
  revalidateMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string>) =>
    values?.email ? `${key}:${values.email}` : values?.message ? `${key}:${values.message}` : key),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/dal', () => ({
  verifyAdmin: vi.fn(async () => ({ user: { id: 'admin_1' } })),
}))
vi.mock('@/lib/email', () => ({ sendSalePaymentLinkEmail: emailMock }))
vi.mock('@genealogiq/services/partner-checkout', () => ({
  CHECKOUT_ORIGINS: { bms: 'bms', seq: 'seq' },
}))
vi.mock('@genealogiq/services/gencode-package', () => {
  class GenCodePackageCheckoutError extends Error {
    constructor(readonly reason: string, message: string) {
      super(message)
    }
  }
  return {
    GenCodePackageCheckoutError,
    openGenCodePackageCheckout: checkoutMock,
    syncGenCodePackage: syncMock,
  }
})

import { sendGenCodePackageLink, syncGenCodePackageWithStripe } from './gencode-package.actions'

const valid = { packageId: 'pkg_1', tenantId: 'tenant_1', quantity: 20 }

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.tenant.findUnique.mockResolvedValue({
    name: 'Funerária Exemplo',
    email: 'financeiro@example.com',
  })
  checkoutMock.mockResolvedValue({
    url: 'https://checkout.stripe.test/cs_1',
    orderId: 'order_1',
    packageName: 'Pacote de Gencodes',
    quantity: 20,
    totalAmount: 3_000,
    currency: 'BRL',
    expiresAt: new Date('2026-09-22T12:00:00Z'),
  })
})

describe('sendGenCodePackageLink', () => {
  it('rejects a quantity below 20 before opening checkout', async () => {
    const result = await sendGenCodePackageLink({ ...valid, quantity: 19 })
    expect(result).toEqual({ ok: false, message: 'gencodePackage.invalidData' })
    expect(checkoutMock).not.toHaveBeenCalled()
  })

  it('opens checkout as the authenticated operator and emails the exact total', async () => {
    const result = await sendGenCodePackageLink(valid)

    expect(result.ok).toBe(true)
    expect(checkoutMock).toHaveBeenCalledWith(expect.objectContaining({
      ...valid,
      createdById: 'admin_1',
      origin: 'bms',
    }))
    expect(emailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'financeiro@example.com',
      productName: 'Pacote de Gencodes',
      quantity: 20,
      amount: expect.stringMatching(/3[.\s]?000,00/),
    }))
    expect(revalidateMock).toHaveBeenCalledWith('/gencodes')
  })
})

describe('syncGenCodePackageWithStripe', () => {
  it('syncs the selected package and refreshes the catalogue', async () => {
    const result = await syncGenCodePackageWithStripe('pkg_1')
    expect(result).toEqual({ ok: true, message: 'gencodePackage.synced' })
    expect(syncMock).toHaveBeenCalledWith('pkg_1')
    expect(revalidateMock).toHaveBeenCalledWith('/gencodes')
  })
})

