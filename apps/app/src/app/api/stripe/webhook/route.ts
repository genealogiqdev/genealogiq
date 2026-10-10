import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { upsertSaleFromSubscription } from "@/lib/billing"
import { applyExtraUnitPurchase } from "@/lib/extra-units"
import { deliverEmail } from '@genealogiq/services/email-outbox'
import { consumerInvoiceEmailId, invoiceSubscriptionId, queueConsumerInvoiceEmail } from '@genealogiq/services/sale-notifications'

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RELEVANT_EVENTS = new Set<Stripe.Event["type"]>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.paid",
  "invoice.payment_failed",
])

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature")
  if (!signature) return new NextResponse("Missing signature", { status: 400 })

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) return new NextResponse("Webhook secret not configured", { status: 500 })

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    // Log the detail server-side; don't echo verifier internals to the caller.
    console.error("Stripe webhook signature verification failed:", (err as Error).message)
    return new NextResponse("Invalid signature", { status: 400 })
  }

  if (!RELEVANT_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true })
  }

  // checkout.session.completed fires for BOTH cadences this app creates:
  // mode:"subscription" (createCheckoutSession, billing.actions.ts — state
  // stays driven exclusively by the customer.subscription.* branch below,
  // never processed here) and mode:"payment" (createExtraUnitCheckoutSession,
  // one-time extra-unit purchases — handled in this branch).
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const subId = invoiceSubscriptionId(invoice)
    if (!subId) return NextResponse.json({ received: true, ignored: 'invoice without subscription' })
    const failed = event.type === 'invoice.payment_failed'
    try {
      const sub = await stripe.subscriptions.retrieve(subId)
      if (!sub.metadata?.userId || !sub.metadata?.subscriptionId || !sub.metadata?.cadence) {
        return NextResponse.json({ received: true, ignored: 'not a consumer subscription' })
      }
      await prisma.$transaction(async (tx) => {
        await upsertSaleFromSubscription(tx, sub)
        await queueConsumerInvoiceEmail(tx, sub, invoice, failed)
      })
      await deliverEmail(consumerInvoiceEmailId(invoice.id, failed))
      return NextResponse.json({ received: true })
    } catch {
      console.error('[stripe-webhook] consumer invoice processing failed', { eventId: event.id })
      return NextResponse.json({ error: 'internal' }, { status: 500 })
    }
  }

  if (event.type === "checkout.session.completed" || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode !== "payment") {
      return NextResponse.json({ received: true, ignored: "non-payment mode" })
    }
    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true, ignored: "unpaid" })
    }

    // Fast-path idempotency: skip events already fully processed.
    const seen = await prisma.stripeEvent.findUnique({ where: { id: event.id }, select: { id: true } })
    if (seen) {
      await deliverEmail(`extra-unit:${session.id}`)
      return NextResponse.json({ received: true, duplicate: true })
    }

    try {
      // Process FIRST (idempotent via ExtraUnitPurchase.stripeSessionId
      // unique), then record the event. Recording only after a successful
      // apply means a failed apply leaves no StripeEvent row, so Stripe's
      // retry reprocesses it instead of being skipped as a duplicate.
      await applyExtraUnitPurchase(session)
      await deliverEmail(`extra-unit:${session.id}`)
      await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } }).catch((err: unknown) => {
        if ((err as { code?: string }).code !== "P2002") throw err
      })
    } catch (err: unknown) {
      console.error("[stripe-webhook] applyExtraUnitPurchase failed", err)
      return NextResponse.json({ error: "internal" }, { status: 500 })
    }

    return NextResponse.json({ received: true })
  }

  try {
    // Idempotency + atomicity: the StripeEvent PK insert and the sale upsert run
    // in one transaction. A duplicate delivery throws P2002 (caught below); if the
    // upsert fails, the StripeEvent row rolls back too, so Stripe's retry can
    // reprocess the event instead of it being permanently marked as "seen".
    await prisma.$transaction(async (tx) => {
      await tx.stripeEvent.create({ data: { id: event.id, type: event.type } })
      await upsertSaleFromSubscription(tx, event.data.object as Stripe.Subscription)
    })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true })
    }
    console.error("[stripe-webhook] processing failed", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
