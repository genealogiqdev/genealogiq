import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, txMock, stripeMock, customerMock, generateMock } = vi.hoisted(() => ({
  prismaMock: {
    genCodePackage: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    discountCoupon: { findFirst: vi.fn() },
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

vi.mock('@genealogiq/db', () => ({ prisma: prismaMock }))
vi.mock('@genealogiq/core', () => ({ generateGenCode: generateMock }))
vi.mock('server-only', () => ({}))
vi.mock('./stripe', () => ({ stripe: stripeMock }))
vi.mock('./stripe-customer', () => ({ ensureTenantStripeCustomer: customerMock }))
vi.mock('./sale-notifications', () => ({ queuePackageSaleEmail: vi.fn() }))
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
  activationTrialMonths: 12,
  activationTrialPlanCode: 'PREMIUM',
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
  prismaMock.discountCoupon.findFirst.mockResolvedValue(null)
  prismaMock.tenant.findFirst.mockResolvedValue({ id: 'tenant_1' })
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
    tenantId: 'tenant_1',
    status: 'PENDING',
    stripeCheckoutSessionId: 'cs_1',
  })
  txMock.genCodeOrder.updateMany.mockResolvedValue({ count: 1 })
  txMock.genCodeOrder.findUnique.mockResolvedValue({
    id: 'order_1',
    tenantId: 'tenant_1',
    partnerSubscriptionId: null,
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

  it('rejects an inactive or unknown customer', async () => {
    prismaMock.tenant.findFirst.mockResolvedValue(null)
    await expect(openGenCodePackageCheckout(checkoutInput))
      .rejects.toMatchObject({ reason: 'tenant-inactive' })
  })

  it('allows a package to be a customer\'s first purchase', async () => {
    const result = await openGenCodePackageCheckout(checkoutInput)

    expect(result.totalAmount).toBe(3_000)
    expect(prismaMock.genCodeOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        quantity: 20,
        currency: 'BRL',
        partnerSubscriptionId: null,
        activationTrialMonths: 12,
        activationTrialPlanCode: 'PREMIUM',
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

  it('applies a 15% package coupon and snapshots the net order total', async () => {
    prismaMock.discountCoupon.findFirst.mockResolvedValue({
      id: 'coupon_15',
      code: 'PACOTE15',
      subscriptions: [],
      discountType: 'percent',
      percentOff: 15,
      amountOffUsd: null,
      amountOffBrl: null,
      amountOffMxn: null,
      stripePromotionCodeId: 'promo_15',
      appliesTo: [],
      genCodePackages: [{ id: PACKAGE.id }],
    })

    const result = await openGenCodePackageCheckout({
      ...checkoutInput,
      discountCouponId: 'coupon_15',
    })

    expect(result).toEqual(expect.objectContaining({
      subtotalAmount: 3_000,
      discountAmount: 450,
      discountCode: 'PACOTE15',
      totalAmount: 2_550,
    }))
    expect(prismaMock.genCodeOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        discountCouponId: 'coupon_15',
        discountCode: 'PACOTE15',
        discountAmount: 450,
        totalAmount: 2_550,
      }),
    }))
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      discounts: [{ promotion_code: 'promo_15' }],
    }))
  })

  it('rejects a coupon restricted to another product', async () => {
    prismaMock.discountCoupon.findFirst.mockResolvedValue({
      id: 'coupon_other',
      code: 'OUTRO10',
      subscriptions: [],
      discountType: 'percent',
      percentOff: 10,
      amountOffUsd: null,
      amountOffBrl: null,
      amountOffMxn: null,
      stripePromotionCodeId: 'promo_other',
      appliesTo: [],
      genCodePackages: [{ id: 'pkg_other' }],
    })

    await expect(openGenCodePackageCheckout({
      ...checkoutInput,
      discountCouponId: 'coupon_other',
    })).rejects.toMatchObject({ reason: 'coupon-not-applicable' })
    expect(prismaMock.genCodeOrder.create).not.toHaveBeenCalled()
  })

  it('opens a zero-value Checkout for a 100% legacy-stock coupon', async () => {
    prismaMock.discountCoupon.findFirst.mockResolvedValue({
      id: 'coupon_100',
      code: 'ESTOQUE100',
      subscriptions: [],
      discountType: 'percent',
      percentOff: 100,
      amountOffUsd: null,
      amountOffBrl: null,
      amountOffMxn: null,
      stripePromotionCodeId: 'promo_100',
      appliesTo: [],
      genCodePackages: [{ id: PACKAGE.id }],
    })

    const result = await openGenCodePackageCheckout({
      ...checkoutInput,
      discountCouponId: 'coupon_100',
    })

    expect(result.totalAmount).toBe(0)
    expect(result.discountAmount).toBe(3_000)
    const checkout = stripeMock.checkout.sessions.create.mock.calls[0][0]
    expect(checkout.discounts).toEqual([{ promotion_code: 'promo_100' }])
    expect(checkout).not.toHaveProperty('payment_intent_data')
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
    const result = await fulfillGenCodePackageCheckout(checkoutSession())

    expect(result).toEqual({ outcome: 'fulfilled', tenantId: 'tenant_1' })
    expect(txMock.creditGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant_1',
        subscriptionId: null,
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
      tenantId: 'tenant_1',
      status: 'PAID',
      stripeCheckoutSessionId: 'cs_1',
    })

    await expect(fulfillGenCodePackageCheckout(checkoutSession())).resolves.toEqual({
      outcome: 'already-fulfilled',
      tenantId: 'tenant_1',
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(txMock.creditGrant.create).not.toHaveBeenCalled()
    expect(txMock.genCode.createMany).not.toHaveBeenCalled()
  })

  it('waits for delayed payment confirmation', async () => {
    await expect(fulfillGenCodePackageCheckout(checkoutSession({ payment_status: 'unpaid' })))
      .resolves.toEqual({ outcome: 'payment-pending' })
    expect(prismaMock.genCodeOrder.findUnique).not.toHaveBeenCalled()
  })

  it('fulfils a 100% coupon session that requires no payment', async () => {
    await expect(fulfillGenCodePackageCheckout(checkoutSession({
      payment_status: 'no_payment_required',
      payment_intent: null,
    }))).resolves.toEqual({ outcome: 'fulfilled', tenantId: 'tenant_1' })

    expect(txMock.creditGrant.create).toHaveBeenCalledTimes(1)
    expect(txMock.genCode.createMany).toHaveBeenCalledTimes(1)
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

