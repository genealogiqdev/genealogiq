import { describe, it, expect, vi, beforeEach } from "vitest"

const { prismaMock, txMock, creditsMock } = vi.hoisted(() => ({
  prismaMock: {
    partnerSubscription: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    subscriptionCycle:   { findUnique: vi.fn() },
    planPrice:           { findFirst: vi.fn() },
    $transaction:        vi.fn(),
  },
  txMock: {
    subscriptionCycle:   { update: vi.fn(), create: vi.fn() },
    partnerSubscription: { update: vi.fn() },
    creditGrant:         { findMany: vi.fn() },
    genCode:             { count: vi.fn(), createMany: vi.fn() },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creditsMock: { grantCycleCredits: vi.fn(async (_input: any) => 'grant_1') },
}))

vi.mock("@genealogiq/db", () => ({ prisma: prismaMock }))
vi.mock("server-only", () => ({}))
vi.mock("./credits", () => creditsMock)
vi.mock('./sale-notifications', async (original) => ({
  ...await original<typeof import('./sale-notifications')>(), queuePartnerInvoiceEmail: vi.fn(),
}))

import { applyPartnerInvoicePaid, syncPartnerSubscriptionStatus, linkPartnerSubscription, CYCLE_MONTHS } from "./partner-billing"

const PLAN = {
  id: "pplan_semente", name: "Semente", code: "SEMENTE", annualAllowance: 100,
  graceDays: 30, rolloverRate: "0.300", rolloverValidityMonths: 6,
  committedReservationMonths: 12, activationTrialMonths: 12,
  activationTrialPlanCode: "PREMIUM", version: 1,
}

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000)

function subscription(currentCycle: { id: string; endAt: Date } | null) {
  return { id: "psub_1", planId: PLAN.id, status: "ACTIVE", plan: PLAN, currentCycle }
}

const invoice = (over: Record<string, unknown> = {}) => ({
  id: "in_1",
  subscription: "sub_stripe_1",
  currency: "brl",
  amount_paid: 299_00,
  // Every instalment invoice carries this. It is deliberately NOT what decides
  // a renewal — see the file's header.
  billing_reason: "subscription_cycle",
  lines: { data: [{ price: { id: "price_cash_brl" } }] },
  ...over,
}) as never

beforeEach(() => {
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(txMock))
  prismaMock.subscriptionCycle.findUnique.mockResolvedValue(null)
  prismaMock.planPrice.findFirst.mockResolvedValue({
    id: "pprice_semente_brl", currency: "BRL", countryScope: "BR",
    annualCashAmount: "2990.00", installmentCount: 12, installmentAmount: "299.00",
    unitReferenceAmount: "29.90", version: 1,
    stripeCashPriceId: "price_cash_brl", stripeInstallmentPriceId: "price_inst_brl",
  })
  txMock.subscriptionCycle.create.mockResolvedValue({ id: "cyc_new" })
  // No stock and no balance by default: minting is asserted in its own tests.
  txMock.creditGrant.findMany.mockResolvedValue([])
  txMock.genCode.count.mockResolvedValue(0)
})

