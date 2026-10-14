import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'
import { NextRequest } from 'next/server'

const { fulfill, close, deliverEmail, stripeMock } = vi.hoisted(() => ({
  fulfill: vi.fn(), close: vi.fn(), deliverEmail: vi.fn(),
  stripeMock: { webhooks: { constructEvent: vi.fn() }, subscriptions: { retrieve: vi.fn() } },
}))
vi.mock('@/lib/stripe', () => ({ stripe: stripeMock }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@genealogiq/services/stripe', () => ({ stripe: stripeMock }))
vi.mock('@genealogiq/services/email-outbox', () => ({ deliverEmail }))
vi.mock('@genealogiq/services/sale-notifications', () => ({
  packageSaleEmailId: (id: string) => `package-sale:${id}`,
  invoiceSubscriptionId: vi.fn(), partnerInvoiceEmailId: vi.fn(), queuePartnerInvoiceEmail: vi.fn(),
}))
vi.mock('@genealogiq/services/partner-billing', () => ({
  applyPartnerInvoicePaid: vi.fn(), linkPartnerSubscription: vi.fn(), syncPartnerSubscriptionStatus: vi.fn(),
}))
vi.mock('@genealogiq/services/gencode-package', async (importOriginal) => ({
  ...await importOriginal<typeof import('@genealogiq/services/gencode-package')>(),
  fulfillGenCodePackageCheckout: fulfill, closeGenCodePackageCheckout: close,
}))

import { POST } from './route'

const secret = 'whsec_local_package_fixture'
const verifier = new Stripe('sk_test_local_fixture')

function request(type = 'checkout.session.completed', metadata: Record<string, string | undefined> = { origin: 'seq', genCodeOrderId: 'order-50' }, signature = true) {
  const payload = JSON.stringify({ id: 'evt_fixture', type, data: { object: { id: 'cs_fixture', metadata, payment_status: 'paid' } } })
  return new NextRequest('http://localhost:3002/api/stripe/webhook', {
    method: 'POST', body: payload,
    headers: signature ? { 'stripe-signature': verifier.webhooks.generateTestHeaderString({ payload, secret }) } : {},
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret)
  stripeMock.webhooks.constructEvent.mockImplementation((...args: Parameters<typeof verifier.webhooks.constructEvent>) => verifier.webhooks.constructEvent(...args))
  fulfill.mockResolvedValue({ outcome: 'fulfilled', tenantId: 'tenant-own' })
  close.mockResolvedValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('SEQ signed package webhook', () => {
  it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])('fulfills %s and attempts its existing outbox receipt', async (type) => {
    const response = await POST(request(type))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true, outcome: 'fulfilled' })
    expect(fulfill).toHaveBeenCalledWith(expect.objectContaining({ id: 'cs_fixture', metadata: { origin: 'seq', genCodeOrderId: 'order-50' } }))
    expect(deliverEmail).toHaveBeenCalledWith('package-sale:order-50')
  })

  it('keeps unpaid sessions pending without sending a receipt', async () => {
    fulfill.mockResolvedValue({ outcome: 'payment-pending' })
    expect(await (await POST(request())).json()).toEqual({ received: true, outcome: 'payment-pending' })
    expect(deliverEmail).not.toHaveBeenCalled()
  })

  it('can retry a receipt after fulfillment without a second grant', async () => {
    fulfill.mockResolvedValue({ outcome: 'already-fulfilled', tenantId: 'tenant-own' })
    expect(await (await POST(request())).json()).toEqual({ received: true, outcome: 'already-fulfilled' })
    expect(deliverEmail).toHaveBeenCalledWith('package-sale:order-50')
  })

  it.each([
    ['checkout.session.async_payment_failed', 'FAILED', 'failed'],
    ['checkout.session.expired', 'EXPIRED', 'expired'],
  ])('records %s without invoking fulfillment', async (type, status, outcome) => {
    expect(await (await POST(request(type))).json()).toEqual({ received: true, outcome })
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ id: 'cs_fixture' }), status)
    expect(fulfill).not.toHaveBeenCalled()
    expect(deliverEmail).not.toHaveBeenCalled()
  })

  it.each([{ origin: 'bms', genCodeOrderId: 'order-50' }, { origin: 'app', genCodeOrderId: 'order-50' }, { origin: 'seq' }])('ignores another origin or a missing package reference: %j', async (metadata) => {
    expect((await POST(request('checkout.session.completed', metadata))).status).toBe(200)
    expect(fulfill).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })

  it('rejects missing and invalid signatures before fulfillment', async () => {
    expect((await POST(request('checkout.session.completed', undefined, false))).status).toBe(400)
    const invalid = request()
    invalid.headers.set('stripe-signature', 'invalid')
    expect((await POST(invalid)).status).toBe(400)
    expect(fulfill).not.toHaveBeenCalled()
  })

  it('returns a retryable failure when fulfillment fails', async () => {
    fulfill.mockRejectedValue(new Error('database unavailable'))
    expect((await POST(request())).status).toBe(500)
    expect(deliverEmail).not.toHaveBeenCalled()
  })
})
