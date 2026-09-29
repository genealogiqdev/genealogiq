import 'server-only'

import { prisma, type Prisma } from '@genealogiq/db'

/**
 * The credit ledger: the only thing allowed to move a partner's balance.
 *
 * Every rule the franchise model rests on lives here, and each one exists
 * because of a specific way the old model failed:
 *
 * - **Expiry is enforced on READ, not by a job.** The daily cron materialises
 *   EXPIRE rows for auditability, but it runs on Vercel Hobby, where a schedule
 *   is accurate to within an hour and can simply fail. A balance that depended
 *   on the job having run would let a partner activate with a dead credit. So
 *   every read filters `expiresAt`, and every write re-checks it under a lock.
 *
 * - **FEFO, first-expire-first-out.** Rollover expires in six months and the
 *   fresh allowance in twelve; spending the wrong one silently destroys value
 *   the partner paid for.
 *
 * - **COMMITTED grants are out of the pool.** A unit committed to a specific
 *   code and buyer is that family's, and cannot be spent on anyone else — which
 *   is the whole reason it survives its cycle expiring.
 *
 * - **Idempotency is a unique index, not a flag.** Callers name the operation;
 *   a replay loses to the constraint instead of moving the balance twice.
 */

export class InsufficientCreditsError extends Error {
  constructor(readonly tenantId: string) {
    super(`Tenant ${tenantId} has no credit available`)
    this.name = 'InsufficientCreditsError'
  }
}

export interface CreditBalance {
  total:     number
  /** Available to spend on anything — excludes units committed to a specific code. */
  general:   number
  committed: number
  /** The soonest a live grant expires, or null when nothing is dated. */
  nextExpiry: Date | null
}

/**
 * What a partner can still activate.
 *
 * Expiry is applied here rather than trusted from `status`, so a grant whose
 * date has passed is invisible the instant it does — with or without the job
 * having marked it.
 */
