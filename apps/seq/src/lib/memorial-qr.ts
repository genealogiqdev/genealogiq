import 'server-only'

import type { Prisma } from '@genealogiq/db'
import { consumeCreditForActivation } from '@genealogiq/services/credits'
import { getCustomerForTenant } from '@/queries/customers'

export class MemorialQrError extends Error {
  constructor(readonly reason: 'notFound' | 'premiumRequired' | 'limitReached' | 'stockUnavailable') {
    super(reason)
  }
}

/** The caller must commit this entire operation in one transaction. */
export async function issueCustomerMemorialQr(tx: Prisma.TransactionClient, input: {
  tenantId: string; customerId: string; profileId: string; actorId: string
}) {
  // Serialize issuance for the same profile, including different guardians.
  // Authorization is repeated after the lock using the same transaction.
  const profiles = await tx.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM app_users p
    WHERE p.id = ${input.profileId} AND p.role IN ('APP_MEMO', 'APP_PET')
      AND EXISTS (
        SELECT 1 FROM app_user_guardians g JOIN app_users c ON c.id = g.guardian_id
        WHERE g.app_user_id = p.id AND g.status = 'ACCEPTED'
          AND c.id = ${input.customerId} AND c.tenant_id = ${input.tenantId} AND c.role = 'APP_USER'
      )
    FOR UPDATE OF p
  `
  if (!profiles.length) throw new MemorialQrError('notFound')
  const customer = await getCustomerForTenant(input.customerId, input.tenantId, tx)
  const profile = customer?.guardiansOf.find(({ appUser }) => appUser.id === input.profileId)?.appUser
  if (!profile) throw new MemorialQrError('notFound')
  if (profile.qrAccess !== 'allowed') throw new MemorialQrError(profile.qrAccess)

  const existing = await tx.genCode.findUnique({ where: { appUserId: input.profileId }, select: { id: true } })
  if (!existing) {
    // Use this customer's unactivated purchase first. Never take a different
    // buyer's code, and never deduct AVAILABLE stock again for a sold unit.
    const codes = await tx.$queryRaw<{ id: string; status: string; soldAt: Date | null }[]>`
      SELECT id, status, sold_at AS "soldAt" FROM gencodes
      WHERE tenant_id = ${input.tenantId} AND app_user_id IS NULL
        AND (status = 'AVAILABLE' OR (status = 'SOLD' AND sold_to_app_user_id = ${input.customerId}))
      ORDER BY CASE WHEN status = 'SOLD' THEN 0 ELSE 1 END, created_at, id
      LIMIT 1 FOR UPDATE SKIP LOCKED
    `
    const code = codes[0]
    if (!code) throw new MemorialQrError('stockUnavailable')
    const creditTransactionId = await consumeCreditForActivation(tx, { tenantId: input.tenantId, genCodeId: code.id })
    const now = new Date()
    await tx.genCode.update({
      where: { id: code.id },
      data: {
        status: 'ACTIVATED', appUserId: input.profileId, activatedAt: now, creditTransactionId,
        soldAt: code.soldAt ?? now,
        ...(code.status === 'AVAILABLE' ? {
          soldVia: 'PLATFORM', soldById: input.actorId, soldToAppUserId: input.customerId,
        } : {}),
      },
    })
  }
  // Preserve an existing printed destination. Rendering and re-exporting are
  // retries of this identity, not new inventory operations.
  const qr = await tx.qrCode.upsert({
    where: { appUserId: input.profileId },
    create: { appUserId: input.profileId, url: profile.profileUrl },
    update: {},
    select: { url: true },
  })
  return { profileUrl: qr.url, issued: !existing }
}
