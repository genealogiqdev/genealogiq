import 'server-only'

import type Stripe from 'stripe'
import { prisma, type Prisma } from '@genealogiq/db'
import { generateGenCode } from '@genealogiq/core'
import { grantCycleCredits } from './credits'
import { decideRollover, countRollableCredits } from './rollover'
import { addBillingMonths } from './billing-dates'
import { queuePartnerInvoiceEmail, invoiceSubscriptionId } from './sale-notifications'

/**
 * Cycle lifecycle for a partner's B2B subscription.
 *
 * The heart of this file is one decision, and it is the one the first draft of
 * the plan got wrong: **when does a paid invoice mean "renew"?**
 *
 * The obvious answer — branch on Stripe's `billing_reason`, treating
 * `subscription_cycle` as a renewal — is right for the annual cadence and
 * catastrophically wrong for instalments. A 12x plan bills MONTHLY, and every
 * one of those twelve invoices carries `billing_reason: subscription_cycle`.
 * Following Stripe's word would open a new cycle, with a whole new allowance of
 * 100-400 activations, every single month.
 *
 * So the boundary is ours, not Stripe's: a cycle runs CYCLE_MONTHS from the day
 * it opened, and a paid invoice only renews when the current cycle has actually
 * run out. Everything else is just another instalment of the cycle already in
 * flight. This is also why `cancel_at` was removed from the subscription — the
 * old code let Stripe end a monthly plan after its term, which killed the
 * partner's stock instead of renewing it.
 */

/** A cycle is a year. If a 6- or 18-month plan is ever sold, this becomes a plan column. */
export const CYCLE_MONTHS = 12

export type CycleOutcome = 'first-cycle' | 'renewed' | 'instalment' | 'ignored'

export interface AppliedInvoice {
  outcome:        CycleOutcome
  subscriptionId: string | null
  cycleId:        string | null
}

export const partnerCycleSelect = {
  id: true, planId: true, status: true, tenantId: true,
  plan: {
    select: {
      id: true, name: true, code: true, annualAllowance: true, graceDays: true,
      rolloverRate: true, rolloverValidityMonths: true, committedReservationMonths: true,
      activationTrialMonths: true, activationTrialPlanCode: true, version: true,
    },
  },
  autoRenew: true, founderRolloverEligible: true, founderRolloverUsed: true,
  currentCycle: { select: { id: true, endAt: true } },
} as const satisfies Prisma.PartnerSubscriptionSelect

type CycleSubscription = Prisma.PartnerSubscriptionGetPayload<{ select: typeof partnerCycleSelect }>

function addMonths(from: Date, months: number): Date {
  return addBillingMonths(from, months)
}

/**
 * Brings the partner's stock of unactivated codes up to their credit balance.
 *
 * Mints the DELTA, never the whole allowance. This is the invariant the physical
 * side of the product rests on:
 *
 *   unactivated physical codes <= credit balance
 *
 * Get it wrong by minting the full allowance on every renewal and a partner who
 * activated 40 of 100 ends up holding 160 plaques against 130 credits — thirty
 * families receiving an object that cannot activate, discovered at a graveside.
 *
 * Codes are never destroyed to shrink the other way: a plaque already engraved
 * exists whatever the balance says. The ledger simply refuses to activate it.
 */
