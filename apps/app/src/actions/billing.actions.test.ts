import { describe, it, expect, vi, beforeEach } from "vitest"

// Prisma + stripe mocks must be hoisted so they exist when the vi.mock factories run.
const { prismaMock, stripeMock, priceMock } = vi.hoisted(() => ({
  priceMock: vi.fn(),
  prismaMock: {
    subscription: { findUnique: vi.fn() },
    appSale: { findFirst: vi.fn() },
    planPrice: { findMany: vi.fn() },
  },
  stripeMock: {
    checkout: { sessions: { create: vi.fn() } },
    subscriptions: { retrieve: vi.fn(), update: vi.fn() },
    subscriptionSchedules: { create: vi.fn(), update: vi.fn() },
    billingPortal: { sessions: { create: vi.fn() } },
  },
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// Echo the key so assertions pin the exact message source (namespace "Actions").
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
// All these tests exercise the USD path — locale resolution itself is covered elsewhere.
vi.mock("@genealogiq/i18n/server", () => ({ resolveLocale: vi.fn().mockResolvedValue("en-US") }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }))
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }))
// Prices moved out of the Subscription row into the shared versioned book.
// compareTier stays REAL — it is pure, and it is what decides whether a plan
// change is charged today or at period end.
vi.mock("@genealogiq/services/subscription-price", async () => {
  const actual = await vi.importActual<typeof import("@genealogiq/services/subscription-price")>(
    "@genealogiq/services/subscription-price",
  )
  return { ...actual, resolveSubscriptionPrice: priceMock }
})
vi.mock("@/lib/billing", () => ({
  ensureStripeCustomer: vi.fn(),
  upsertSaleFromSubscription: vi.fn(),
}))

import { createCheckoutSession, changeSubscription } from "./billing.actions"
import { verifySession } from "@/lib/dal"
import { ensureStripeCustomer, upsertSaleFromSubscription } from "@/lib/billing"

/** A live price-book row, in the shape resolveSubscriptionPrice returns. */
const bookPrice = (over: Partial<{
  annualAmount: number; monthlyAmount: number | null; termMonths: number | null
  stripeAnnualPriceId: string | null; stripeMonthlyPriceId: string | null
}> = {}) => ({
  planPriceId: "pp-1",
  currency: "USD",
  annualAmount: 10,
  monthlyAmount: null,
  termMonths: 1,
  stripeAnnualPriceId: "price_annual",
  stripeMonthlyPriceId: "price_monthly",
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.appSale.findFirst.mockResolvedValue(null)
  vi.mocked(verifySession).mockResolvedValue({ user: { id: "user-1" } } as never)
  vi.mocked(ensureStripeCustomer).mockResolvedValue("cus_123")
})

describe("createCheckoutSession", () => {
  it('rejects a second checkout while a manually granted plan is live', async () => {
    prismaMock.appSale.findFirst.mockResolvedValue({ id: 'manual-sale' })
    expect(await createCheckoutSession('sub-1', 'annual')).toEqual({ ok: false, message: 'billing.manualPlanActive' })
    expect(ensureStripeCustomer).not.toHaveBeenCalled()
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled()
    expect(prismaMock.appSale.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      appUserId: 'user-1', OR: [{ couponRedemption: { isNot: null } }, { consumerAccessGrant: { isNot: null } }], status: { in: ['active', 'trialing'] },
    }) }))
  })
  it("fails with planNotFound when no active plan matches (never touches Stripe)", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null)

    const res = await createCheckoutSession("sub-x", "monthly")

    expect(res).toEqual({ ok: false, message: "billing.planNotFound" })
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it("fails with planNotWiredSeed when the selected cadence has no Stripe priceId", async () => {
    // Plan exists but the requested cadence (annual) was never wired to a Stripe price.
    prismaMock.subscription.findUnique.mockResolvedValue({ id: "sub-1", name: "Pro" })
    priceMock.mockResolvedValue(bookPrice({ stripeAnnualPriceId: null }))

    const res = await createCheckoutSession("sub-1", "annual")

    expect(res).toEqual({ ok: false, message: "billing.planNotWiredSeed" })
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it("returns ok({ url }) on the happy path", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ id: "sub-1", name: "Pro" })
    priceMock.mockResolvedValue(bookPrice({ stripeAnnualPriceId: "price_annual" }))
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/abc" })

    const res = await createCheckoutSession("sub-1", "monthly")

    expect(res.ok).toBe(true)
    expect(res.ok && res.data).toEqual({ url: "https://checkout.stripe.test/abc" })
    // Uses the monthly price for cadence "monthly".
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_123",
        line_items: [{ price: "price_monthly", quantity: 1 }],
      }),
    )
  })

  it("fails with noCheckoutUrl when Stripe returns a session without a url", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ id: "sub-1", name: "Pro" })
    priceMock.mockResolvedValue(bookPrice({ stripeAnnualPriceId: "price_annual" }))
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: null })

    const res = await createCheckoutSession("sub-1", "monthly")

    expect(res).toEqual({ ok: false, message: "billing.noCheckoutUrl" })
  })
})

