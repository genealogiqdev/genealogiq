'use server'

import { randomBytes, randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { Prisma } from '@genealogiq/db'
import { prisma } from '@/lib/prisma'
import { canActivate, reserveCreditForSale, releaseReservation, InsufficientCreditsError } from '@genealogiq/services/credits'
import { verifyTenantSession } from '@/lib/dal'
import { sendAppWelcomeEmail } from '@/lib/email'
import { deliverEmail, enqueueEmail, notificationUrl } from '@genealogiq/services/email-outbox'
import { hashToken, done, fail, type ActionResult } from '@genealogiq/core'

const buyerSchema = z.string().trim().min(1, 'Buyer name is required.').max(200)
const valueSchema = z.number().finite().min(0).max(1_000_000)

// Everything needed to reach a buyer who isn't registered yet. firstName and
// lastName are required because AppUser requires them — nothing else is.
const buyerContactSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(100),
  lastName:  z.string().trim().min(1, 'Last name is required.').max(100),
  email:     z.string().trim().toLowerCase().email('A valid email is required.'),
})

function paths(genCode: string) {
  revalidatePath('/inventory/activations')
  revalidatePath(`/inventory/activations/${genCode}`)
}

/** Toggle the operator-set "printed" flag. */
/**
 * Refuses to write off a code the partner has no credit to back.
 *
 * Selling one would hand a family a plaque that fails the moment they scan it —
 * the worst possible place to discover the allowance ran out or the partner is
 * behind on an instalment. Cheaper to stop here.
 *
 * Deliberately NOT applied to undoGenCodeSale: undoing a write-off must keep
 * working whatever the balance says, or a mistake made just before a lapse
 * becomes permanent.
 */
async function noCreditFor(genCode: string, tenantId: string): Promise<boolean> {
  const row = await prisma.genCode.findFirst({
    where:  { genCode, tenantId },
    select: { id: true },
  })
  if (!row) return true
  return !(await canActivate(tenantId, row.id))
}

export async function markGenCodePrinted(genCode: string, printed: boolean): Promise<ActionResult> {
  const t = await getTranslations('Actions')
  const { customerId } = await verifyTenantSession()

  const lic = await prisma.genCode.findFirst({
    where:  { genCode, tenantId: customerId },
    select: { id: true },
  })
  if (!lic) return fail(t('gencode.notFound'))

  await prisma.genCode.update({
    where: { id: lic.id },
    data:  { printedAt: printed ? new Date() : null },
  })
  paths(genCode)
  return done()
}

/** Manual write-off ("baixa") for a sale made outside the platform. */
export async function sellGenCodeManually(
  genCode: string,
  input:   { buyerName: string; value?: number },
): Promise<ActionResult> {
  const t = await getTranslations('Actions')
  const { customerId, user } = await verifyTenantSession()

  const buyer = buyerSchema.safeParse(input.buyerName)
  if (!buyer.success) return fail(t('common.invalidData'))

  let soldValue: number | null = null
  if (input.value != null) {
    const v = valueSchema.safeParse(input.value)
    if (!v.success) return fail(t('gencode.invalidValue'))
    soldValue = v.data
  }

  if (await noCreditFor(genCode, customerId)) return fail(t('gencode.batchClosed'))

  // Atomic guard: only an AVAILABLE code can be sold — prevents double-selling.
  const res = await prisma.genCode.updateMany({
    where: { genCode, tenantId: customerId, status: 'AVAILABLE' },
    data:  {
      status:     'SOLD',
      soldAt:     new Date(),
      soldVia:    'MANUAL',
      soldById:   user.id,
      soldToName: buyer.data,
      soldValue,
    },
  })
  if (res.count === 0) return fail(t('gencode.notAvailable'))

  // A manual write-off records only a typed name, which is trivially forged, so
  // its credit stays against the grant it came from and dies with that grant.
  // Committing it would reopen the very hole the committed-reservation rule
  // closes: writing off the whole stock on paper the day before a cycle ends.
  const row = await prisma.genCode.findFirst({ where: { genCode, tenantId: customerId }, select: { id: true } })
  if (row) {
    try {
      await reserveCreditForSale({
        tenantId: customerId, genCodeId: row.id,
        committed: false, committedMonths: 0, actorId: user.id,
      })
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        await prisma.genCode.updateMany({
          where: { id: row.id },
          data:  { status: 'AVAILABLE', soldAt: null, soldVia: null, soldById: null, soldToName: null, soldValue: null },
        })
        return fail(t('gencode.batchClosed'))
      }
      throw e
    }
  }

  paths(genCode)
  return done(t('gencode.saleRecorded'))
}

/**
 * Send the code to a buyer by email, writing it off in the same step.
 *
 * The buyer does NOT have to be registered first: give a name and an email and
 * the consumer record is created here. That is the whole point — requiring a
 * full customer record up front made this path heavier than the manual
 * write-off for no benefit, since everything we need to reach the buyer is the
 * email itself.
 *
 * Emails are globally unique on AppUser (partial unique index), so an address
 * already belonging to ANOTHER tenant is rejected rather than silently
 * reassigned.
 */
