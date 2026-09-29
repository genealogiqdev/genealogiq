import { describe, it, expect, vi, beforeEach } from "vitest"

const { prismaMock, stripeMock, PrismaKnownError } = vi.hoisted(() => {
  class PrismaKnownError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  }
  return {
    prismaMock: {
      discountCoupon: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      planPrice:      { findMany: vi.fn() },
      genCodePackage: { findMany: vi.fn() },
    },
    stripeMock: {
      coupons:        { create: vi.fn(), del: vi.fn() },
      promotionCodes: { create: vi.fn(), list: vi.fn(), update: vi.fn() },
    },
    PrismaKnownError,
  }
})

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@genealogiq/db", () => ({ Prisma: { PrismaClientKnownRequestError: PrismaKnownError } }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }))
vi.mock("@/lib/dal", () => ({ verifyAdmin: vi.fn() }))
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  getLocale: vi.fn(async () => "en-US"),
}))

import { createDiscountCoupon } from "./discount-coupon.actions"
import { verifyAdmin } from "@/lib/dal"

const base = {
  code:             "FFB2026",
  description:      null,
  discountType:     "percent" as const,
  percentOff:       10,
  amountOffUsd:     0,
  amountOffBrl:     0,
  amountOffMxn:     0,
  duration:         "once" as const,
  durationInMonths: null,
  maxRedemptions:   null,
  redeemBy:         null,
  appliesTo:        [] as string[],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.mocked(verifyAdmin).mockResolvedValue({ user: { id: "admin-1" } } as never)
  prismaMock.discountCoupon.findFirst.mockResolvedValue(null)
  prismaMock.discountCoupon.create.mockResolvedValue({ id: "c1", code: "FFB2026" })
  prismaMock.planPrice.findMany.mockResolvedValue([])
  prismaMock.genCodePackage.findMany.mockResolvedValue([])
  stripeMock.promotionCodes.list.mockResolvedValue({ data: [] })
  stripeMock.coupons.create.mockResolvedValue({ id: "coup_1" })
  stripeMock.promotionCodes.create.mockResolvedValue({ id: "promo_1" })
})

describe("createDiscountCoupon — percentage", () => {
  // 10% off is 10% off in every currency; sending an amount or a currency would
  // be Stripe rejecting the call.
  it("sends percent_off alone, with no currency", async () => {
    await createDiscountCoupon(base)

    const arg = stripeMock.coupons.create.mock.calls[0][0]
    expect(arg.percent_off).toBe(10)
    expect(arg).not.toHaveProperty("amount_off")
    expect(arg).not.toHaveProperty("currency")
    expect(arg).not.toHaveProperty("currency_options")
  })

  it("stores the percentage and leaves every amount column null", async () => {
    await createDiscountCoupon(base)

    const data = prismaMock.discountCoupon.create.mock.calls[0][0].data
    expect(data.percentOff).toBe(10)
    expect(data.amountOffUsd).toBeNull()
    expect(data.amountOffBrl).toBeNull()
    expect(data.amountOffMxn).toBeNull()
  })

  it("rejects a percentage above 100", async () => {
    const res = await createDiscountCoupon({ ...base, percentOff: 150 })
    expect(res.ok).toBe(false)
    expect(stripeMock.coupons.create).not.toHaveBeenCalled()
  })

  it("restricts a package coupon to the package's Stripe product", async () => {
    prismaMock.genCodePackage.findMany.mockResolvedValue([{
      id: "gcp_1",
      stripeProductId: "prod_gcp_1",
    }])

    const result = await createDiscountCoupon({ ...base, appliesTo: ["gcp_1"] })

    expect(result.ok).toBe(true)
    expect(stripeMock.coupons.create).toHaveBeenCalledWith(expect.objectContaining({
      applies_to: { products: ["prod_gcp_1"] },
    }))
    expect(prismaMock.discountCoupon.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        genCodePackages: { connect: [{ id: "gcp_1" }] },
      }),
    }))
  })

  it("fails closed when a selected product is missing or not synced", async () => {
    const result = await createDiscountCoupon({ ...base, appliesTo: ["missing"] })

    expect(result).toEqual({ ok: false, message: "discountCoupon.productNotSynced" })
    expect(stripeMock.coupons.create).not.toHaveBeenCalled()
  })
})

const fixed = { ...base, discountType: "amount" as const, percentOff: 0 }

describe("createDiscountCoupon — fixed amount", () => {
  // Stripe models multi-currency on ONE coupon: a base amount_off + currency,
  // the rest in currency_options. That is what lets a single promotion code
  // work whichever currency the buyer is billed in.
  it("puts the first priced currency in the base and the rest in currency_options", async () => {
    await createDiscountCoupon({ ...fixed, amountOffUsd: 50, amountOffBrl: 250, amountOffMxn: 900 })

    const arg = stripeMock.coupons.create.mock.calls[0][0]
    expect(arg.amount_off).toBe(5000)
    expect(arg.currency).toBe("usd")
    expect(arg.currency_options).toEqual({ brl: { amount_off: 25000 }, mxn: { amount_off: 90000 } })
    expect(arg).not.toHaveProperty("percent_off")
  })

  // A coupon offered only in reais is legitimate — BRL simply becomes the base.
  it("uses whichever currency is priced when USD is not", async () => {
    await createDiscountCoupon({ ...fixed, amountOffUsd: 0, amountOffBrl: 250, amountOffMxn: 0 })

    const arg = stripeMock.coupons.create.mock.calls[0][0]
    expect(arg.amount_off).toBe(25000)
    expect(arg.currency).toBe("brl")
    expect(arg).not.toHaveProperty("currency_options")
  })

  // Zero means "not offered here" and must reach the column as null, or the
  // sellable-in-this-currency filter would match it.
  it("stores only the priced currencies, the rest null", async () => {
    await createDiscountCoupon({ ...fixed, amountOffUsd: 50, amountOffBrl: 250, amountOffMxn: 0 })

    const data = prismaMock.discountCoupon.create.mock.calls[0][0].data
    expect(data.percentOff).toBeNull()
    expect(data.amountOffUsd).toBe(50)
    expect(data.amountOffBrl).toBe(250)
    expect(data.amountOffMxn).toBeNull()
  })

  it("rejects a fixed-amount coupon with no amount anywhere", async () => {
    const res = await createDiscountCoupon(fixed)
    expect(res.ok).toBe(false)
    expect(stripeMock.coupons.create).not.toHaveBeenCalled()
  })
})

describe("createDiscountCoupon — rollback", () => {
  // Without this, a failed run leaves a Stripe coupon nothing points at, and the
  // code becomes permanently unusable: the pre-flight would find the orphan.
  it("deletes the Stripe coupon and deactivates the promo code when the DB write fails", async () => {
    prismaMock.discountCoupon.create.mockRejectedValue(new PrismaKnownError("dup", "P2002"))

    const res = await createDiscountCoupon(base)

    expect(stripeMock.promotionCodes.update).toHaveBeenCalledWith("promo_1", { active: false })
    expect(stripeMock.coupons.del).toHaveBeenCalledWith("coup_1")
    expect(res).toEqual({ ok: false, message: "discountCoupon.codeExists" })
  })
})
