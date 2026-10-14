import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@genealogiq/db'
import type Stripe from 'stripe'

const { checkout, coupon } = vi.hoisted(() => ({ checkout: vi.fn(), coupon: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('./stripe', () => ({ stripe: { checkout: { sessions: { create: checkout } }, coupons: { create: coupon } } }))
vi.mock('./stripe-customer', () => ({ ensureTenantStripeCustomer: async () => 'cus_local_package_fixture' }))

const url = process.env.GENCODE_PACKAGE_TEST_DATABASE_URL
describe.skipIf(!url)('self-service packages on PostgreSQL', () => {
  let db: PrismaClient
  let service: typeof import('./gencode-package')
  let input: import('./gencode-package').GenCodePackageCheckoutInput
  const prefix = randomUUID().slice(0, 8)

  beforeAll(async () => {
    const target = new URL(url!)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
      || !/^\/genealogiq_coupon_qa_[a-z0-9_]+$/.test(target.pathname)) {
      throw new Error('Package integration tests require a disposable loopback genealogiq_coupon_qa_* database')
    }
    process.env.DATABASE_URL = url!
    process.env.STRIPE_SECRET_KEY = ''
    process.env.RESEND_API_KEY = ''
    db = (await import('@genealogiq/db')).prisma
    service = await import('./gencode-package')
    const tenant = await db.tenant.create({ data: {
      entityType: 'COMPANY', name: 'Package QA', tradeName: 'Package QA', taxId: `pkg-${prefix}`,
      email: `${prefix}@package.test`, phone: '5550100',
    } })
    const staff = await db.user.create({ data: { email: `${prefix}-staff@package.test`, firstName: 'Package', lastName: 'QA', role: 'OWNER', tenantId: tenant.id } })
    const product = await db.genCodePackage.upsert({
      where: { code: 'GENCODE_VIRTUAL_BRL' }, update: {},
      create: { code: 'GENCODE_VIRTUAL_BRL', name: 'Pacote de GenCodes', unitPrice: 150, minimumQuantity: 20, stripeProductId: 'prod_local_packages', stripePriceId: 'price_local_packages' },
    })
    input = { packageId: product.id, tenantId: tenant.id, createdById: staff.id, quantity: 50, origin: 'seq',
      successUrl: 'http://localhost:3002/purchasing/packages?status=success', cancelUrl: 'http://localhost:3002/purchasing/packages?status=cancel' }
    checkout.mockImplementation(async () => { const id = `cs_${randomUUID()}`; return { id, url: `https://checkout.example.test/${id}` } })
    coupon.mockResolvedValue({ id: `coupon_${prefix}` })
  }, 30000)

  afterAll(async () => { await db?.$disconnect() })

  async function paidSession(orderId: string): Promise<Stripe.Checkout.Session> {
    const order = await db.genCodeOrder.findUniqueOrThrow({ where: { id: orderId } })
    return { id: order.stripeCheckoutSessionId, payment_status: 'paid', payment_intent: `pi_${orderId}`,
      metadata: { origin: 'seq', genCodeOrderId: orderId, tenantId: input.tenantId } } as unknown as Stripe.Checkout.Session
  }

  it('records 20 units at R$3,000 without granting unpaid inventory', async () => {
    const result = await service.openGenCodePackageCheckout({ ...input, quantity: 20 })
    const saved = await db.genCodeOrder.findUniqueOrThrow({ where: { id: result.orderId } })
    expect(saved.status).toBe('PENDING')
    expect(saved.quantity).toBe(20)
    expect(Number(saved.unitPrice)).toBe(150)
    expect(Number(saved.discountAmount)).toBe(0)
    expect(Number(saved.totalAmount)).toBe(3000)
    expect(saved.discountCode).toBeNull()
    expect(saved.creditGrantId).toBeNull()
    expect(await db.genCode.count({ where: { mintedInOrderId: result.orderId } })).toBe(0)
    const session = { ...await paidSession(result.orderId), payment_status: 'unpaid' as const }
    expect(await service.fulfillGenCodePackageCheckout(session)).toEqual({ outcome: 'payment-pending' })
    expect(await db.genCode.count({ where: { mintedInOrderId: result.orderId } })).toBe(0)
  })

  it('persists R$6,750 and grants exactly 50 units once despite simultaneous payment replays', async () => {
    const result = await service.openGenCodePackageCheckout(input)
    const session = await paidSession(result.orderId)
    const outcomes = await Promise.all([service.fulfillGenCodePackageCheckout(session), service.fulfillGenCodePackageCheckout(session)])
    expect(outcomes.map((item) => item.outcome).sort()).toEqual(['already-fulfilled', 'fulfilled'])
    const saved = await db.genCodeOrder.findUniqueOrThrow({ where: { id: result.orderId }, include: { creditGrant: true } })
    expect(saved.status).toBe('PAID')
    expect(saved.quantity).toBe(50)
    expect(Number(saved.unitPrice)).toBe(150)
    expect(Number(saved.discountAmount)).toBe(750)
    expect(Number(saved.totalAmount)).toBe(6750)
    expect(saved.discountCode).toBe('GENCODES10')
    expect(saved.partnerSubscriptionId).toBeNull()
    expect(saved.creditGrant).toMatchObject({ grantedQty: 50, remainingQty: 50, source: 'TOPUP', rolloverGeneration: 1 })
    expect(saved.creditExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 364 * 86400000)
    expect(await db.genCode.count({ where: { mintedInOrderId: result.orderId } })).toBe(50)
    expect(await db.creditTransaction.count({ where: { idempotencyKey: `grant:topup:${result.orderId}` } })).toBe(1)
    expect(await db.emailOutbox.count({ where: { id: `package-sale:${result.orderId}` } })).toBe(1)

    // A later catalog edit cannot rewrite the already purchased quantity or amount.
    await db.genCodePackage.update({ where: { id: input.packageId }, data: { unitPrice: 160 } })
    try {
      expect((await service.fulfillGenCodePackageCheckout(session)).outcome).toBe('already-fulfilled')
      expect(Number((await db.genCodeOrder.findUniqueOrThrow({ where: { id: result.orderId } })).totalAmount)).toBe(6750)
      expect(await db.genCode.count({ where: { mintedInOrderId: result.orderId } })).toBe(50)
    } finally {
      await db.genCodePackage.update({ where: { id: input.packageId }, data: { unitPrice: 150 } })
    }
  })

  it('rejects 19 units and cleans up failed checkout creation without extra orders or credits', async () => {
    const beforeOrders = await db.genCodeOrder.count({ where: { tenantId: input.tenantId } })
    const beforeGrants = await db.creditGrant.count({ where: { tenantId: input.tenantId } })
    await expect(service.openGenCodePackageCheckout({ ...input, quantity: 19 })).rejects.toMatchObject({ reason: 'invalid-quantity' })
    checkout.mockRejectedValueOnce(new Error('fixture provider unavailable'))
    await expect(service.openGenCodePackageCheckout(input)).rejects.toThrow('fixture provider unavailable')
    expect(await db.genCodeOrder.count({ where: { tenantId: input.tenantId } })).toBe(beforeOrders)
    expect(await db.creditGrant.count({ where: { tenantId: input.tenantId } })).toBe(beforeGrants)
  })

  it('expires an unpaid checkout and refuses a later fulfillment for that order', async () => {
    const result = await service.openGenCodePackageCheckout(input)
    const session = await paidSession(result.orderId)
    expect(await service.closeGenCodePackageCheckout(session, 'EXPIRED')).toBe(true)
    expect(await service.fulfillGenCodePackageCheckout(session)).toEqual({ outcome: 'ignored' })
    expect(await db.genCode.count({ where: { mintedInOrderId: result.orderId } })).toBe(0)
    expect((await db.genCodeOrder.findUniqueOrThrow({ where: { id: result.orderId } })).status).toBe('EXPIRED')
  })
})
