import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { stripeMock, packageMock, provisionMock } = vi.hoisted(() => ({
  stripeMock: {
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  },
  packageMock: {
    isGenCodePackageCheckout: vi.fn(),
    fulfillGenCodePackageCheckout: vi.fn(),
    closeGenCodePackageCheckout: vi.fn(),
  },
  provisionMock: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({ stripe: stripeMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    partnerSubscription: { findUnique: vi.fn() },
    stripeEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/billing', () => ({ provisionTenantAccess: provisionMock }))
vi.mock('@genealogiq/services/partner-billing', () => ({
  applyPartnerInvoicePaid: vi.fn(),
  linkPartnerSubscription: vi.fn(),
  syncPartnerSubscriptionStatus: vi.fn(),
}))
vi.mock('@genealogiq/services/gencode-package', () => packageMock)
vi.mock('@genealogiq/services/email-outbox', () => ({ deliverEmail: vi.fn() }))
vi.mock('@genealogiq/services/sale-notifications', async (original) => ({
  ...await original<typeof import('@genealogiq/services/sale-notifications')>(), queuePartnerInvoiceEmail: vi.fn(),
}))

import { POST } from './route'
import { deliverEmail } from '@genealogiq/services/email-outbox'
import { queuePartnerInvoiceEmail } from '@genealogiq/services/sale-notifications'
import { applyPartnerInvoicePaid } from '@genealogiq/services/partner-billing'

function request(): NextRequest {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test' },
    body: '{}',
  }) as NextRequest
}

function event(type: string) {
  return {
    id: `evt_${type}`,
    type,
    data: {
      object: {
        id: 'cs_1',
        payment_status: 'paid',
        metadata: { origin: 'bms', genCodeOrderId: 'order_1' },
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  packageMock.isGenCodePackageCheckout.mockReturnValue(true)
  packageMock.fulfillGenCodePackageCheckout.mockResolvedValue({
    outcome: 'fulfilled',
    tenantId: 'tenant_1',
  })
  packageMock.closeGenCodePackageCheckout.mockResolvedValue(true)
  vi.mocked(deliverEmail).mockResolvedValue('sent')
})

describe('BMS Stripe webhook — GenCode packages', () => {
  it('fulfills a paid package checkout', async () => {
    const checkoutEvent = event('checkout.session.completed')
    stripeMock.webhooks.constructEvent.mockReturnValue(checkoutEvent)

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(packageMock.fulfillGenCodePackageCheckout)
      .toHaveBeenCalledWith(checkoutEvent.data.object)
    expect(provisionMock).toHaveBeenCalledWith('tenant_1')
    expect(deliverEmail).toHaveBeenCalledWith('package-sale:order_1')
    expect(packageMock.closeGenCodePackageCheckout).not.toHaveBeenCalled()
  })

  it('retries access provisioning on an idempotent webhook replay', async () => {
    packageMock.fulfillGenCodePackageCheckout.mockResolvedValue({
      outcome: 'already-fulfilled',
      tenantId: 'tenant_1',
    })
    stripeMock.webhooks.constructEvent.mockReturnValue(event('checkout.session.completed'))

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(provisionMock).toHaveBeenCalledWith('tenant_1')
  })

  it('marks an expired checkout without granting credits', async () => {
    const checkoutEvent = event('checkout.session.expired')
    stripeMock.webhooks.constructEvent.mockReturnValue(checkoutEvent)

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(packageMock.closeGenCodePackageCheckout)
      .toHaveBeenCalledWith(checkoutEvent.data.object, 'EXPIRED')
    expect(packageMock.fulfillGenCodePackageCheckout).not.toHaveBeenCalled()
    expect(provisionMock).not.toHaveBeenCalled()
  })

  it('ignores checkout sessions that do not belong to this product', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue(event('checkout.session.completed'))
    packageMock.isGenCodePackageCheckout.mockReturnValue(false)

    const response = await POST(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ignored).toBe('not a GenCode package checkout')
    expect(packageMock.fulfillGenCodePackageCheckout).not.toHaveBeenCalled()
    expect(provisionMock).not.toHaveBeenCalled()
  })

  it('notifies about a failed partner invoice without granting a cycle or access', async () => {
    const invoice = { id: 'in-1', parent: { subscription_details: { subscription: 'sub-1' } } }
    stripeMock.webhooks.constructEvent.mockReturnValue({ id: 'evt-failed', type: 'invoice.payment_failed', data: { object: invoice } })
    stripeMock.subscriptions.retrieve.mockResolvedValue({ metadata: { partnerSubscriptionId: 'contract-1' } })
    expect((await POST(request())).status).toBe(200)
    expect(queuePartnerInvoiceEmail).toHaveBeenCalledWith(expect.anything(), 'contract-1', invoice, true)
    expect(deliverEmail).toHaveBeenCalledWith('partner-invoice:in-1:failed')
    expect(applyPartnerInvoicePaid).not.toHaveBeenCalled()
    expect(provisionMock).not.toHaveBeenCalled()
  })
})

