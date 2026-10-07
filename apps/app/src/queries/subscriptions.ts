import "server-only"

import { resolveLocale } from "@genealogiq/i18n/server"
import { prisma } from "@/lib/prisma"
import { LOCALE_TO_CURRENCY, type Currency } from "@/lib/currency"
import { mapSubscriptionPrices } from "@genealogiq/services/subscription-price"

export async function getActiveSubscriptions(activeManualSubscriptionId?: string) {
  const viewerCurrency = LOCALE_TO_CURRENCY[await resolveLocale()]

  const rows = await prisma.subscription.findMany({
    // Self-serve checkout only ever offers the plans this app actually sells
    // this way. Include a manually activated plan for this account so its
    // benefits remain visible, even if it is no longer in the public catalog.
    where: {
      OR: [
        { isActive: true, code: { in: ["FREE", "PREMIUM"] } },
        ...(activeManualSubscriptionId ? [{ id: activeManualSubscriptionId }] : []),
      ],
    },
    select: {
      id:                    true,
      code:                  true,
      name:                  true,
      description:           true,
      termLength:            true,
      treeMaxMembers:        true,
      bioMaxChars:           true,
      mediaMaxImages:        true,
      mediaMaxVideos:        true,
      documentsMax:          true,
      geoPlacesMax:          true,
      memorialsMax:          true,
      petsMax:               true,
      qrCodeMax:             true,
    },
  })

  // One query for the whole book rather than one per plan: the grid renders
  // every tier at once, and the fallback to USD is resolved inside.
  const prices = await mapSubscriptionPrices(rows.map((r) => r.id), viewerCurrency)

  const resolved = rows.map((r) => {
    const priced = prices.get(r.id)
    // A plan with no live price is a free tier — FREE has nothing to charge and
    // deliberately carries no price-book row.
    const price        = priced?.annualAmount ?? 0
    const monthlyPrice = priced?.monthlyAmount ?? null
    // The book stores the code as text; the app narrows it back to the three it
    // actually supports, with the viewer's own as the fallback for a free tier.
    const currency     = (priced?.currency as Currency | undefined) ?? viewerCurrency

    return {
      id:          r.id,
      code:        r.code,
      name:        r.name,
      description: r.description,
      termLength:  r.termLength,
      price,
      monthlyPrice,
      currency,
      quotas: {
        code:                  r.code,
        treeMaxMembers:        r.treeMaxMembers,
        bioMaxChars:           r.bioMaxChars,
        mediaMaxImages:        r.mediaMaxImages,
        mediaMaxVideos:        r.mediaMaxVideos,
        documentsMax:          r.documentsMax,
        geoPlacesMax:          r.geoPlacesMax,
        memorialsMax:          r.memorialsMax,
        petsMax:               r.petsMax,
        qrCodeMax:             r.qrCodeMax,
      },
    }
  })

  // Sort in code, not via Prisma's orderBy: with independent per-currency
  // prices, USD tier-order isn't guaranteed to match BRL/MXN order once a
  // 3rd paid plan exists — sort by whatever's actually being shown.
  return resolved.sort((a, b) => a.price - b.price)
}

export type SubscriptionRow = Awaited<ReturnType<typeof getActiveSubscriptions>>[number]