export async function getCreditBalance(tenantId: string): Promise<CreditBalance> {
  const now = new Date()
  const grants = await prisma.creditGrant.findMany({
    where: {
      tenantId,
      status:       'ACTIVE',
      remainingQty: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { remainingQty: true, expiresAt: true, source: true },
  })

  let general = 0
  let committed = 0
  let nextExpiry: Date | null = null

  for (const g of grants) {
    if (g.source === 'COMMITTED') committed += g.remainingQty
    else general += g.remainingQty
    if (g.expiresAt && (!nextExpiry || g.expiresAt < nextExpiry)) nextExpiry = g.expiresAt
  }

  return { total: general + committed, general, committed, nextExpiry }
}

/** Whether a code may be activated right now — the replacement for isSaleWindowOpen. */
export async function canActivate(tenantId: string, genCodeId: string): Promise<boolean> {
  const reservation = await liveReservationFor(genCodeId)
  if (reservation) return true

  const contract = await prisma.partnerSubscription.findFirst({
    where:  { tenantId, status: 'ACTIVE' },
    select: { id: true },
  })
  if (contract) {
    const balance = await getCreditBalance(tenantId)
    return balance.general > 0
  }

  // A package is a standalone first-purchase product. Its TOPUP grant remains
  // usable for its own 12-month term even when the partner has never held (or
  // no longer holds) an annual contract. Annual and rollover grants stay
  // frozen without that contract.
  const packageCredit = await prisma.creditGrant.findFirst({
    where: {
      tenantId,
      source: 'TOPUP',
      status: 'ACTIVE',
      remainingQty: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  })
  return !!packageCredit
}

async function liveReservationFor(genCodeId: string) {
  const now = new Date()
  return prisma.creditReservation.findFirst({
    where: {
      genCodeId,
      status: 'HELD',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, grantId: true, tenantId: true },
  })
}

/**
 * Grants a cycle's annual allowance.
 *
 * Idempotent on the cycle: opening the same cycle twice — which a replayed
 * webhook will try — cannot grant the allowance twice.
 */
export async function grantCycleCredits(input: {
  tenantId:       string
  subscriptionId: string
  cycleId:        string
  quantity:       number
  expiresAt:      Date
  source?:        'ANNUAL' | 'ROLLOVER' | 'FOUNDER_ROLLOVER' | 'BONUS' | 'TOPUP'
  rolloverGeneration?: number
  tx?:            Prisma.TransactionClient
}): Promise<string | null> {
  const db = input.tx ?? prisma
  const source = input.source ?? 'ANNUAL'
  if (input.quantity <= 0) return null

  const key = `grant:${input.cycleId}:${source}`
  const existing = await db.creditTransaction.findUnique({
    where:  { idempotencyKey: key },
    select: { grantId: true },
  })
  if (existing) return existing.grantId

  const grant = await db.creditGrant.create({
    data: {
      tenantId:           input.tenantId,
      subscriptionId:     input.subscriptionId,
      cycleId:            input.cycleId,
      source,
      grantedQty:         input.quantity,
      remainingQty:       input.quantity,
      expiresAt:          input.expiresAt,
      rolloverGeneration: input.rolloverGeneration ?? 0,
    },
    select: { id: true },
  })

  await db.creditTransaction.create({
    data: {
      grantId:        grant.id,
      tenantId:       input.tenantId,
      type:           'GRANT',
      quantity:       input.quantity,
      balanceAfter:   input.quantity,
      idempotencyKey: key,
    },
  })

  return grant.id
}

/**
 * Holds a credit for a code the partner has just sold.
 *
 * `committed` is the founder's decision made concrete. A sale through the
 * platform captures a real buyer, so its unit MOVES out of the annual grant
 * into a COMMITTED grant with its own expiry, dated from the sale — the family
 * keeps the plaque even if the partner walks away. A manual write-off records
 * only a typed name, which is trivially forged, so its reservation stays against
 * the origin grant and dies with it.
 *
 * Moving the unit rather than flagging it keeps one rule true everywhere:
 * credits are only ever spent from a live grant. Nothing has to learn to consume
 * against an expired one.
 */
export async function reserveCreditForSale(input: {
  tenantId:        string
  genCodeId:       string
  committed:       boolean
  buyerId?:        string | null
  committedMonths: number
  actorId?:        string | null
}): Promise<void> {
  const key = `reserve:${input.genCodeId}`

  await prisma.$transaction(async (tx) => {
    const already = await tx.creditReservation.findUnique({
      where:  { idempotencyKey: key },
      select: { id: true, status: true },
    })
    if (already?.status === 'HELD') return

    const activeContract = await tx.partnerSubscription.findFirst({
      where: { tenantId: input.tenantId, status: 'ACTIVE' },
      select: { id: true },
    })
    const source = await lockNextGrant(tx, input.tenantId, !activeContract)
    if (!source) throw new InsufficientCreditsError(input.tenantId)

    await debit(tx, source, 1, {
      type:           'RESERVE',
      tenantId:       input.tenantId,
      genCodeId:      input.genCodeId,
      idempotencyKey: `${key}:debit`,
      actorId:        input.actorId,
    })

    let backingGrantId = source.id
    let expiresAt      = source.expiresAt

    if (input.committed) {
      const committedUntil = new Date()
      committedUntil.setMonth(committedUntil.getMonth() + input.committedMonths)

      const committedGrant = await tx.creditGrant.create({
        data: {
          tenantId:     input.tenantId,
          source:       'COMMITTED',
          grantedQty:   1,
          remainingQty: 1,
          expiresAt:    committedUntil,
          genCodeId:    input.genCodeId,
          buyerId:      input.buyerId ?? null,
          // A committed unit came from somewhere that had already rolled or not;
          // either way it must never roll again on its own.
          rolloverGeneration: 1,
          reason:       'Committed on platform sale',
        },
        select: { id: true, expiresAt: true },
      })
      await tx.creditTransaction.create({
        data: {
          grantId:        committedGrant.id,
          tenantId:       input.tenantId,
          type:           'GRANT',
          quantity:       1,
          balanceAfter:   1,
          genCodeId:      input.genCodeId,
          idempotencyKey: `${key}:commit`,
          actorId:        input.actorId ?? null,
        },
      })
      backingGrantId = committedGrant.id
      expiresAt      = committedGrant.expiresAt
    }

    await tx.creditReservation.upsert({
      where:  { idempotencyKey: key },
      create: {
        tenantId:       input.tenantId,
        grantId:        backingGrantId,
        genCodeId:      input.genCodeId,
        status:         'HELD',
        expiresAt,
        idempotencyKey: key,
      },
      update: { grantId: backingGrantId, status: 'HELD', expiresAt },
    })
  })
}

/**
 * Undoes a write-off.
 *
 * The unit goes back to the grant it came from ONLY if that grant is still
 * live. Undoing a sale after the cycle died must not resurrect credit — that
 * would make "undo" a way around expiry.
 */
export async function releaseReservation(genCodeId: string, actorId?: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const reservation = await tx.creditReservation.findUnique({
      where:  { genCodeId },
      select: { id: true, status: true, grantId: true, tenantId: true },
    })
    if (!reservation || reservation.status !== 'HELD') return

    const grant = await tx.creditGrant.findUnique({
      where:  { id: reservation.grantId },
      select: { id: true, source: true, remainingQty: true, expiresAt: true, status: true },
    })

    const stillLive = grant
      && grant.status === 'ACTIVE'
      && (!grant.expiresAt || grant.expiresAt > new Date())

    if (grant && stillLive) {
      // A COMMITTED grant exists only for this code, so releasing it retires the
      // grant rather than handing a floating unit back to the pool.
      const isCommitted = grant.source === 'COMMITTED'
      const balanceAfter = isCommitted ? 0 : grant.remainingQty + 1

      await tx.creditGrant.update({
        where: { id: grant.id },
        data:  isCommitted
          ? { remainingQty: 0, status: 'EXPIRED' }
          : { remainingQty: { increment: 1 } },
      })
      await tx.creditTransaction.create({
        data: {
          grantId:        grant.id,
          tenantId:       reservation.tenantId,
          type:           'RELEASE',
          quantity:       1,
          balanceAfter,
          genCodeId,
          reservationId:  reservation.id,
          idempotencyKey: `release:${genCodeId}:${reservation.id}`,
          actorId:        actorId ?? null,
        },
      })
    }

    await tx.creditReservation.update({
      where: { id: reservation.id },
      data:  { status: 'RELEASED' },
    })
  })
}