async function mintToMatchBalance(
  tx:       Prisma.TransactionClient,
  tenantId: string,
  cycleId:  string,
): Promise<number> {
  const now = new Date()

  const [grants, unactivated] = await Promise.all([
    tx.creditGrant.findMany({
      where: {
        tenantId, status: 'ACTIVE', remainingQty: { gt: 0 },
        source: { not: 'COMMITTED' },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { remainingQty: true },
    }),
    tx.genCode.count({ where: { tenantId, status: { in: ['AVAILABLE', 'SOLD'] } } }),
  ])

  const balance = grants.reduce((sum, g) => sum + g.remainingQty, 0)
  const delta   = balance - unactivated
  if (delta <= 0) return 0

  await tx.genCode.createMany({
    data: Array.from({ length: delta }, () => ({
      genCode:         generateGenCode(),
      tenantId,
      mintedInCycleId: cycleId,
    })),
  })
  return delta
}

/**
 * Closes out the grants a finished cycle funded.
 *
 * COMMITTED grants are untouched: they left the pool when a family paid for
 * them and are not the partner's to lose.
 */
async function expireCycleGrants(
  tx: Prisma.TransactionClient,
  tenantId: string,
  cycleId: string,
): Promise<void> {
  const leftovers = await tx.creditGrant.findMany({
    where: {
      tenantId, cycleId, status: 'ACTIVE', remainingQty: { gt: 0 },
      source: { notIn: ['COMMITTED'] },
    },
    select: { id: true, remainingQty: true },
  })

  for (const grant of leftovers) {
    await tx.creditGrant.update({
      where: { id: grant.id },
      data:  { remainingQty: 0, status: 'EXPIRED' },
    })
    await tx.creditTransaction.create({
      data: {
        grantId:        grant.id,
        tenantId,
        type:           'EXPIRE',
        quantity:       grant.remainingQty,
        balanceAfter:   0,
        idempotencyKey: `expire:cycle:${cycleId}:${grant.id}`,
        reason:         'Cycle closed; credits not carried over',
      },
    })
  }
}

function addDays(from: Date, days: number): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * Applies a paid Stripe invoice to the partner subscription it belongs to.
 *
 * Idempotent by construction rather than by a flag: a cycle carries the id of
 * the invoice that opened it under a unique index, so a replayed webhook that
 * tries to open the same cycle twice loses to the constraint instead of
 * granting a second allowance.
 */
export async function applyPartnerInvoicePaid(invoice: Stripe.Invoice): Promise<AppliedInvoice> {
  const stripeSubscriptionId = invoiceSubscriptionId(invoice)
  if (!stripeSubscriptionId) return { outcome: 'ignored', subscriptionId: null, cycleId: null }

  const subscription = await prisma.partnerSubscription.findUnique({
    where:  { stripeSubscriptionId },
    select: partnerCycleSelect,
  })
  // Not ours: the account also carries the APP's B2C subscriptions, and Stripe
  // fans every event out to every endpoint.
  if (!subscription) return { outcome: 'ignored', subscriptionId: null, cycleId: null }

  // Replay of an invoice we already turned into a cycle.
  const already = await prisma.subscriptionCycle.findUnique({
    where:  { stripeInvoiceId: invoice.id },
    select: { id: true },
  })
  if (already) {
    return { outcome: 'ignored', subscriptionId: subscription.id, cycleId: already.id }
  }

  const now      = new Date()
  const current  = subscription.currentCycle
  const isFirst  = !current
  const expired  = !!current && current.endAt <= now

  // The whole point of this file: an instalment is not a renewal.
  if (!isFirst && !expired) {
    await queuePartnerInvoiceEmail(prisma, subscription.id, invoice)
    return { outcome: 'instalment', subscriptionId: subscription.id, cycleId: current.id }
  }

  const price = await resolveInvoicePrice(invoice)
  const cycle = await prisma.$transaction(async (tx) => {
    const opened = await openPartnerCycle(tx, { subscription, price, now, stripeInvoiceId: invoice.id })
    await queuePartnerInvoiceEmail(tx, subscription.id, invoice)
    return opened
  })

  return {
    outcome: isFirst ? 'first-cycle' : 'renewed',
    subscriptionId: subscription.id,
    cycleId: cycle.id,
  }
}

/** Shared entitlement writer for verified Stripe invoices and BMS settlements. */
export async function openPartnerCycle(
  tx: Prisma.TransactionClient,
  { subscription, price, now, stripeInvoiceId = null }: {
    subscription: CycleSubscription
    price: Prisma.InputJsonObject
    now: Date
    stripeInvoiceId?: string | null
  },
): Promise<{ id: string }> {
  const plan  = subscription.plan
  const current = subscription.currentCycle

  const startAt    = now
  const endAt      = addMonths(startAt, CYCLE_MONTHS)
  // Frozen, not derived on read: a later edit to the plan's graceDays must not
  // move a deadline a partner is already living under.
  const graceEndAt = addDays(endAt, plan.graceDays)

  const tenantId = subscription.tenantId

  if (current) {
    await tx.subscriptionCycle.update({
      where: { id: current.id },
      data:  { status: 'CLOSED' },
    })
  }

  const created = await tx.subscriptionCycle.create({
    data: {
      subscriptionId:     subscription.id,
      planId:             plan.id,
      // Same reasoning as the price book below: rolloverRate is a Decimal,
      // and a frozen record reads better as plain data than as whatever a
      // future client deserialises a Decimal into.
      planSnapshot:       { ...plan, rolloverRate: plan.rolloverRate.toString() },
      priceSnapshot:      price,
      startAt,
      endAt,
      graceEndAt,
      status:             'ACTIVE',
      renewedFromCycleId: current?.id ?? null,
      stripeInvoiceId,
    },
    select: { id: true },
  })

  await tx.partnerSubscription.update({
    where: { id: subscription.id },
    data:  { currentCycleId: created.id, status: 'ACTIVE' },
  })

  // Rollover BEFORE the fresh allowance, and before expiring the old cycle:
  // what carries over is measured against the grants the closing cycle still
  // holds.
  if (current) {
    const unused   = await countRollableCredits(tx, tenantId, current.id)
    const decision = decideRollover({
      unused,
      renewedAllowance: plan.annualAllowance,
      rolloverRate:     Number(plan.rolloverRate),
      founderEligible:  subscription.founderRolloverEligible,
      founderUsed:      subscription.founderRolloverUsed,
    })

    if (decision.quantity > 0) {
      const rolloverExpiry = decision.validity === 'cycle-end'
        ? endAt
        : addMonths(startAt, plan.rolloverValidityMonths)

      await grantCycleCredits({
        tenantId,
        subscriptionId:     subscription.id,
        cycleId:            created.id,
        quantity:           decision.quantity,
        expiresAt:          rolloverExpiry,
        source:             decision.usedFounder ? 'FOUNDER_ROLLOVER' : 'ROLLOVER',
        // Generation 1: this unit has now rolled, and can never roll again.
        rolloverGeneration: 1,
        tx,
      })
    }

    if (decision.usedFounder) {
      await tx.partnerSubscription.update({
        where: { id: subscription.id },
        data:  { founderRolloverUsed: true },
      })
    }

    // Whatever did not carry over dies with the cycle that funded it. Written
    // as an explicit EXPIRE rather than left to the daily job so the ledger
    // explains the drop at the moment it happens.
    await expireCycleGrants(tx, tenantId, current.id)
  }

  await grantCycleCredits({
    tenantId:       tenantId,
    subscriptionId: subscription.id,
    cycleId:        created.id,
    quantity:       plan.annualAllowance,
    expiresAt:      endAt,
    tx,
  })

  await mintToMatchBalance(tx, tenantId, created.id)

  return created
}

/**
 * Binds a Stripe subscription to the contract that opened its checkout.
 *
 * The contract is written before the session exists, so it has no
 * stripeSubscriptionId until Stripe actually creates the subscription. This is
 * what fills it in, from the metadata stamped on `subscription_data`.
 *
 * Called from BOTH the customer.subscription.* branch and, defensively, before
 * handling invoice.paid: Stripe does not guarantee the order those two arrive
 * in, and an invoice that lands first would otherwise find no contract and be
 * silently ignored — a paid cycle that never opened.
 *
 * Returns the contract id when this event is ours, null otherwise.
 */
export async function linkPartnerSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const contractId = sub.metadata?.partnerSubscriptionId
  if (!contractId) return null

  const contract = await prisma.partnerSubscription.findUnique({
    where:  { id: contractId },
    select: { id: true, stripeSubscriptionId: true },
  })
  if (!contract) return null
  if (contract.stripeSubscriptionId === sub.id) return contract.id

  await prisma.partnerSubscription.update({
    where: { id: contract.id },
    data:  { stripeSubscriptionId: sub.id },
  })
  return contract.id
}

