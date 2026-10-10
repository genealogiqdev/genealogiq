import 'server-only'

import type { Prisma } from '@genealogiq/db'

/**
 * The B2C trial an activation hands the guardian.
 *
 * This is what closes the B2B2C loop the founder's spec never addressed: before
 * it, a family redeemed a plaque and landed on FREE, with no trigger to ever
 * convert. The plaque delivered a memorial and nothing sold the app.
 *
 * Cheap to build because the schema already supported it — AppSale carries
 * tenantId, soldById and nullable Stripe columns, with a comment noting they are
 * "null for legacy/SEQ-vendor sales that never touched Stripe". The path was
 * removed from the code, not from the model.
 *
 * Granted to the GUARDIAN, not the memorial: getMemorialFeatures resolves a
 * memorial's tier by cascading from its guardians and deliberately ignores an
 * AppSale attached to the memorial itself, so attaching it there would do
 * nothing at all.
 */

export interface TrialGrant {
  granted: boolean
  reason?: 'no-trial-configured' | 'plan-not-found' | 'already-has-one'
}

export async function grantActivationTrial(
  tx: Prisma.TransactionClient,
  input: {
    guardianId: string
    tenantId:   string
    months:     number
    planCode:   string | null
  },
): Promise<TrialGrant> {
  if (!input.planCode || input.months <= 0) return { granted: false, reason: 'no-trial-configured' }

  const plan = await tx.subscription.findUnique({
    where:  { code: input.planCode },
    select: { id: true },
  })
  if (!plan) return { granted: false, reason: 'plan-not-found' }

  // One per guardian, ever. A partner that sells a family three plaques
  // must not hand out three overlapping trials, and extending an existing one
  // would quietly turn a twelve-month gift into an unbounded subscription.
  const existing = await tx.appSale.findFirst({
    where:  { appUserId: input.guardianId },
    select: { id: true },
  })
  if (existing) return { granted: false, reason: 'already-has-one' }

  const currentPeriodEnd = new Date()
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + input.months)

  await tx.appSale.create({
    data: {
      appUserId:      input.guardianId,
      subscriptionId: plan.id,
      // Attribution: which partner's activation produced this trial. It is the
      // only link between a B2B contract and the B2C revenue it seeds.
      tenantId:       input.tenantId,
      // Stripe never saw this. `trialing` is already one of the two statuses
      // getMemorialFeatures treats as live, so no entitlement code changes.
      status:         'trialing',
      currentPeriodEnd,
      // No job expires it: once currentPeriodEnd passes, getMemorialFeatures
      // stops seeing it as live and the guardian falls back to FREE on the very
      // next read. Only the D-30 warning needs a schedule.
    },
  })

  return { granted: true }
}

/**
 * Consumers whose finite non-Stripe access ends in 30 days, including trials,
 * direct Premium gifts and externally settled terms.
 *
 * The conversion trigger. With the trial scoped to the guardian, they hit no
 * quota wall during the twelve months — nothing in the product ever asks for
 * the subscription — so the end-of-trial warning is not a reminder, it is the
 * primary moment the app has to sell. Worth treating as product, not as
 * transactional mail.
 */
export async function findEndingTrials(
  daysAhead = 30,
  now = new Date(),
): Promise<{ appUserId: string; tenantId: string | null; currentPeriodEnd: Date }[]> {
  const { prisma } = await import('@genealogiq/db')

  const from = new Date(now); from.setDate(from.getDate() + daysAhead)
  const to   = new Date(from); to.setDate(to.getDate() + 1)

  const rows = await prisma.appSale.findMany({
    where: {
      status:               { in: ['trialing', 'active'] },
      stripeSubscriptionId: null,
      currentPeriodEnd:     { gte: from, lt: to },
    },
    select: { appUserId: true, tenantId: true, currentPeriodEnd: true },
  })

  return rows.flatMap((r) => (r.currentPeriodEnd ? [{ ...r, currentPeriodEnd: r.currentPeriodEnd }] : []))
}