/**
 * Spends a credit for an activation, inside the caller's transaction.
 *
 * Takes the reservation's grant when the code was sold, and falls back to FEFO
 * when it was activated straight out of stock — a code can legitimately be
 * activated without ever being written off.
 *
 * Runs in the SAME transaction that creates the memorial, so a family can never
 * end up with a half-created memorial and a spent credit, or the reverse.
 */
export async function consumeCreditForActivation(
  tx:        Prisma.TransactionClient,
  input:     { tenantId: string; genCodeId: string },
): Promise<string> {
  const key = `consume:${input.genCodeId}`

  const already = await tx.creditTransaction.findUnique({
    where:  { idempotencyKey: key },
    select: { id: true },
  })
  if (already) return already.id

  const reservation = await tx.creditReservation.findUnique({
    where:  { genCodeId: input.genCodeId },
    select: { id: true, status: true, grantId: true, expiresAt: true },
  })

  let grant: LockedGrant | null = null
  let reservationId: string | null = null

  if (reservation && reservation.status === 'HELD') {
    const live = !reservation.expiresAt || reservation.expiresAt > new Date()
    if (live) {
      grant = await lockGrantById(tx, reservation.grantId)
      reservationId = reservation.id
    }
  }
  if (!grant) {
    const activeContract = await tx.partnerSubscription.findFirst({
      where: { tenantId: input.tenantId, status: 'ACTIVE' },
      select: { id: true },
    })
    // Without an annual contract, only standalone package credits may fund an
    // activation. This prevents a package purchase from accidentally thawing
    // expired-contract ANNUAL or ROLLOVER stock through FEFO.
    grant = await lockNextGrant(tx, input.tenantId, !activeContract)
  }
  if (!grant) throw new InsufficientCreditsError(input.tenantId)

  const transaction = await debit(tx, grant, 1, {
    type:           'CONSUME',
    tenantId:       input.tenantId,
    genCodeId:      input.genCodeId,
    reservationId,
    idempotencyKey: key,
  })

  if (reservationId) {
    await tx.creditReservation.update({ where: { id: reservationId }, data: { status: 'CONSUMED' } })
  }

  return transaction.id
}

interface LockedGrant {
  id:           string
  remainingQty: number
  expiresAt:    Date | null
}

