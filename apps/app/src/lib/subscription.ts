import "server-only"

import { cache } from "react"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@genealogiq/db"
import { type PlanQuotas } from "@/lib/plan-quotas"

export type { PlanQuotas } from "@/lib/plan-quotas"

type SubscriptionReader = Pick<Prisma.TransactionClient, "appUser" | "appUserGuardian" | "appSale" | "subscription" | "planPrice">

// Field names match PlanQuotas 1:1 — selecting this shape off a Subscription
// row IS a PlanQuotas object, no mapping needed.
const QUOTA_SELECT = {
  code:                  true,
  treeMaxMembers:        true,
  bioMaxChars:           true,
  mediaMaxImages:        true,
  mediaMaxVideos:        true,
  documentsMax:          true,
  geoPlacesMax:          true,
  memorialsMax:          true,
  petsMax:               true,
  qrCodeMax:             true,
} as const

// Cached per request — the FREE plan's own quotas, looked up once instead of
// re-querying for every profile that falls through to the free default.
const getFreeQuotas = cache(async (db: SubscriptionReader): Promise<PlanQuotas> => {
  const free = await db.subscription.findUnique({ where: { code: "FREE" }, select: QUOTA_SELECT })
  if (!free) throw new Error("FREE subscription row not found")
  return free
})

// Shared "is this specific AppSale row currently in its paid period"
// predicate — used both for a memorial's own directly-assigned legacy slot
// (below) and, in qr-quota.ts, to bypass the QR rank heuristic for a profile
// that already has its own dedicated paid slot.
export function isSaleLive(sale: { status: string | null; currentPeriodEnd: Date | null } | null | undefined): boolean {
  if (!sale) return false
  const now = new Date()
  return (sale.status === "active" || sale.status === "trialing") && !!sale.currentPeriodEnd && sale.currentPeriodEnd > now
}

/**
 * Resolves the plan quotas for a given profile.
 *
 * Every tier returned here comes from a Subscription row — there is no
 * hardcoded plan left in the codebase. A redeemed GenCode deliberately grants
 * NO tier of its own: it delivers a memorial, and that memorial resolves to
 * whatever plan its guardian holds (FREE for a fresh account). The physical
 * plaque is the product; the plan is sold separately in the APP.
 *
 * Living profile (APP_USER): own live paid AppSale > FREE.
 *
 * Memorial (APP_MEMO) or pet (APP_PET) profile: any ACCEPTED guardian's own
 * live paid AppSale (cascades — one guardian's subscription covers every
 * memorial/pet they manage; if guardians are on different tiers, the
 * highest-priced plan's quotas win — deterministic tie-break, unreachable
 * today with only FREE/PREMIUM but real once a third paid tier exists) > FREE.
 *
 * There is no longer a "sale assigned directly to this memorial" step: the
 * bulk-slot binding that populated it went with the B2B package channel.
 *
 * Cached per (profileId, request) so repeated callers share the same lookups.
 */
export const getMemorialFeatures = cache(async (profileId: string, db: SubscriptionReader = prisma): Promise<PlanQuotas> => {
  const profile = await db.appUser.findUnique({
    where: { id: profileId },
    select: { role: true },
  })

  if (profile?.role === "APP_MEMO" || profile?.role === "APP_PET") {
    const guardians = await db.appUserGuardian.findMany({
      where:  { appUserId: profileId, status: "ACCEPTED" },
      select: { guardianId: true },
    })

    if (guardians.length > 0) {
      const liveSales = await db.appSale.findMany({
        where: {
          appUserId:        { in: guardians.map((g) => g.guardianId) },
          status:           { in: ["active", "trialing"] },
          currentPeriodEnd: { gt: new Date() },
        },
        select: { subscriptionId: true, subscription: { select: QUOTA_SELECT } },
      })
      if (liveSales.length > 0) {
        // Guardians on different tiers: the richest plan's quotas win. Price now
        // comes from the versioned book rather than a column on the plan, and
        // USD is the yardstick because it is the one currency every plan is
        // priced in — comparing a BRL amount against a USD one would rank by
        // exchange rate rather than by tier.
        const prices = await db.planPrice.findMany({
          where: {
            subscriptionId: { in: liveSales.map((s) => s.subscriptionId) },
            currency: "USD", isActive: true, effectiveTo: null,
          },
          select: { subscriptionId: true, annualCashAmount: true },
        })
        const priceOf = new Map(prices.map((p) => [p.subscriptionId, Number(p.annualCashAmount)]))

        const richest = liveSales.reduce((best, s) =>
          (priceOf.get(s.subscriptionId) ?? 0) > (priceOf.get(best.subscriptionId) ?? 0) ? s : best)
        return richest.subscription
      }
    }

    return getFreeQuotas(db)
  }

  const sale = await db.appSale.findFirst({
    where: {
      appUserId:        profileId,
      status:           { in: ["active", "trialing"] },
      currentPeriodEnd: { gt: new Date() },
    },
    orderBy: { currentPeriodEnd: "desc" },
    select:  { subscription: { select: QUOTA_SELECT } },
  })
  if (sale) return sale.subscription

  return getFreeQuotas(db)
})
