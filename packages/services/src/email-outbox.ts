import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { prisma, type Prisma } from '@genealogiq/db'
import { sendNotificationEmail, type NotificationEmail } from '@genealogiq/email'

type EmailDb = Pick<Prisma.TransactionClient, 'emailOutbox'>
export type EmailDeliveryState = 'sent' | 'pending' | 'canceled' | 'missing'
const LEASE_MS = 5 * 60_000
export type EmailContext = (
  | { type: 'partner-cycle'; subscriptionId: string; cycleId: string }
  | { type: 'partner'; tenantId: string }
  | { type: 'consumer-term'; appUserId: string; endAt: string }
  | { type: 'consumer-sale'; appUserId: string; saleId: string }
  | { type: 'gencode-sale'; appUserId: string; genCode: string; soldAt: string }
  | { type: 'app-user'; appUserId: string }
) & { supersededBy?: string }

/** Enqueue within the business transaction; a replay never overwrites a receipt. */
export async function enqueueEmail(db: EmailDb, input: {
  id: string
  recipient: string
  message: NotificationEmail
  context?: EmailContext
  expiresAt?: Date
}): Promise<string> {
  await db.emailOutbox.createMany({
    data: { ...input, message: input.message as unknown as Prisma.InputJsonObject },
    skipDuplicates: true,
  })
  return input.id
}

/** Acceptance by Resend is recorded separately from the completed business action. */
export async function deliverEmail(id: string, options: { force?: boolean; now?: Date } = {}): Promise<EmailDeliveryState> {
  const now = options.now ?? new Date()
  const claimToken = randomUUID()
  try {
    const row = await prisma.emailOutbox.findUnique({ where: { id } })
    if (!row) return 'missing'
    if (row.sentAt) return 'sent'
    if (row.canceledAt) return 'canceled'
    if (row.expiresAt && row.expiresAt <= now) {
      const canceled = await prisma.emailOutbox.updateMany({
        where: { id, sentAt: null, canceledAt: null, OR: [{ processingUntil: null }, { processingUntil: { lte: now } }] },
        data: { canceledAt: now, lastError: 'expired' },
      })
      return canceled.count ? 'canceled' : 'pending'
    }
    const claim = await prisma.emailOutbox.updateMany({
      where: {
        id, sentAt: null, canceledAt: null,
        ...(!options.force && { availableAt: { lte: now } }),
        OR: [{ processingUntil: null }, { processingUntil: { lte: now } }],
      },
      data: { processingUntil: new Date(now.getTime() + LEASE_MS), claimToken, attempts: { increment: 1 } },
    })
    if (!claim.count) return 'pending'

    try {
      if (!await isCurrentRecipient(row.recipient, row.context as EmailContext | null)) {
        await prisma.emailOutbox.updateMany({
          where: { id, claimToken, sentAt: null },
          data: { canceledAt: now, processingUntil: null, claimToken: null, lastError: 'superseded' },
        })
        return 'canceled'
      }
      // Stable across workers/retries, including a crash after provider acceptance.
      // Resend's idempotency window is 24h; our sentAt record has no expiry.
      const key = `genealogiq/${createHash('sha256').update(id).digest('hex')}`
      await sendNotificationEmail(row.recipient, row.message as unknown as NotificationEmail, key)
      const recorded = await prisma.emailOutbox.updateMany({
        where: { id, claimToken, sentAt: null },
        data: { sentAt: new Date(), processingUntil: null, claimToken: null, lastError: null },
      })
      return recorded.count ? 'sent' : 'pending'
    } catch {
      // Neither addresses, message bodies nor raw provider/transport errors go to logs.
      await prisma.emailOutbox.updateMany({
        where: { id, claimToken, sentAt: null },
        data: {
          processingUntil: null, claimToken: null, lastError: 'delivery-failed',
          availableAt: new Date(now.getTime() + Math.min(60, 2 ** Math.min(row.attempts, 6)) * 60_000),
        },
      })
      console.error('[email-outbox] notification pending', { id })
      return 'pending'
    }
  } catch {
    console.error('[email-outbox] delivery could not be recorded', { id })
    return 'pending'
  }
}

async function isCurrentRecipient(recipient: string, context: EmailContext | null): Promise<boolean> {
  if (!context) return true
  if (context.supersededBy && await prisma.emailOutbox.findUnique({
    where: { id: context.supersededBy }, select: { id: true },
  })) return false
  if (context.type === 'partner') {
    const tenant = await prisma.tenant.findUnique({ where: { id: context.tenantId }, select: { email: true, isActive: true } })
    return !!tenant?.isActive && tenant.email === recipient
  }
  if (context.type === 'partner-cycle') {
    const contract = await prisma.partnerSubscription.findUnique({
      where: { id: context.subscriptionId }, select: { currentCycleId: true, status: true, tenant: { select: { email: true, isActive: true } } },
    })
    return !!contract && contract.currentCycleId === context.cycleId && contract.status !== 'CANCELLED'
      && contract.tenant.isActive && contract.tenant.email === recipient
  }
  const user = await prisma.appUser.findUnique({
    where: { id: context.appUserId }, select: { email: true, isActive: true, role: true },
  })
  if (!user || user.email !== recipient || !user.isActive || user.role !== 'APP_USER') return false
  if (context.type === 'gencode-sale') {
    return !!await prisma.genCode.findFirst({
      where: {
        genCode: context.genCode, soldToAppUserId: context.appUserId,
        soldAt: new Date(context.soldAt), soldVia: 'PLATFORM', status: { in: ['SOLD', 'ACTIVATED'] },
      }, select: { id: true },
    })
  }
  if (context.type === 'consumer-sale') {
    return !!await prisma.appSale.findFirst({
      where: { id: context.saleId, appUserId: context.appUserId, status: { in: ['active', 'trialing'] } }, select: { id: true },
    })
  }
  if (context.type === 'consumer-term') {
    const current = await prisma.appSale.findFirst({
      where: { appUserId: context.appUserId, status: { in: ['active', 'trialing'] } },
      orderBy: { currentPeriodEnd: 'desc' }, select: { currentPeriodEnd: true },
    })
    return current?.currentPeriodEnd?.getTime() === new Date(context.endAt).getTime()
  }
  return true
}

/** Bounded retry batch used by the authenticated daily job. */
export async function runEmailOutbox(now = new Date()) {
  const rows = await prisma.emailOutbox.findMany({
    where: {
      sentAt: null, canceledAt: null, availableAt: { lte: now },
      OR: [{ processingUntil: null }, { processingUntil: { lte: now } }],
    },
    select: { id: true }, orderBy: [{ availableAt: 'asc' }, { id: 'asc' }], take: 100,
  })
  const result = { sent: 0, pending: 0, canceled: 0 }
  // Resend accounts have a small shared rate limit; avoid a burst of 100 sends.
  for (const row of rows) {
    const state = await deliverEmail(row.id, { now })
    if (state === 'sent') result.sent++
    else if (state === 'canceled') result.canceled++
    else result.pending++
  }
  return result
}

export function notificationUrl(app: 'app' | 'bms' | 'seq', path: string): string {
  const base = app === 'app' ? process.env.APP_URL : app === 'bms' ? process.env.BMS_URL : process.env.SEQUOIA_URL
  const fallback = app === 'app' ? 'https://genealogiq.com.br' : app === 'bms' ? 'https://bms.genealogiq.com.br' : 'https://sequoia.genealogiq.com.br'
  return `${(base || fallback).replace(/\/+$/, '')}${path}`
}