/**
 * The FEFO pick, under a row lock.
 *
 * `FOR UPDATE SKIP LOCKED` rather than a plain lock: two activations racing for
 * the last unit should not queue behind each other only for the loser to find
 * the balance gone. Skipping lets the loser look at the next grant, and it
 * reaches InsufficientCredits honestly when there is none.
 *
 * COMMITTED grants are excluded — they belong to one code and are reachable only
 * through their reservation.
 */
async function lockNextGrant(
  tx: Prisma.TransactionClient,
  tenantId: string,
  topupOnly = false,
): Promise<LockedGrant | null> {
  const rows = await tx.$queryRaw<LockedGrant[]>`
    SELECT id, remaining_qty AS "remainingQty", expires_at AS "expiresAt"
    FROM credit_grants
    WHERE tenant_id = ${tenantId}
      AND status = 'ACTIVE'
      AND remaining_qty > 0
      AND source <> 'COMMITTED'
      AND (${topupOnly} = FALSE OR source = 'TOPUP')
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY expires_at ASC NULLS LAST, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `
  return rows[0] ?? null
}

async function lockGrantById(tx: Prisma.TransactionClient, grantId: string): Promise<LockedGrant | null> {
  const rows = await tx.$queryRaw<LockedGrant[]>`
    SELECT id, remaining_qty AS "remainingQty", expires_at AS "expiresAt"
    FROM credit_grants
    WHERE id = ${grantId}
      AND status = 'ACTIVE'
      AND remaining_qty > 0
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1
    FOR UPDATE
  `
  return rows[0] ?? null
}

async function debit(
  tx:    Prisma.TransactionClient,
  grant: LockedGrant,
  qty:   number,
  meta:  {
    type: 'RESERVE' | 'CONSUME'
    tenantId: string
    genCodeId?: string | null
    reservationId?: string | null
    idempotencyKey: string
    actorId?: string | null
  },
) {
  const balanceAfter = grant.remainingQty - qty
  if (balanceAfter < 0) throw new InsufficientCreditsError(meta.tenantId)

  await tx.creditGrant.update({
    where: { id: grant.id },
    data:  {
      remainingQty: balanceAfter,
      // Exhausted rather than expired: the difference matters when someone asks
      // later why a grant stopped paying.
      ...(balanceAfter === 0 ? { status: 'EXHAUSTED' as const } : {}),
    },
  })

  return tx.creditTransaction.create({
    data: {
      grantId:        grant.id,
      tenantId:       meta.tenantId,
      type:           meta.type,
      quantity:       qty,
      balanceAfter,
      genCodeId:      meta.genCodeId ?? null,
      reservationId:  meta.reservationId ?? null,
      idempotencyKey: meta.idempotencyKey,
      actorId:        meta.actorId ?? null,
    },
    select: { id: true },
  })
}

/**
 * Materialises EXPIRE rows for grants whose date has passed.
 *
 * Bookkeeping, not enforcement: reads already ignore an expired grant, so a late
 * or failed run cannot let anyone spend one. What this buys is an auditable
 * ledger — a balance that dropped with no transaction explaining it is exactly
 * the sort of gap that makes a razão worthless.
 */
export async function expireDueGrants(now = new Date()): Promise<number> {
  const due = await prisma.creditGrant.findMany({
    where:  { status: 'ACTIVE', remainingQty: { gt: 0 }, expiresAt: { lte: now } },
    select: { id: true, tenantId: true, remainingQty: true },
  })

  let expired = 0
  for (const grant of due) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.creditGrant.update({
          where: { id: grant.id },
          data:  { remainingQty: 0, status: 'EXPIRED' },
        })
        await tx.creditTransaction.create({
          data: {
            grantId:        grant.id,
            tenantId:       grant.tenantId,
            type:           'EXPIRE',
            quantity:       grant.remainingQty,
            balanceAfter:   0,
            idempotencyKey: `expire:${grant.id}`,
            reason:         'Grant reached its expiry date',
          },
        })
        await tx.creditReservation.updateMany({
          where: { grantId: grant.id, status: 'HELD' },
          data:  { status: 'EXPIRED' },
        })
      })
      expired++
    } catch (err) {
      // A duplicate idempotency key means another run already expired it.
      if ((err as { code?: string }).code !== 'P2002') throw err
    }
  }
  return expired
}