/**
 * Mirrors Stripe's subscription status onto the contract.
 *
 * `past_due` freezes the partner immediately and un-freezes itself the moment
 * Stripe reports `active` again — no sweeper, no state to reconcile. That is
 * the behaviour the old Sale window already had, kept deliberately.
 *
 * EXPIRED is NOT set here. It belongs to the daily job, because it is a
 * statement about our grace deadline having passed, not about anything Stripe
 * knows.
 */
export async function syncPartnerSubscriptionStatus(sub: Stripe.Subscription): Promise<void> {
  const mapped =
    sub.status === 'active' || sub.status === 'trialing' ? 'ACTIVE'   :
    sub.status === 'past_due' || sub.status === 'unpaid'  ? 'PAST_DUE' :
    sub.status === 'canceled'                             ? 'CANCELLED' :
    null
  if (!mapped) return

  await prisma.partnerSubscription.updateMany({
    where: { stripeSubscriptionId: sub.id },
    data:  { status: mapped },
  })
}

/**
 * The financial snapshot the cycle freezes (RF-14).
 *
 * Taken from the invoice rather than re-read from plan_prices on purpose: the
 * invoice is what the partner was actually charged, and a price book that moved
 * between checkout and payment must not rewrite it.
 */
async function resolveInvoicePrice(invoice: Stripe.Invoice): Promise<Prisma.InputJsonObject> {
  const line    = invoice.lines?.data?.[0]
  const priceId = (line as unknown as { price?: { id?: string } } | undefined)?.price?.id ?? null

  const planPrice = priceId
    ? await prisma.planPrice.findFirst({
        where:  { OR: [{ stripeCashPriceId: priceId }, { stripeInstallmentPriceId: priceId }] },
        select: {
          id: true, currency: true, countryScope: true, annualCashAmount: true,
          installmentCount: true, installmentAmount: true, unitReferenceAmount: true,
          version: true, stripeCashPriceId: true, stripeInstallmentPriceId: true,
        },
      })
    : null

  return {
    planPriceId:   planPrice?.id ?? null,
    cadence:       planPrice ? (planPrice.stripeCashPriceId === priceId ? 'cash' : 'installment') : null,
    stripePriceId: priceId,
    currency:      invoice.currency?.toUpperCase() ?? planPrice?.currency ?? null,
    // Cents, as Stripe reports them — what this invoice actually charged.
    amountPaid:    invoice.amount_paid ?? null,
    // Amounts are stringified rather than handed over as Decimal instances. A
    // snapshot is a frozen record, and it should not depend on how some future
    // client chooses to deserialise a Decimal to stay readable.
    book: planPrice
      ? {
          id:                  planPrice.id,
          currency:            planPrice.currency,
          countryScope:        planPrice.countryScope,
          version:             planPrice.version,
          annualCashAmount:    planPrice.annualCashAmount.toString(),
          installmentCount:    planPrice.installmentCount,
          installmentAmount:   planPrice.installmentAmount?.toString() ?? null,
          unitReferenceAmount: planPrice.unitReferenceAmount?.toString() ?? null,
        }
      : null,
  }
}