describe("applyPartnerInvoicePaid", () => {
  it("ignores an invoice with no subscription", async () => {
    const r = await applyPartnerInvoicePaid(invoice({ subscription: null }))
    expect(r.outcome).toBe("ignored")
    expect(prismaMock.partnerSubscription.findUnique).not.toHaveBeenCalled()
  })

  it("ignores a subscription that is not a partner's — the account also carries B2C", async () => {
    prismaMock.partnerSubscription.findUnique.mockResolvedValue(null)
    const r = await applyPartnerInvoicePaid(invoice())
    expect(r.outcome).toBe("ignored")
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("opens the first cycle when the contract has none", async () => {
    prismaMock.partnerSubscription.findUnique.mockResolvedValue(subscription(null))
    const r = await applyPartnerInvoicePaid(invoice())

    expect(r.outcome).toBe("first-cycle")
    expect(r.cycleId).toBe("cyc_new")
    // Nothing to close on the first cycle.
    expect(txMock.subscriptionCycle.update).not.toHaveBeenCalled()

    const data = txMock.subscriptionCycle.create.mock.calls[0][0].data
    expect(data.renewedFromCycleId).toBeNull()
    expect(data.stripeInvoiceId).toBe("in_1")
    expect(data.planSnapshot).toMatchObject({ code: "SEMENTE", annualAllowance: 100 })
    expect(data.priceSnapshot).toMatchObject({ cadence: "cash", currency: "BRL", amountPaid: 29900 })
  })

  // The regression this whole file exists for.
  it("treats a monthly instalment inside a live cycle as an instalment, not a renewal", async () => {
    prismaMock.partnerSubscription.findUnique.mockResolvedValue(
      subscription({ id: "cyc_live", endAt: daysFromNow(200) }),
    )
    const r = await applyPartnerInvoicePaid(invoice({ lines: { data: [{ price: { id: "price_inst_brl" } }] } }))

    expect(r.outcome).toBe("instalment")
    expect(r.cycleId).toBe("cyc_live")
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(txMock.subscriptionCycle.create).not.toHaveBeenCalled()
  })

  it("does not renew on the eleventh instalment, one day before the cycle ends", async () => {
    prismaMock.partnerSubscription.findUnique.mockResolvedValue(
      subscription({ id: "cyc_live", endAt: daysFromNow(1) }),
    )
    const r = await applyPartnerInvoicePaid(invoice())
    expect(r.outcome).toBe("instalment")
  })

  it("renews once the cycle has actually run out", async () => {
    prismaMock.partnerSubscription.findUnique.mockResolvedValue(
      subscription({ id: "cyc_old", endAt: daysFromNow(-1) }),
    )
    const r = await applyPartnerInvoicePaid(invoice({ id: "in_2" }))

    expect(r.outcome).toBe("renewed")
    expect(txMock.subscriptionCycle.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cyc_old" }, data: { status: "CLOSED" } }),
    )
    const data = txMock.subscriptionCycle.create.mock.calls[0][0].data
    expect(data.renewedFromCycleId).toBe("cyc_old")
    expect(data.stripeInvoiceId).toBe("in_2")
  })

  it("is idempotent: a replayed invoice never opens a second cycle", async () => {
    prismaMock.partnerSubscription.findUnique.mockResolvedValue(
      subscription({ id: "cyc_old", endAt: daysFromNow(-1) }),
    )
    prismaMock.subscriptionCycle.findUnique.mockResolvedValue({ id: "cyc_already" })

    const r = await applyPartnerInvoicePaid(invoice())
    expect(r.outcome).toBe("ignored")
    expect(r.cycleId).toBe("cyc_already")
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("freezes graceEndAt at endAt + the plan's graceDays", async () => {
    prismaMock.partnerSubscription.findUnique.mockResolvedValue(subscription(null))
    await applyPartnerInvoicePaid(invoice())

    const { startAt, endAt, graceEndAt } = txMock.subscriptionCycle.create.mock.calls[0][0].data
    const expectedEnd = new Date(startAt)
    expectedEnd.setMonth(expectedEnd.getMonth() + CYCLE_MONTHS)
    expect(endAt.getTime()).toBe(expectedEnd.getTime())

    const expectedGrace = new Date(endAt)
    expectedGrace.setDate(expectedGrace.getDate() + PLAN.graceDays)
    expect(graceEndAt.getTime()).toBe(expectedGrace.getTime())
  })

  it("marks the contract ACTIVE and points it at the new cycle", async () => {
    prismaMock.partnerSubscription.findUnique.mockResolvedValue(subscription(null))
    await applyPartnerInvoicePaid(invoice())

    expect(txMock.partnerSubscription.update).toHaveBeenCalledWith({
      where: { id: "psub_1" },
      data:  { currentCycleId: "cyc_new", status: "ACTIVE" },
    })
  })
})

describe("syncPartnerSubscriptionStatus", () => {
  const cases: [string, string | null][] = [
    ["active",   "ACTIVE"],
    ["trialing", "ACTIVE"],
    ["past_due", "PAST_DUE"],
    ["unpaid",   "PAST_DUE"],
    ["canceled", "CANCELLED"],
    ["incomplete", null],
  ]

  for (const [stripeStatus, expected] of cases) {
    it(`maps ${stripeStatus} to ${expected ?? "no change"}`, async () => {
      await syncPartnerSubscriptionStatus({ id: "sub_1", status: stripeStatus } as never)
      if (expected === null) {
        expect(prismaMock.partnerSubscription.updateMany).not.toHaveBeenCalled()
      } else {
        expect(prismaMock.partnerSubscription.updateMany).toHaveBeenCalledWith({
          where: { stripeSubscriptionId: "sub_1" },
          data:  { status: expected },
        })
      }
    })
  }

  // EXPIRED is a statement about our grace deadline, not about anything Stripe knows.
  it("never sets EXPIRED", async () => {
    for (const s of ["active", "past_due", "canceled", "incomplete_expired"]) {
      await syncPartnerSubscriptionStatus({ id: "sub_1", status: s } as never)
    }
    const written = prismaMock.partnerSubscription.updateMany.mock.calls.map((c) => c[0].data.status)
    expect(written).not.toContain("EXPIRED")
  })
})

describe("linkPartnerSubscription", () => {
  it("ignores a subscription with no contract in its metadata", async () => {
    const r = await linkPartnerSubscription({ id: "sub_1", metadata: {} } as never)
    expect(r).toBeNull()
    expect(prismaMock.partnerSubscription.findUnique).not.toHaveBeenCalled()
  })

  it("binds the Stripe subscription to the contract that opened checkout", async () => {
    prismaMock.partnerSubscription.findUnique.mockResolvedValue({ id: "psub_1", stripeSubscriptionId: null })
    const r = await linkPartnerSubscription(
      { id: "sub_1", metadata: { partnerSubscriptionId: "psub_1" } } as never,
    )
    expect(r).toBe("psub_1")
    expect(prismaMock.partnerSubscription.update).toHaveBeenCalledWith({
      where: { id: "psub_1" },
      data:  { stripeSubscriptionId: "sub_1" },
    })
  })

  it("is a no-op when already bound — every later event re-enters this path", async () => {
    prismaMock.partnerSubscription.findUnique.mockResolvedValue({ id: "psub_1", stripeSubscriptionId: "sub_1" })
    const r = await linkPartnerSubscription(
      { id: "sub_1", metadata: { partnerSubscriptionId: "psub_1" } } as never,
    )
    expect(r).toBe("psub_1")
    expect(prismaMock.partnerSubscription.update).not.toHaveBeenCalled()
  })

})

// The invariant the physical side of the product rests on:
//   unactivated physical codes <= credit balance
describe("minting on a cycle", () => {
  beforeEach(() => {
    prismaMock.partnerSubscription.findUnique.mockResolvedValue(subscription(null))
  })

  it("mints the full allowance when the partner holds no stock", async () => {
    txMock.creditGrant.findMany.mockResolvedValue([{ remainingQty: 100 }])
    txMock.genCode.count.mockResolvedValue(0)

    await applyPartnerInvoicePaid(invoice())

    expect(txMock.genCode.createMany).toHaveBeenCalledTimes(1)
    expect(txMock.genCode.createMany.mock.calls[0][0].data).toHaveLength(100)
  })

  // The renewal case the plan's invariant exists for: 100-plan partner activated
  // 40, rolled 30 over, so 130 credits against 60 plaques still in the wild.
  it("mints only the delta on renewal, never the whole allowance again", async () => {
    txMock.creditGrant.findMany.mockResolvedValue([{ remainingQty: 30 }, { remainingQty: 100 }])
    txMock.genCode.count.mockResolvedValue(60)

    await applyPartnerInvoicePaid(invoice())

    expect(txMock.genCode.createMany.mock.calls[0][0].data).toHaveLength(70)
  })

  it("mints nothing when stock already matches the balance", async () => {
    txMock.creditGrant.findMany.mockResolvedValue([{ remainingQty: 40 }])
    txMock.genCode.count.mockResolvedValue(40)

    await applyPartnerInvoicePaid(invoice())

    expect(txMock.genCode.createMany).not.toHaveBeenCalled()
  })

  // A plaque already engraved exists whatever the balance says; the ledger
  // simply refuses to activate it. Destroying stock to match would be worse.
  it("never destroys stock when the partner holds more codes than credits", async () => {
    txMock.creditGrant.findMany.mockResolvedValue([{ remainingQty: 10 }])
    txMock.genCode.count.mockResolvedValue(90)

    await applyPartnerInvoicePaid(invoice())

    expect(txMock.genCode.createMany).not.toHaveBeenCalled()
  })

  it("grants the plan's allowance, expiring with the cycle", async () => {
    await applyPartnerInvoicePaid(invoice())

    const call = creditsMock.grantCycleCredits.mock.calls[0]![0]
    expect(call.quantity).toBe(PLAN.annualAllowance)
    expect(call.cycleId).toBe("cyc_new")
    expect(call.expiresAt).toEqual(txMock.subscriptionCycle.create.mock.calls[0][0].data.endAt)
  })
})
