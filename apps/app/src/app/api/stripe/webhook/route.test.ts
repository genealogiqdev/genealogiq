import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Shape we assert against (mirrors the FakeNextResponse defined in the mock).
type Res = { body: unknown; status: number }

// Minimal NextResponse stand-in: supports `new NextResponse(body, init)` and
// `NextResponse.json(body, init)`. Defined INSIDE the factory because vi.mock is
// hoisted above the file's top-level declarations.
vi.mock("next/server", () => {
  class FakeNextResponse {
    body: unknown
    status: number
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body
      this.status = init?.status ?? 200
    }
    static json(body: unknown, init?: { status?: number }) {
      return new FakeNextResponse(body, init)
    }
  }
  return { NextResponse: FakeNextResponse, NextRequest: class {} }
})

const { stripeMock, prismaMock, upsertMock } = vi.hoisted(() => ({
  stripeMock: { webhooks: { constructEvent: vi.fn() }, subscriptions: { retrieve: vi.fn() } },
  prismaMock: { $transaction: vi.fn(), stripeEvent: { findUnique: vi.fn(), create: vi.fn() } },
  upsertMock: vi.fn(),
}))
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/billing", () => ({ upsertSaleFromSubscription: upsertMock }))
vi.mock('@/lib/extra-units', () => ({ applyExtraUnitPurchase: vi.fn() }))
vi.mock('@genealogiq/services/email-outbox', () => ({ deliverEmail: vi.fn() }))
vi.mock('@genealogiq/services/sale-notifications', async (original) => ({
  ...await original<typeof import('@genealogiq/services/sale-notifications')>(), queueConsumerInvoiceEmail: vi.fn(),
}))

import { POST } from "./route"
import { applyExtraUnitPurchase } from '@/lib/extra-units'
import { deliverEmail } from '@genealogiq/services/email-outbox'
import { queueConsumerInvoiceEmail } from '@genealogiq/services/sale-notifications'

// Build a fake NextRequest with the bits the handler reads.
const makeReq = (signature: string | null, body = "{}") =>
  ({
    headers: { get: (k: string) => (k === "stripe-signature" ? signature : null) },
    text: async () => body,
  }) as never

const SUB_EVENT = {
  id: "evt_1",
  type: "customer.subscription.updated",
  data: { object: { id: "sub_1" } },
}

beforeEach(() => {
  vi.resetAllMocks()
  // The handler logs expected failures via console.error — silence them so the
  // test output stays clean (the 500 case deliberately throws).
  vi.spyOn(console, "error").mockImplementation(() => {})
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test"
  stripeMock.webhooks.constructEvent.mockReturnValue(SUB_EVENT)
  prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock))
  vi.mocked(deliverEmail).mockResolvedValue('sent')
})

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET
})

