import "server-only"

import type Stripe from "stripe"
import type { Prisma } from "@genealogiq/db"
import { prisma } from "@/lib/prisma"

export type ExtraUnitResource = "GEO_PLACE" | "QR_CODE" | "MEMORIAL"

// Extra units purchased on top of a guardian's plan quota (geo places, QR
// codes, memorial-creation slots) — one-time purchases, never expire.
// See createExtraUnitCheckoutSession (actions/extra-units.actions.ts) for
// how a purchase is created, and the Stripe webhook for how it's recorded.
export async function getExtraUnits(
  buyerId: string,
  resource: ExtraUnitResource,
  db: Pick<Prisma.TransactionClient, "extraUnitPurchase"> = prisma,
): Promise<number> {
  const result = await db.extraUnitPurchase.aggregate({
    where: { buyerId, resource },
    _sum: { quantity: true },
  })
  return result._sum.quantity ?? 0
}

// Records a completed one-time "buy 1 extra unit" purchase, called from the
// Stripe webhook. Idempotent via ExtraUnitPurchase.stripeSessionId @unique —
// a P2002 on a duplicate delivery is swallowed as "already processed,"
// mirroring apps/seq's applyCheckoutSession pattern.
export async function applyExtraUnitPurchase(checkoutSession: Stripe.Checkout.Session): Promise<void> {
  const meta = checkoutSession.metadata ?? {}
  const buyerId  = meta.buyerId
  const resource = meta.resource as ExtraUnitResource | undefined
  const tier     = meta.tier
  const currency = meta.currency
  if (!buyerId || !resource || !tier || !currency) {
    console.error("[extra-units] missing/invalid metadata", { sessionId: checkoutSession.id, meta })
    return
  }

  const amountPaid = (checkoutSession.amount_total ?? 0) / 100

  try {
    await prisma.extraUnitPurchase.create({
      data: {
        buyerId,
        resource,
        tier,
        currency,
        amountPaid,
        stripeSessionId: checkoutSession.id,
      },
    })
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return // already processed
    throw e
  }
}
