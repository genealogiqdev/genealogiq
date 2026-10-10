import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { provisionTenantAccess } from '@/lib/billing'
import { deliverEmail } from '@genealogiq/services/email-outbox'
import { invoiceSubscriptionId, packageSaleEmailId, partnerInvoiceEmailId, queuePartnerInvoiceEmail } from '@genealogiq/services/sale-notifications'
import {
  applyPartnerInvoicePaid,
  linkPartnerSubscription,
  syncPartnerSubscriptionStatus,
} from '@genealogiq/services/partner-billing'
import {
  closeGenCodePackageCheckout,
  fulfillGenCodePackageCheckout,
  isGenCodePackageCheckout,
} from '@genealogiq/services/gencode-package'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A partner contract's whole life, in two events.
//
// `invoice.paid` is the only renewal signal, and it is deliberately NOT branched
// on `billing_reason`: a 12x plan bills monthly and every one of those twelve
// invoices says `subscription_cycle`, so trusting Stripe's word would grant a
// fresh allowance every month. The cycle boundary is ours — applyPartnerInvoicePaid
// owns that decision.
//
// `customer.subscription.*` carries only status. It cannot open a cycle, because
// a subscription exists before it is paid for.
const RELEVANT_EVENTS = new Set<Stripe.Event['type']>([
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
])

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new NextResponse('Missing signature', { status: 400 })

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[bms-stripe-webhook] STRIPE_WEBHOOK_SECRET is not set')
    return new NextResponse('Server misconfigured', { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret)
  } catch (err) {
    // Log the detail server-side; don't echo verifier internals to the caller.
    console.error('Stripe webhook signature verification failed:', (err as Error).message)
    return new NextResponse('Invalid signature', { status: 400 })
  }

  if (!RELEVANT_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true })
  }

  if (event.type.startsWith('checkout.session.')) {
    const checkout = event.data.object as Stripe.Checkout.Session
    if (!isGenCodePackageCheckout(checkout)) {
      return NextResponse.json({ received: true, ignored: 'not a GenCode package checkout' })
    }

    try {
      if (event.type === 'checkout.session.async_payment_failed') {
        const changed = await closeGenCodePackageCheckout(checkout, 'FAILED')
        return NextResponse.json({ received: true, outcome: changed ? 'failed' : 'ignored' })
      }
      if (event.type === 'checkout.session.expired') {
        const changed = await closeGenCodePackageCheckout(checkout, 'EXPIRED')
        return NextResponse.json({ received: true, outcome: changed ? 'expired' : 'ignored' })
      }

      const result = await fulfillGenCodePackageCheckout(checkout)
      if (result.outcome === 'fulfilled' || result.outcome === 'already-fulfilled') {
        await deliverEmail(packageSaleEmailId(checkout.metadata!.genCodeOrderId))
      }

      // A package may be the partner's first purchase. Provision on both the
      // first fulfillment and a replay so a transient email failure can heal
      // without minting credits or codes twice.
      if (
        result.tenantId
        && (result.outcome === 'fulfilled' || result.outcome === 'already-fulfilled')
      ) {
        await provisionTenantAccess(result.tenantId)
      }

      return NextResponse.json({ received: true, outcome: result.outcome })
    } catch (err) {
      console.error('[bms-stripe-webhook] GenCode package checkout failed', err)
      return NextResponse.json({ error: 'internal' }, { status: 500 })
    }
  }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const subId = invoiceSubscriptionId(invoice)
    if (!subId) return NextResponse.json({ received: true, ignored: 'invoice without subscription' })

    try {
      // Retrieved rather than read off the invoice: the contract id lives in the
      // SUBSCRIPTION's metadata, and Stripe does not guarantee that
      // customer.subscription.created arrives first. An invoice landing ahead of
      // it would otherwise find an unbound contract and be ignored in silence —
      // a paid cycle that never opened.
      const sub = await stripe.subscriptions.retrieve(subId)
      if (!sub.metadata?.partnerSubscriptionId) {
        return NextResponse.json({ received: true, ignored: 'not a partner subscription' })
      }
      if (event.type === 'invoice.payment_failed') {
        await queuePartnerInvoiceEmail(prisma, sub.metadata.partnerSubscriptionId, invoice, true)
        await deliverEmail(partnerInvoiceEmailId(invoice.id, true))
        return NextResponse.json({ received: true })
      }
      await linkPartnerSubscription(sub)
      const applied = await applyPartnerInvoicePaid(invoice)
      if (applied.subscriptionId) await deliverEmail(partnerInvoiceEmailId(invoice.id))

      // Outside the cycle transaction: this sends an email, and an email cannot
      // be rolled back. Only the first cycle can grant access; a renewal finds
      // the owner already active and leaves them alone.
      if (applied.subscriptionId) {
        const contract = await prisma.partnerSubscription.findUnique({
          where:  { id: applied.subscriptionId },
          select: { tenantId: true },
        })
        if (contract) await provisionTenantAccess(contract.tenantId)
      }

      return NextResponse.json({ received: true, outcome: applied.outcome })
    } catch (err) {
      console.error('[bms-stripe-webhook] applyPartnerInvoicePaid failed', err)
      return NextResponse.json({ error: 'internal' }, { status: 500 })
    }
  }

  const sub = event.data.object as Stripe.Subscription

  // Stripe fans every subscribed event out to EVERY endpoint on the account, so
  // this route also sees SEQ's and the APP's subscriptions. Ours are the ones we
  // stamped with a contract id.
  if (!sub.metadata?.partnerSubscriptionId) {
    return NextResponse.json({ received: true, ignored: 'not a partner subscription' })
  }

  try {
    // Ledger and apply in ONE transaction: a duplicate delivery hits the PK and
    // a failed apply rolls the ledger row back so Stripe's retry can reprocess.
    await prisma.$transaction(async (tx) => {
      await tx.stripeEvent.create({ data: { id: event.id, type: event.type } })
      await linkPartnerSubscription(sub)
      await syncPartnerSubscriptionStatus(sub)
    })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    console.error('[bms-stripe-webhook] partner subscription sync failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