describe("POST /api/stripe/webhook", () => {
  it("returns 400 when the stripe-signature header is missing", async () => {
    const res = (await POST(makeReq(null))) as unknown as Res
    expect(res.status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("ignores events outside the relevant set without touching the DB", async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: "evt_2",
      type: "payment_intent.created",
      data: { object: {} },
    })
    const res = (await POST(makeReq("sig"))) as unknown as Res
    expect(res.body).toEqual({ received: true })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  // P1-14 atomicity: the StripeEvent insert and the sale upsert must run inside
  // the SAME transaction so a failed upsert rolls the event back.
  it("records the event and upserts the sale inside one transaction", async () => {
    const txMock = { stripeEvent: { create: vi.fn() } }
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock))

    const res = (await POST(makeReq("sig"))) as unknown as Res

    expect(res.body).toEqual({ received: true })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(txMock.stripeEvent.create).toHaveBeenCalledWith({
      data: { id: "evt_1", type: "customer.subscription.updated" },
    })
    expect(upsertMock).toHaveBeenCalledWith(txMock, SUB_EVENT.data.object)
  })

  // P1-14 idempotency: a duplicate delivery (unique-violation on the StripeEvent
  // PK) is swallowed and answered 200 so Stripe stops retrying.
  it("treats a duplicate delivery (P2002) as already-received, not an error", async () => {
    prismaMock.$transaction.mockRejectedValue({ code: "P2002" })

    const res = (await POST(makeReq("sig"))) as unknown as Res

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ received: true, duplicate: true })
  })

  it("returns 500 on a non-idempotency processing failure", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("db down"))

    const res = (await POST(makeReq("sig"))) as unknown as Res

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: "internal" })
  })

  it.each(['invoice.paid', 'invoice.payment_failed'])('queues %s within the entitlement transaction and tolerates provider downtime', async (type) => {
    const invoice = { id: 'in-1', parent: { subscription_details: { subscription: 'sub-1' } } }
    const sub = { id: 'sub-1', metadata: { userId: 'buyer-1', subscriptionId: 'premium', cadence: 'annual' } }
    stripeMock.webhooks.constructEvent.mockReturnValue({ id: 'evt-invoice', type, data: { object: invoice } })
    stripeMock.subscriptions.retrieve.mockResolvedValue(sub)
    vi.mocked(deliverEmail).mockResolvedValue('pending')
    const response = await POST(makeReq('sig')) as unknown as Res
    expect(response.status).toBe(200)
    expect(upsertMock).toHaveBeenCalledWith(prismaMock, sub)
    expect(queueConsumerInvoiceEmail).toHaveBeenCalledWith(prismaMock, sub, invoice, type === 'invoice.payment_failed')
    expect(deliverEmail).toHaveBeenCalledWith(type === 'invoice.paid' ? 'consumer-invoice:in-1:paid' : 'consumer-invoice:in-1:failed')
  })

  it('ignores a partner invoice without changing consumer entitlements or sending', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({ type: 'invoice.paid', data: { object: { id: 'in-1', subscription: 'sub-1' } } })
    stripeMock.subscriptions.retrieve.mockResolvedValue({ metadata: { partnerSubscriptionId: 'partner-1' } })
    expect((await POST(makeReq('sig')) as unknown as Res).body).toMatchObject({ ignored: 'not a consumer subscription' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(deliverEmail).not.toHaveBeenCalled()
  })

  it('does not grant an unpaid delayed checkout and does process its later success', async () => {
    const checkout = { id: 'cs-1', mode: 'payment', payment_status: 'unpaid' }
    stripeMock.webhooks.constructEvent.mockReturnValue({ id: 'evt-open', type: 'checkout.session.completed', data: { object: checkout } })
    expect((await POST(makeReq('sig')) as unknown as Res).body).toMatchObject({ ignored: 'unpaid' })
    expect(applyExtraUnitPurchase).not.toHaveBeenCalled()
    stripeMock.webhooks.constructEvent.mockReturnValue({ id: 'evt-paid', type: 'checkout.session.async_payment_succeeded', data: { object: { ...checkout, payment_status: 'paid' } } })
    prismaMock.stripeEvent.create.mockResolvedValue({ id: 'evt-paid' })
    expect((await POST(makeReq('sig')) as unknown as Res).status).toBe(200)
    expect(applyExtraUnitPurchase).toHaveBeenCalledOnce()
    expect(deliverEmail).toHaveBeenCalledWith('extra-unit:cs-1')
  })

  it('retries only email on an already recorded extra-unit event', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({ id: 'evt-paid', type: 'checkout.session.completed', data: { object: { id: 'cs-1', mode: 'payment', payment_status: 'paid' } } })
    prismaMock.stripeEvent.findUnique.mockResolvedValue({ id: 'evt-paid' })
    expect((await POST(makeReq('sig')) as unknown as Res).body).toEqual({ received: true, duplicate: true })
    expect(applyExtraUnitPurchase).not.toHaveBeenCalled()
    expect(deliverEmail).toHaveBeenCalledWith('extra-unit:cs-1')
  })
})