describe("changeSubscription", () => {
  it("fails with noActiveSubscription when the caller has no active sale", async () => {
    prismaMock.appSale.findFirst.mockResolvedValue(null)

    const res = await changeSubscription("sub-2", "monthly")

    expect(res).toEqual({ ok: false, message: "billing.noActiveSubscription" })
    expect(prismaMock.subscription.findUnique).not.toHaveBeenCalled()
  })

  it("fails with planNotWired when the target cadence has no Stripe priceId", async () => {
    prismaMock.appSale.findFirst.mockResolvedValue({
      stripeSubscriptionId: "stripe_sub_1",
      currency: "USD",
      subscription: { id: "sub-active" },  // active plan priced at 10 in the book below
    })
    prismaMock.subscription.findUnique.mockResolvedValue({ id: "sub-2" })
    // changeSubscription resolves the TARGET first, then the ACTIVE plan.
    priceMock
      .mockResolvedValueOnce(bookPrice({ annualAmount: 20, stripeAnnualPriceId: null }))
      .mockResolvedValueOnce(bookPrice({ annualAmount: 10 }))

    const res = await changeSubscription("sub-2", "annual")

    expect(res).toEqual({ ok: false, message: "billing.planNotWired" })
  })

  it("upgrade: swaps the price immediately and returns ok({ effect: 'upgraded' })", async () => {
    prismaMock.appSale.findFirst.mockResolvedValue({
      stripeSubscriptionId: "stripe_sub_1",
      currency: "USD",
      subscription: { id: "sub-active" },  // active plan priced at 10 in the book below
    })
    prismaMock.subscription.findUnique.mockResolvedValue({ id: "sub-2" })
    // changeSubscription resolves the TARGET first, then the ACTIVE plan.
    priceMock
      .mockResolvedValueOnce(bookPrice({ annualAmount: 20, stripeAnnualPriceId: "price_annual" }))
      .mockResolvedValueOnce(bookPrice({ annualAmount: 10 }))
    stripeMock.subscriptions.retrieve.mockResolvedValue({ items: { data: [{ id: "si_1" }] } })
    stripeMock.subscriptions.update.mockResolvedValue({ id: "stripe_sub_1" })

    const res = await changeSubscription("sub-2", "monthly")

    expect(res.ok).toBe(true)
    expect(res.ok && res.data).toEqual({ effect: "upgraded" })
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      "stripe_sub_1",
      expect.objectContaining({ items: [{ id: "si_1", price: "price_monthly" }] }),
    )
    // DB is mirrored immediately so the page refresh shows the new plan.
    expect(upsertSaleFromSubscription).toHaveBeenCalled()
  })

  it("downgrade: schedules the switch and returns ok({ effect: 'scheduled' })", async () => {
    prismaMock.appSale.findFirst.mockResolvedValue({
      stripeSubscriptionId: "stripe_sub_1",
      currency: "USD",
      subscription: { id: "sub-active" },  // active plan priced at 30 in the book below
    })
    prismaMock.subscription.findUnique.mockResolvedValue({ id: "sub-2" })
    // changeSubscription resolves the TARGET first, then the ACTIVE plan.
    priceMock
      .mockResolvedValueOnce(bookPrice({ annualAmount: 10, stripeAnnualPriceId: "price_annual" }))
      .mockResolvedValueOnce(bookPrice({ annualAmount: 30 }))
    stripeMock.subscriptions.retrieve.mockResolvedValue({ schedule: null })
    stripeMock.subscriptionSchedules.create.mockResolvedValue({
      id: "sched_1",
      phases: [{ items: [{ price: "price_old", quantity: 1 }], start_date: 100, end_date: 200, metadata: {} }],
    })
    stripeMock.subscriptionSchedules.update.mockResolvedValue({})

    const res = await changeSubscription("sub-2", "monthly")

    expect(res.ok).toBe(true)
    expect(res.ok && res.data).toEqual({ effect: "scheduled" })
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled()
    expect(upsertSaleFromSubscription).not.toHaveBeenCalled()
  })

  it("downgrade: rejects with a friendly message when a schedule is already pending", async () => {
    prismaMock.appSale.findFirst.mockResolvedValue({
      stripeSubscriptionId: "stripe_sub_1",
      currency: "USD",
      subscription: { id: "sub-active" },  // active plan priced at 30 in the book below
    })
    prismaMock.subscription.findUnique.mockResolvedValue({ id: "sub-2" })
    // changeSubscription resolves the TARGET first, then the ACTIVE plan.
    priceMock
      .mockResolvedValueOnce(bookPrice({ annualAmount: 10, stripeAnnualPriceId: "price_annual" }))
      .mockResolvedValueOnce(bookPrice({ annualAmount: 30 }))
    stripeMock.subscriptions.retrieve.mockResolvedValue({ schedule: "sub_sched_existing" })

    const res = await changeSubscription("sub-2", "monthly")

    expect(res).toEqual({ ok: false, message: "billing.downgradeAlreadyPending" })
    expect(stripeMock.subscriptionSchedules.create).not.toHaveBeenCalled()
  })

  it("returns a failure carrying the Stripe error message when the Stripe call throws", async () => {
    prismaMock.appSale.findFirst.mockResolvedValue({
      stripeSubscriptionId: "stripe_sub_1",
      currency: "USD",
      subscription: { id: "sub-active" },  // active plan priced at 10 in the book below
    })
    prismaMock.subscription.findUnique.mockResolvedValue({ id: "sub-2" })
    // changeSubscription resolves the TARGET first, then the ACTIVE plan.
    priceMock
      .mockResolvedValueOnce(bookPrice({ annualAmount: 20, stripeAnnualPriceId: "price_annual" }))
      .mockResolvedValueOnce(bookPrice({ annualAmount: 10 }))
    stripeMock.subscriptions.retrieve.mockRejectedValue(new Error("stripe is down"))

    const res = await changeSubscription("sub-2", "monthly")

    expect(res).toEqual({ ok: false, message: "stripe is down" })
  })
})
