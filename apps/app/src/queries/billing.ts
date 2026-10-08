import "server-only"

import { prisma } from "@/lib/prisma"
import { type Currency } from "@/lib/currency"
import { resolveSubscriptionPrice } from "@genealogiq/services/subscription-price"

export async function getActivePlan(userId: string) {
  const row = await prisma.appSale.findFirst({
    where: {
      appUserId: userId,
      status:    { in: ["active", "trialing"] },
      currentPeriodEnd: { gt: new Date() },
    },
    orderBy: { currentPeriodEnd: "desc" },
    select: {
      id:                   true,
      cadence:              true,
      currency:             true,
      status:               true,
      currentPeriodEnd:     true,
      cancelAtPeriodEnd:    true,
      stripeSubscriptionId: true,
      couponRedemption:     { select: { code: true } },
      consumerAccessGrant:  { select: { id: true } },
      subscription: { select: { id: true, code: true, name: true, termLength: true } },
    },
  })
  // currentPeriodEnd / status are nullable in schema (SEQ vendor sales share
  // this table) but the where-clause above guarantees both are set on hit.
  if (!row || !row.currentPeriodEnd || !row.status) return null

  // The currency this sale was ACTUALLY charged in (stored, from the real
  // Stripe Price) — never the viewer's current locale, which may have changed
  // since they subscribed. Null (pre-multi-currency sales) → USD.
  const charged = ((row.currency as Currency | null) ?? "USD") as Currency
  const resolved = await resolveSubscriptionPrice(row.subscription.id, charged)

  const currency     = (resolved?.currency as Currency | undefined) ?? charged
  const price        = resolved?.annualAmount ?? 0
  const monthlyPrice = resolved?.monthlyAmount ?? null

  return {
    ...row,
    currentPeriodEnd: row.currentPeriodEnd,
    status:           row.status,
    currency,
    subscription: {
      id:   row.subscription.id,
      code: row.subscription.code,
      name: row.subscription.name,
      termLength: row.subscription.termLength,
      price,
      monthlyPrice,
    },
  }
}

export type ActivePlan = NonNullable<Awaited<ReturnType<typeof getActivePlan>>>