export async function sellGenCodeViaPlatform(
  genCode: string,
  input:   { firstName: string; lastName: string; email: string; value?: number },
): Promise<ActionResult> {
  const t = await getTranslations('Actions')
  const { customerId, user } = await verifyTenantSession()

  const parsed = buyerContactSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)
  const { firstName, lastName, email } = parsed.data

  let soldValue: number | null = null
  if (input.value != null) {
    const v = valueSchema.safeParse(input.value)
    if (!v.success) return fail(t('gencode.invalidValue'))
    soldValue = v.data
  }

  if (await noCreditFor(genCode, customerId)) return fail(t('gencode.batchClosed'))

  const existing = await prisma.appUser.findUnique({
    where:  { email },
    select: { id: true, email: true, firstName: true, tenantId: true, password: true, role: true, isActive: true },
  })
  if (existing && existing.tenantId && existing.tenantId !== customerId) {
    return fail(t('gencode.emailOtherTenant'))
  }
  if (existing && (!existing.isActive || existing.role !== 'APP_USER')) {
    return fail(t('gencode.recipientUnavailable'))
  }

  // A buyer who already set a password can't be onboarded with the welcome
  // email (its link creates a password) — they get the code delivered instead.
  const needsOnboarding = !existing?.password
  const token = randomBytes(32).toString('hex')
  const soldAt = new Date()
  const emailId = `gencode-sale:${randomUUID()}`

  let consumer = existing
  try {
    await prisma.$transaction(async (tx) => {
      if (!consumer) {
        consumer = await tx.appUser.create({
          data:   { firstName, lastName, email, tenantId: customerId },
          select: { id: true, email: true, firstName: true, tenantId: true, password: true, role: true, isActive: true },
        })
      }

      const updated = await tx.genCode.updateMany({
        where: { genCode, tenantId: customerId, status: 'AVAILABLE' },
        data:  {
          status:          'SOLD',
          soldAt,
          soldVia:         'PLATFORM',
          soldById:        user.id,
          soldToAppUserId: consumer.id,
          soldValue,
        },
      })
      if (updated.count === 0) throw new Error('NOT_AVAILABLE')

      if (needsOnboarding) {
        await tx.passwordResetToken.create({
          data: {
            token:     hashToken(token),
            appUserId: consumer.id,
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          },
        })
      }
      // The public code receipt is durable; password-setting tokens stay out of the queue.
      await enqueueEmail(tx, {
        id: emailId, recipient: email,
        context: { type: 'gencode-sale', appUserId: consumer.id, genCode, soldAt: soldAt.toISOString() },
        message: {
          subject: 'Seu GenCode está disponível', name: consumer.firstName,
          paragraphs: [`O GenCode ${genCode} foi reservado para você. Acesse sua conta para ativá-lo.`],
          action: { label: 'Acessar GenCode', url: notificationUrl('app', `/qr/${encodeURIComponent(genCode)}`) },
        },
      })
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_AVAILABLE') {
      return fail(t('gencode.notAvailable'))
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return fail(t('gencode.saleFailed', { code: e.code }))
    }
    return fail(t('gencode.unexpectedError'))
  }

  // The buyer is identified and reachable, so the credit is committed to them:
  // it leaves the annual grant for one of its own, dated from the sale. That is
  // what lets the family activate even if the partner never renews.
  try {
    const plan = await prisma.partnerSubscription.findFirst({
      where:   { tenantId: customerId, status: 'ACTIVE' },
      select:  { plan: { select: { committedReservationMonths: true } } },
    })
    const soldRow = await prisma.genCode.findFirst({ where: { genCode, tenantId: customerId }, select: { id: true } })
    if (soldRow) {
      await reserveCreditForSale({
        tenantId:        customerId,
        genCodeId:       soldRow.id,
        committed:       true,
        buyerId:         consumer!.id,
        committedMonths: plan?.plan.committedReservationMonths ?? 12,
        actorId:         user.id,
      })
    }
  } catch (e) {
    // The sale is already written off and the buyer already exists; failing the
    // whole action here would leave the operator with a code they cannot re-sell.
    console.error('[seq] committed reservation failed', e)
  }

  let emailPending = await deliverEmail(emailId) !== 'sent'
  try {
    if (needsOnboarding) {
      // Deep-link the welcome email back to this physical code so the buyer lands
      // on /qr/<genCode> right after creating their password and signing in.
      await sendAppWelcomeEmail(email, token, firstName, `/qr/${genCode}`)
    }
  } catch {
    console.error('[seq] GenCode delivery pending', { genCode })
    emailPending = true
  }

  paths(genCode)
  return done(t(emailPending ? 'gencode.soldEmailPending' : 'gencode.soldViaPlatform'))
}

/** Reverse a write-off — only while still SOLD (not yet activated by the consumer). */
export async function undoGenCodeSale(genCode: string): Promise<ActionResult> {
  const t = await getTranslations('Actions')
  const { customerId } = await verifyTenantSession()

  const res = await prisma.genCode.updateMany({
    where: { genCode, tenantId: customerId, status: 'SOLD' },
    data:  {
      status:          'AVAILABLE',
      soldAt:          null,
      soldVia:         null,
      soldById:        null,
      soldToAppUserId: null,
      soldToName:      null,
      soldValue:       null,
    },
  })
  if (res.count === 0) return fail(t('gencode.notSold'))

  // Returns the unit to the grant it came from — but only if that grant is still
  // live. Undoing a write-off after the cycle died must not resurrect credit,
  // or "undo" becomes a way around expiry.
  const undone = await prisma.genCode.findFirst({ where: { genCode, tenantId: customerId }, select: { id: true } })
  if (undone) await releaseReservation(undone.id)

  paths(genCode)
  return done(t('gencode.saleUndone'))
}
