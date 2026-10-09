import { beforeEach, expect, it, vi } from "vitest"

// A supplied transaction must own every quota read, including FREE fallback
// and purchased extras. Falling back to a global client can exhaust the pool
// when several transactions hold all available connections.
const { outsideQuery } = vi.hoisted(() => ({ outsideQuery: vi.fn(() => { throw new Error("read outside transaction") }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {
  appUser: { findUnique: outsideQuery }, subscription: { findUnique: outsideQuery },
  appSale: { findFirst: outsideQuery, findMany: outsideQuery }, appUserGuardian: { findMany: outsideQuery },
  planPrice: { findMany: outsideQuery }, extraUnitPurchase: { aggregate: outsideQuery },
} }))
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }))
import { getMemorialFeatures } from "./subscription"
import { getExtraUnits } from "./extra-units"

beforeEach(() => vi.clearAllMocks())

it("reads the guardian's own live plan and purchased quantities through the supplied client", async () => {
  const tx = {
    appUser: { findUnique: vi.fn().mockResolvedValue({ role: "APP_USER" }) },
    appSale: { findFirst: vi.fn().mockResolvedValue({ subscription: { code: "PREMIUM", memorialsMax: 5 } }) },
    extraUnitPurchase: { aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 2 } }) },
  }
  expect(await getMemorialFeatures("guardian", tx as never)).toEqual({ code: "PREMIUM", memorialsMax: 5 })
  expect(await getExtraUnits("guardian", "MEMORIAL", tx as never)).toBe(2)
  expect(tx.extraUnitPurchase.aggregate).toHaveBeenCalledWith({ where: { buyerId: "guardian", resource: "MEMORIAL" }, _sum: { quantity: true } })
  expect(outsideQuery).not.toHaveBeenCalled()
})

it("uses the same transaction for the database-backed FREE fallback", async () => {
  const tx = {
    appUser: { findUnique: vi.fn().mockResolvedValue({ role: "APP_USER" }) },
    appSale: { findFirst: vi.fn().mockResolvedValue(null) },
    subscription: { findUnique: vi.fn().mockResolvedValue({ code: "FREE", memorialsMax: 1 }) },
  }
  expect(await getMemorialFeatures("guardian", tx as never)).toEqual({ code: "FREE", memorialsMax: 1 })
  expect(tx.subscription.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { code: "FREE" } }))
  expect(outsideQuery).not.toHaveBeenCalled()
})

it("keeps accepted-guardian inheritance and price ranking on the supplied transaction", async () => {
  const tx = {
    appUser: { findUnique: vi.fn().mockResolvedValue({ role: "APP_MEMO" }) },
    appUserGuardian: { findMany: vi.fn().mockResolvedValue([{ guardianId: "guardian" }]) },
    appSale: { findMany: vi.fn().mockResolvedValue([
      { subscriptionId: "basic", subscription: { code: "BASIC", memorialsMax: 2 } },
      { subscriptionId: "premium", subscription: { code: "PREMIUM", memorialsMax: 5 } },
    ]) },
    planPrice: { findMany: vi.fn().mockResolvedValue([
      { subscriptionId: "basic", annualCashAmount: 10 }, { subscriptionId: "premium", annualCashAmount: 30 },
    ]) },
  }
  expect(await getMemorialFeatures("memorial", tx as never)).toEqual({ code: "PREMIUM", memorialsMax: 5 })
  expect(tx.appUserGuardian.findMany).toHaveBeenCalledWith({ where: { appUserId: "memorial", status: "ACCEPTED" }, select: { guardianId: true } })
  expect(outsideQuery).not.toHaveBeenCalled()
})
