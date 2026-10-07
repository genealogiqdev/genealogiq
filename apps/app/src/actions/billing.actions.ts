"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { resolveLocale } from "@genealogiq/i18n/server"
import { ok, fail, type ActionResult } from "@genealogiq/core"
import { verifySession } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"
import { ensureStripeCustomer, upsertSaleFromSubscription } from "@/lib/billing"
import { LOCALE_TO_CURRENCY, type Currency } from "@/lib/currency"
import {
  resolveSubscriptionPrice,
  compareTier,
  stripePriceIdFor,
} from "@genealogiq/services/subscription-price"

export async function createCheckoutSession(
  subscriptionId: string,
  cadence:        "annual" | "monthly",
): Promise<ActionResult<{ url: string }>> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const manualPlan = await prisma.appSale.findFirst({
    where: {
      appUserId: session.user.id, status: { in: ['active', 'trialing'] },
      currentPeriodEnd: { gt: new Date() }, couponRedemption: { isNot: null },
    },
    select: { id: true },
  })
  if (manualPlan) return fail(t('billing.manualPlanActive'))

  const plan = await prisma.subscription.findUnique({
    where:  { id: subscriptionId, isActive: true },
    select: { id: true, name: true },
  })
  if (!plan) return fail(t("billing.planNotFound"))

  const viewerCurrency = LOCALE_TO_CURRENCY[await resolveLocale()]
  const price = await resolveSubscriptionPrice(plan.id, viewerCurrency)
  if (!price) return fail(t("billing.planNotFound"))

  const priceId = stripePriceIdFor(price, cadence)
  if (!priceId) return fail(t("billing.planNotWiredSeed"))
  const currency = price.currency as Currency

  const customerId = await ensureStripeCustomer(session.user.id)
  const appUrl     = process.env.APP_URL ?? "http://localhost:3000"
  const metadata   = { userId: session.user.id, subscriptionId: plan.id, cadence }

  const checkout = await stripe.checkout.sessions.create({
    mode:                  "subscription",
    customer:              customerId,
    line_items:            [{ price: priceId, quantity: 1 }],
    client_reference_id:   session.user.id,
    metadata,
    subscription_data:     { metadata },
    success_url:           `${appUrl}/subscriptions?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:            `${appUrl}/subscriptions?status=cancel`,
    allow_promotion_codes: true,
  })

  if (!checkout.url) return fail(t("billing.noCheckoutUrl"))
  return ok({ url: checkout.url })
}

/**
 * Switches an existing subscriber to a different plan/cadence.
 * - Upgrade or cadence-only swap (target ≥ current): apply immediately, prorate, charge today
 * - Downgrade (target < current): schedule the switch for end of current period via Subscription Schedule
 */
export async function changeSubscription(
  subscriptionId: string,
  cadence:        "annual" | "monthly",
): Promise<ActionResult<{ effect: "upgraded" | "scheduled" }>> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  // Active subscription (none = caller should use createCheckoutSession instead).
  // `stripeSubscriptionId: { not: null }` excludes SEQ vendor sales sharing
  // this table; the same filter is implicit via status/currentPeriodEnd, but
  // declaring it explicitly narrows the type in code below.
  const active = await prisma.appSale.findFirst({
    where: {
      appUserId: session.user.id,
      status:    { in: ["active", "trialing"] },
      currentPeriodEnd: { gt: new Date() },
      stripeSubscriptionId: { not: null },
    },
    orderBy: { currentPeriodEnd: "desc" },
    select: {
      stripeSubscriptionId: true,
      currency:             true,
      subscription: { select: { id: true } },
    },
  })
  if (!active || !active.stripeSubscriptionId) return fail(t("billing.noActiveSubscription"))
  const stripeSubId = active.stripeSubscriptionId

  const target = await prisma.subscription.findUnique({
    where:  { id: subscriptionId, isActive: true },
    select: { id: true },
  })
  if (!target) return fail(t("billing.planNotFound"))

  // A Stripe subscription can't silently change currency mid-life — reuse
  // whichever currency the active subscription was actually charged in
  // (never the viewer's current locale, which may have changed since).
  const currency = ((active.currency as Currency | null) ?? "USD") as Currency

  const [targetPrice, activePrice] = await Promise.all([
    resolveSubscriptionPrice(target.id, currency),
    resolveSubscriptionPrice(active.subscription.id, currency),
  ])
  if (!targetPrice || !activePrice) return fail(t("billing.planNotFound"))

  const targetPriceId = stripePriceIdFor(targetPrice, cadence)
  if (!targetPriceId) return fail(t("billing.planNotWired"))

  const cmp = compareTier(targetPrice, activePrice)

  const metadata = { userId: session.user.id, subscriptionId: target.id, cadence }

  try {
    if (cmp >= 0) {
      // Upgrade or cadence-only swap: replace the price on the existing subscription, prorate, charge now.
      const sub = await stripe.subscriptions.retrieve(stripeSubId)
      const itemId = sub.items.data[0]?.id
      if (!itemId) return fail(t("billing.noSubscriptionItems"))

      const updated = await stripe.subscriptions.update(stripeSubId, {
        items:              [{ id: itemId, price: targetPriceId }],
        proration_behavior: "always_invoice",
        metadata,
      })

      // Mirror the change to our DB immediately so the page refresh shows the new
      // plan without waiting for the customer.subscription.updated webhook. The
      // webhook will also fire and upsert again — idempotent via stripeSubscriptionId.
      await upsertSaleFromSubscription(prisma, updated)

      revalidatePath("/subscriptions")
      revalidatePath(`/profile/${session.user.id}/memorialized`)
      return ok({ effect: "upgraded" })
    }

    // Downgrade: schedule the switch for end of current period. Stripe
    // rejects subscriptionSchedules.create when the subscription already has
    // one attached — check first so a second attempt gets a translated
    // message instead of a raw Stripe API error surfaced to the user.
    const currentSub = await stripe.subscriptions.retrieve(stripeSubId)
    if (currentSub.schedule) return fail(t("billing.downgradeAlreadyPending"))

    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: stripeSubId,
    })
    const currentPhase = schedule.phases[0]
    if (!currentPhase) return fail(t("billing.noSchedulePhase"))

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        {
          items:      currentPhase.items.map((it) => ({
            price:    typeof it.price === "string" ? it.price : it.price.id,
            quantity: it.quantity ?? 1,
          })),
          start_date: currentPhase.start_date,
          end_date:   currentPhase.end_date ?? undefined,
          metadata:   currentPhase.metadata ?? undefined,
        },
        {
          items:    [{ price: targetPriceId, quantity: 1 }],
          metadata,
        },
      ],
    })

    revalidatePath("/subscriptions")
    return ok({ effect: "scheduled" })
  } catch (err) {
    console.error("[billing] changeSubscription failed", err)
    return fail((err as Error).message ?? t("billing.switchFailed"))
  }
}

export async function createPortalSession(): Promise<ActionResult<{ url: string }>> {
  const session    = await verifySession()
  const customerId = await ensureStripeCustomer(session.user.id)
  const appUrl     = process.env.APP_URL ?? "http://localhost:3000"

  const portal = await stripe.billingPortal.sessions.create({
    customer:   customerId,
    return_url: `${appUrl}/subscriptions`,
  })
  return ok({ url: portal.url })
}
