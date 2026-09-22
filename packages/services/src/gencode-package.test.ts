import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, txMock, stripeMock, customerMock, generateMock } = vi.hoisted(() => ({
  prismaMock: {
    genCodePackage: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    genCodeOrder: {
      create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(),
    },
    tenant: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  txMock: {
    genCodeOrder: { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    creditGrant: { create: vi.fn() },
    creditTransaction: { create: vi.fn() },
    genCode: { createMany: vi.fn() },
  },
  stripeMock: {
    products: { create: vi.fn(), update: vi.fn() },
    prices: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
  },
  customerMock: vi.fn(),
  generateMock: vi.fn(),
}))

vi.mock('@genealogiq/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genealogiq/db')>()
  return { ...actual, prisma: prismaMock }
})
vi.mock('@genealogiq/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genealogiq/core')>()
  return { ...actual, generateGenCode: generateMock }
})
vi.mock('server-only', () => ({}))
vi.mock('./stripe', () => ({ stripe: stripeMock }))
vi.mock('./stripe-customer', () => ({ ensureTenantStripeCustomer: customerMock }))
vi.mock('./partner-checkout', () => ({
  CHECKOUT_TTL_HOURS: 23,
  CHECKOUT_ORIGINS: { bms: 'bms', seq: 'seq' },
}))

import {
  closeGenCodePackageCheckout,
  fulfillGenCodePackageCheckout,
  openGenCodePackageCheckout,
  syncGenCodePackage,
} from './gencode-package'

const PACKAGE = {
  id: 'pkg_1',
  code: 'GENCODE_VIRTUAL_BRL',
  name: 'Pacote de Gencodes',
  unitPrice: '150.00',
  currency: 'BRL',
  minimumQuantity: 20,
  isActive: true,
  stripeProductId: 'prod_1',
  stripePriceId: 'price_1',
}

const checkoutInput = {
  packageId: PACKAGE.id,
  tenantId: 'tenant_1',
  quantity: 20,
  createdById: 'user_1',
  origin: 'bms' as const,
  successUrl: 'https://bms.test/payment/gencodes?status=success',
  cancelUrl: 'https://bms.test/payment/gencodes?status=cancel',
}

function checkoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_1',
    payment_status: 'paid',
    payment_intent: 'pi_1',
    metadata: { origin: 'bms', genCodeOrderId: 'order_1' },
    ...overrides,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.genCodePackage.findFirst.mockResolvedValue(PACKAGE)
  prismaMock.tenant.findFirst.mockResolvedValue({
    id: 'tenant_1',
    partnerSubscriptions: [{ id: 'contract_1' }],
  })
  customerMock.mockResolvedValue('cus_1')
  prismaMock.genCodeOrder.create.mockResolvedValue({ id: 'order_1' })
  stripeMock.checkout.sessions.create.mockResolvedValue({
    id: 'cs_1',
    url: 'https://checkout.stripe.test/cs_1',
  })
  prismaMock.genCodeOrder.update.mockResolvedValue({})
  prismaMock.genCodeOrder.delete.mockResolvedValue({})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.$transaction.mockImplementation(async (callback: any) => callback(txMock))
  prismaMock.genCodeOrder.findUnique.mockResolvedValue({
    id: 'order_1',
    status: 'PENDING',
    stripeCheckoutSessionId: 'cs_1',
  })
  txMock.genCodeOrder.updateMany.mockResolvedValue({ count: 1 })
  txMock.genCodeOrder.findUnique.mockResolvedValue({
    id: 'order_1',
    tenantId: 'tenant_1',
    partnerSubscriptionId: 'contract_1',
    createdById: 'user_1',
    quantity: 20,
  })
  txMock.creditGrant.create.mockResolvedValue({ id: 'grant_1' })
  generateMock.mockImplementation(() => `CODE${generateMock.mock.calls.length.toString().padStart(12, '0')}`)
})

describe('syncGenCodePackage', () => {
  it('creates a one-time BRL price for the configured unit amount', async () => {
    prismaMock.genCodePackage.findUnique.mockResolvedValue({ ...PACKAGE, stripeProductId: null, stripePriceId: null })
    stripeMock.products.create.mockResolvedValue({ id: 'prod_new' })
    stripeMock.prices.create.mockResolvedValue({ id: 'price_new' })

    await syncGenCodePackage(PACKAGE.id)

    expect(stripeMock.prices.create).toHaveBeenCalledWith(expect.objectContaining({
      product: 'prod_new',
      unit_amount: 15_000,
      currency: 'brl',
    }))
    expect(prismaMock.genCodePackage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { stripeProductId: 'prod_new', stripePriceId: 'price_new' },
    }))
  })
})

