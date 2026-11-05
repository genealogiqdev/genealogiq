import 'server-only'
import type { Prisma } from '@genealogiq/db'
import { commitResellerCredit } from '@genealogiq/services/credits'
import { grantPartnerConsumerPremium } from '@genealogiq/services/partner-consumer-access'
import { enqueueEmail, notificationUrl } from '@genealogiq/services/email-outbox'
import { hashToken } from '@genealogiq/core'
import { BusinessSaleError } from './business-gencode-sale'
import type { BusinessRecipientInput } from '@/schemas/business-customer.schema'

export async function assignBusinessGenCode(tx: Prisma.TransactionClient, input: BusinessRecipientInput & {
  tenantId: string; businessCustomerId: string; actorId: string; token: string; currency: string
}) {
  await tx.$queryRaw`SELECT id FROM business_customers WHERE id = ${input.businessCustomerId} AND tenant_id = ${input.tenantId} FOR UPDATE`
  const business = await tx.businessCustomer.findUnique({ where: { id: input.businessCustomerId, tenantId: input.tenantId } })
  if (!business) throw new BusinessSaleError('notFound')
  await tx.$queryRaw`SELECT id FROM gencodes WHERE gen_code = ${input.genCode} AND tenant_id = ${input.tenantId} FOR UPDATE`
  const code = await tx.genCode.findFirst({ where: { genCode: input.genCode, tenantId: input.tenantId,
    businessSale: { customerId: business.id, tenantId: input.tenantId } }, include: { soldToAppUser: true } })
  if (!code || !code.soldAt) throw new BusinessSaleError('stockUnavailable')
  if (code.soldToAppUserId) {
    if (code.soldToAppUser?.email !== input.email) throw new BusinessSaleError('requestConflict')
    return { genCode: code.genCode, emailId: null, consumer: code.soldToAppUser!, needsOnboarding: false }
  }
  if (!business.isActive) throw new BusinessSaleError('inactive')
  if (code.status !== 'SOLD' || code.appUserId) throw new BusinessSaleError('stockUnavailable')
  let consumer = await tx.appUser.findUnique({ where: { email: input.email } })
  if (consumer && (consumer.tenantId !== input.tenantId || consumer.role !== 'APP_USER' || !consumer.isActive)) throw new BusinessSaleError('recipientUnavailable')
  if (!consumer) consumer = await tx.appUser.create({ data: { firstName: input.firstName, lastName: input.lastName,
    email: input.email, tenantId: input.tenantId, role: 'APP_USER', isActive: true,
  } })
  const plan = await tx.partnerSubscription.findFirst({ where: { tenantId: input.tenantId, status: 'ACTIVE' },
    select: { plan: { select: { committedReservationMonths: true } } } })
  await commitResellerCredit(tx, { tenantId: input.tenantId, genCodeId: code.id, buyerId: consumer.id,
    actorId: input.actorId, months: plan?.plan.committedReservationMonths ?? 12 })
  await grantPartnerConsumerPremium(tx, { tenantId: input.tenantId, appUserId: consumer.id, actorId: input.actorId,
    requestId: `b2b-${code.id}`, currency: input.currency })
  await tx.genCode.update({ where: { id: code.id }, data: { soldToAppUserId: consumer.id } })
  const needsOnboarding = !consumer.password
  if (needsOnboarding) await tx.passwordResetToken.create({ data: { token: hashToken(input.token), appUserId: consumer.id,
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) } })
  const emailId = `b2b-delivery:${code.id}:${consumer.id}`
  await enqueueEmail(tx, { id: emailId, recipient: consumer.email!,
    context: { type: 'gencode-sale', appUserId: consumer.id, genCode: code.genCode, soldAt: code.soldAt.toISOString() },
    message: { subject: 'Seu GenCode está disponível', name: consumer.firstName,
      paragraphs: [`O GenCode ${code.genCode} foi reservado para você.`],
      action: { label: 'Acessar GenCode', url: notificationUrl('app', `/qr/${encodeURIComponent(code.genCode)}`) },
    },
  })
  return { genCode: code.genCode, emailId, consumer, needsOnboarding }
}
