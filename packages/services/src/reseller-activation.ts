import 'server-only'
import type { Prisma } from '@genealogiq/db'
import { commitResellerCredit } from './credits'
import { grantPartnerConsumerPremium } from './partner-consumer-access'

export class ResellerActivationError extends Error {
  constructor(readonly reason: 'recipient' | 'activated' | 'unavailable') { super(reason) }
}

/** Called inside the same transaction as memorial creation and credit consumption. */
export async function claimResellerCode(tx: Prisma.TransactionClient, input: {
  genCodeId: string; tenantId: string; buyerId: string; currency: string
}) {
  const initial = await tx.genCode.findUnique({ where: { id: input.genCodeId }, select: { businessSale: { select: { customerId: true } } } })
  if (!initial?.businessSale) throw new ResellerActivationError('unavailable')
  // Use the same company -> code order as SEQ delivery and lot sales.
  await tx.$queryRaw`SELECT id FROM business_customers WHERE id = ${initial.businessSale.customerId} AND tenant_id = ${input.tenantId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM gencodes WHERE id = ${input.genCodeId} FOR UPDATE`
  const code = await tx.genCode.findUnique({ where: { id: input.genCodeId }, include: { businessSale: { include: { customer: true } } } })
  if (!code?.businessSale || code.tenantId !== input.tenantId || code.businessSale.tenantId !== input.tenantId) throw new ResellerActivationError('unavailable')
  if (code.status === 'ACTIVATED') throw new ResellerActivationError('activated')
  if (code.status !== 'SOLD' || code.appUserId || !code.soldAt) throw new ResellerActivationError('unavailable')
  if (code.soldToAppUserId) {
    if (code.soldToAppUserId !== input.buyerId) throw new ResellerActivationError('recipient')
    return // Optional SEQ delivery has already assigned credit and Premium.
  }
  if (!code.businessSale.customer.isActive) throw new ResellerActivationError('unavailable')
  await tx.$queryRaw`SELECT id FROM app_users WHERE id = ${input.buyerId} FOR UPDATE`
  const buyer = await tx.appUser.findUnique({ where: { id: input.buyerId } })
  if (!buyer?.isActive || buyer.role !== 'APP_USER' || !buyer.email
    || (buyer.tenantId && buyer.tenantId !== input.tenantId)) throw new ResellerActivationError('recipient')
  if (!buyer.tenantId) await tx.appUser.update({ where: { id: buyer.id }, data: { tenantId: input.tenantId } })
  const plan = await tx.partnerSubscription.findFirst({ where: { tenantId: input.tenantId, status: 'ACTIVE' }, select: { plan: { select: { committedReservationMonths: true } } } })
  const actorId = code.businessSale.soldById
  await commitResellerCredit(tx, { tenantId: input.tenantId, genCodeId: code.id, buyerId: buyer.id, actorId, months: plan?.plan.committedReservationMonths ?? 12 })
  await grantPartnerConsumerPremium(tx, { tenantId: input.tenantId, appUserId: buyer.id, actorId, requestId: `b2b-${code.id}`, currency: input.currency })
  await tx.genCode.update({ where: { id: code.id }, data: { soldToAppUserId: buyer.id } })
}
