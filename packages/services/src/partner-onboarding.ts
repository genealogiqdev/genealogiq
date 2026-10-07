import 'server-only'

import { generateGenCode } from '@genealogiq/core'
import type { Prisma } from '@genealogiq/db'
import { addBillingMonths } from './billing-dates'

/** Called inside the transaction that creates the tenant, never as a purchase. */
export async function grantInitialGenCodes(tx: Prisma.TransactionClient, input: {
  tenantId: string
  quantity: number
  createdById: string
  now?: Date
}): Promise<void> {
  if (!Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > 10_000) {
    throw new Error('Invalid initial GenCode quantity')
  }
  if (input.quantity === 0) return

  const reason = 'Initial GenCodes granted during BMS partner registration'
  const grant = await tx.creditGrant.create({
    data: {
      tenantId: input.tenantId,
      source: 'TOPUP',
      grantedQty: input.quantity,
      remainingQty: input.quantity,
      expiresAt: addBillingMonths(input.now ?? new Date(), 12),
      rolloverGeneration: 1,
      createdById: input.createdById,
      reason,
    },
    select: { id: true },
  })
  await tx.creditTransaction.create({
    data: {
      tenantId: input.tenantId, grantId: grant.id, type: 'GRANT',
      quantity: input.quantity, balanceAfter: input.quantity,
      idempotencyKey: `grant:registration:${input.tenantId}`,
      actorId: input.createdById, reason,
    },
  })
  await tx.genCode.createMany({
    data: Array.from({ length: input.quantity }, () => ({
      tenantId: input.tenantId, genCode: generateGenCode(),
    })),
  })
}
