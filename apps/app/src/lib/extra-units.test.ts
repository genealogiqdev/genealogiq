import { describe, it, expect, vi, beforeEach } from "vitest"
import type Stripe from "stripe"

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    extraUnitPurchase: { aggregate: vi.fn(), create: vi.fn() },
    appUser: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock('@genealogiq/services/email-outbox', () => ({ enqueueEmail: vi.fn(), notificationUrl: () => 'https://genealogiq.com.br/subscriptions' }))
import { enqueueEmail } from '@genealogiq/services/email-outbox'

import { getExtraUnits, applyExtraUnitPurchase } from "./extra-units"

beforeEach(() => {
  vi.resetAllMocks()
  prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock))
  prismaMock.appUser.findUnique.mockResolvedValue({ email: 'ana@genealogiq.test', firstName: 'Ana', role: 'APP_USER', isActive: true })
})

describe("getExtraUnits", () => {
  it("returns the summed quantity for a buyer/resource", async () => {
    prismaMock.extraUnitPurchase.aggregate.mockResolvedValue({ _sum: { quantity: 3 } })

    const result = await getExtraUnits("g1", "GEO_PLACE")

    expect(result).toBe(3)
    expect(prismaMock.extraUnitPurchase.aggregate).toHaveBeenCalledWith({
      where: { buyerId: "g1", resource: "GEO_PLACE" },
      _sum: { quantity: true },
    })
  })

  it("returns 0 when the buyer has never purchased that resource", async () => {
    prismaMock.extraUnitPurchase.aggregate.mockResolvedValue({ _sum: { quantity: null } })

    const result = await getExtraUnits("g1", "QR_CODE")

    expect(result).toBe(0)
  })
})

function makeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_123",
    amount_total: 299,
    metadata: { buyerId: "g1", resource: "GEO_PLACE", tier: "FREE", currency: "USD" },
    ...overrides,
  } as Stripe.Checkout.Session
}

describe("applyExtraUnitPurchase", () => {
  it("records a purchase from the checkout session's metadata and amount", async () => {
    prismaMock.extraUnitPurchase.create.mockResolvedValue({})

    await applyExtraUnitPurchase(makeSession())

    expect(prismaMock.extraUnitPurchase.create).toHaveBeenCalledWith({
      data: {
        buyerId: "g1",
        resource: "GEO_PLACE",
        tier: "FREE",
        currency: "USD",
        amountPaid: 2.99,
        stripeSessionId: "cs_test_123",
      },
    })
    expect(enqueueEmail).toHaveBeenCalledWith(prismaMock, expect.objectContaining({
      id: 'extra-unit:cs_test_123', recipient: 'ana@genealogiq.test', context: { type: 'app-user', appUserId: 'g1' },
      message: expect.objectContaining({ details: expect.arrayContaining([{ label: 'Quantidade', value: '1' }, { label: 'Total', value: 'US$ 2,99' }]) }),
    }))
  })

  it("is a no-op when required metadata is missing", async () => {
    await applyExtraUnitPurchase(makeSession({ metadata: { buyerId: "g1" } }))

    expect(prismaMock.extraUnitPurchase.create).not.toHaveBeenCalled()
  })

  it("swallows a duplicate-delivery error (P2002) instead of throwing", async () => {
    prismaMock.extraUnitPurchase.create.mockRejectedValue({ code: "P2002" })

    await expect(applyExtraUnitPurchase(makeSession())).resolves.toBeUndefined()
  })

  it("re-throws any other error", async () => {
    prismaMock.extraUnitPurchase.create.mockRejectedValue(new Error("db down"))

    await expect(applyExtraUnitPurchase(makeSession())).rejects.toThrow("db down")
  })

  it('does not notify an inactive or non-login profile', async () => {
    prismaMock.appUser.findUnique.mockResolvedValue({ email: 'pet@genealogiq.test', role: 'APP_PET', isActive: true })
    await applyExtraUnitPurchase(makeSession())
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('rejects an unknown resource before granting or notifying', async () => {
    await applyExtraUnitPurchase(makeSession({ metadata: { buyerId: 'g1', resource: 'UNKNOWN', tier: 'FREE', currency: 'USD' } }))
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})