describe('openGenCodePackageCheckout', () => {
  it('rejects quantities below the package minimum before creating an order', async () => {
    await expect(openGenCodePackageCheckout({ ...checkoutInput, quantity: 19 }))
      .rejects.toMatchObject({ reason: 'invalid-quantity' })
    expect(prismaMock.genCodeOrder.create).not.toHaveBeenCalled()
  })

  it('rejects a tenant without an active B2B cycle', async () => {
    prismaMock.tenant.findFirst.mockResolvedValue(null)
    await expect(openGenCodePackageCheckout(checkoutInput))
      .rejects.toMatchObject({ reason: 'tenant-not-eligible' })
  })

  it('prices 20 units at R$150 each and sends the same quantity to Stripe', async () => {
    const result = await openGenCodePackageCheckout(checkoutInput)

    expect(result.totalAmount).toBe(3_000)
    expect(prismaMock.genCodeOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        quantity: 20,
        currency: 'BRL',
        partnerSubscriptionId: 'contract_1',
      }),
    }))
    const orderData = prismaMock.genCodeOrder.create.mock.calls[0][0].data
    expect(Number(orderData.unitPrice)).toBe(150)
    expect(Number(orderData.totalAmount)).toBe(3_000)
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'payment',
      line_items: [{ price: 'price_1', quantity: 20 }],
    }))
  })

  it('allows repeated purchases for the same tenant', async () => {
    await openGenCodePackageCheckout(checkoutInput)
    prismaMock.genCodeOrder.create.mockResolvedValueOnce({ id: 'order_2' })
    stripeMock.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_2',
      url: 'https://checkout.stripe.test/cs_2',
    })
    await openGenCodePackageCheckout({ ...checkoutInput, quantity: 21 })

    expect(prismaMock.genCodeOrder.create).toHaveBeenCalledTimes(2)
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(2)
  })
})

describe('fulfillGenCodePackageCheckout', () => {
  it('creates one TOPUP grant and exactly the purchased number of virtual codes', async () => {
    const before = Date.now()
    const outcome = await fulfillGenCodePackageCheckout(checkoutSession())

    expect(outcome).toBe('fulfilled')
    expect(txMock.creditGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant_1',
        subscriptionId: 'contract_1',
        source: 'TOPUP',
        grantedQty: 20,
        remainingQty: 20,
        rolloverGeneration: 1,
      }),
      select: { id: true },
    })
    const grantData = txMock.creditGrant.create.mock.calls[0][0].data
    const expected = new Date(before)
    expected.setMonth(expected.getMonth() + 12)
    expect(Math.abs(grantData.expiresAt.getTime() - expected.getTime())).toBeLessThan(1_000)
    expect(txMock.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        quantity: 20,
        idempotencyKey: 'grant:topup:order_1',
      }),
    })
    const minted = txMock.genCode.createMany.mock.calls[0][0].data
    expect(minted).toHaveLength(20)
    expect(minted.every((row: { mintedInOrderId: string }) => row.mintedInOrderId === 'order_1')).toBe(true)
  })

  it('does not grant or mint again when Stripe replays a paid order', async () => {
    prismaMock.genCodeOrder.findUnique.mockResolvedValue({
      id: 'order_1',
      status: 'PAID',
      stripeCheckoutSessionId: 'cs_1',
    })

    await expect(fulfillGenCodePackageCheckout(checkoutSession())).resolves.toBe('already-fulfilled')
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(txMock.creditGrant.create).not.toHaveBeenCalled()
    expect(txMock.genCode.createMany).not.toHaveBeenCalled()
  })

  it('waits for delayed payment confirmation', async () => {
    await expect(fulfillGenCodePackageCheckout(checkoutSession({ payment_status: 'unpaid' })))
      .resolves.toBe('payment-pending')
    expect(prismaMock.genCodeOrder.findUnique).not.toHaveBeenCalled()
  })
})

describe('closeGenCodePackageCheckout', () => {
  it('expires only a still-pending matching checkout', async () => {
    prismaMock.genCodeOrder.updateMany.mockResolvedValue({ count: 1 })

    await expect(closeGenCodePackageCheckout(checkoutSession(), 'EXPIRED')).resolves.toBe(true)
    expect(prismaMock.genCodeOrder.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order_1',
        status: 'PENDING',
        OR: [{ stripeCheckoutSessionId: 'cs_1' }, { stripeCheckoutSessionId: null }],
      },
      data: {
        status: 'EXPIRED',
        stripeCheckoutSessionId: 'cs_1',
        failedAt: expect.any(Date),
      },
    })
  })
})

