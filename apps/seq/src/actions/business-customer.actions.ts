'use server'
import { revalidatePath } from 'next/cache'
import { getTranslations, getLocale } from 'next-intl/server'
import { randomBytes, randomUUID } from 'node:crypto'
import { currencyForLocale, hashToken } from '@genealogiq/core'
import { deliverEmail, enqueueEmail, notificationUrl } from '@genealogiq/services/email-outbox'
import { InsufficientCreditsError } from '@genealogiq/services/credits'
import { PartnerConsumerAccessError } from '@genealogiq/services/partner-consumer-access'
import { verifyCustomerAccessAdmin } from '@/lib/customer-access'
import { sendAppWelcomeEmail } from '@/lib/email'
import { assignBusinessGenCode } from '@/lib/business-gencode-recipient'
import { businessRecipientSchema, type BusinessRecipientInput } from '@/schemas/business-customer.schema'
import { Prisma } from '@genealogiq/db'
import { done, fail, type ActionResult } from '@genealogiq/core'
import { prisma } from '@/lib/prisma'
import { verifyTenantSession } from '@/lib/dal'
import { getBusinessCustomerSchema, businessSaleSchema, type BusinessCustomerFormValues, type BusinessSaleInput } from '@/schemas/business-customer.schema'
import { identityTranslator } from '@/schemas/i18n'
import { recordBusinessGenCodeSale, BusinessSaleError } from '@/lib/business-gencode-sale'

export async function saveBusinessCustomer(id: string | undefined, data: BusinessCustomerFormValues): Promise<ActionResult> {
  const { customerId } = await verifyTenantSession()
  const t = await getTranslations('BusinessCustomers')
  const parsed = getBusinessCustomerSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(t('invalidData'))
  const { address, ...values } = parsed.data
  try {
    if (id) {
      await prisma.businessCustomer.update({ where: { id, tenantId: customerId }, data: {
        ...values, address: address ? { upsert: { create: address, update: address } } : undefined,
      } })
    } else {
      await prisma.businessCustomer.create({ data: { ...values, tenant: { connect: { id: customerId } },
        address: address ? { create: address } : undefined,
      } })
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return fail(t('duplicate'))
      if (error.code === 'P2025') return fail(t('notFound'))
    }
    throw error
  }
  revalidatePath('/customers')
  if (id) revalidatePath(`/customers/business/${id}`)
  return done(t('saved'))
}
export async function sellBusinessGenCodes(id: string, input: BusinessSaleInput): Promise<ActionResult> {
  const { customerId, user } = await verifyTenantSession()
  const t = await getTranslations('BusinessCustomers')
  const parsed = businessSaleSchema.safeParse(input)
  if (!parsed.success) return fail(t('invalidSale'))
  try {
    await recordBusinessGenCodeSale(prisma, { ...parsed.data, customerId: id, tenantId: customerId, actorId: user.id })
  } catch (error) {
    if (error instanceof BusinessSaleError) return fail(t(error.reason))
    throw error
  }
  revalidatePath('/customers')
  revalidatePath(`/customers/business/${id}`)
  revalidatePath('/inventory/activations')
  revalidatePath('/dashboard')
  return done(t('saleRecorded'))
}

export async function deliverBusinessGenCode(id: string, input: BusinessRecipientInput): Promise<ActionResult> {
  const { customerId, user } = await verifyCustomerAccessAdmin()
  const t = await getTranslations('BusinessCustomers')
  const parsed = businessRecipientSchema.safeParse(input)
  if (!parsed.success) return fail(t('invalidData'))
  const token = randomBytes(32).toString('hex')
  const currency = currencyForLocale(await getLocale()).toUpperCase()
  let result: Awaited<ReturnType<typeof assignBusinessGenCode>>
  try {
    result = await prisma.$transaction(tx => assignBusinessGenCode(tx, { ...parsed.data,
      tenantId: customerId, businessCustomerId: id, actorId: user.id, token, currency,
    }), { timeout: 15000 })
  } catch (error) {
    if (error instanceof BusinessSaleError) return fail(t(error.reason))
    if (error instanceof InsufficientCreditsError) return fail(t('creditsUnavailable'))
    if (error instanceof PartnerConsumerAccessError) return fail(t('premiumUnavailable'))
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return fail(t('requestConflict'))
    throw error
  }
  let emailPending = false
  if (result.emailId) {
    try { emailPending = await deliverEmail(result.emailId) !== 'sent' } catch { emailPending = true }
  }
  if (result.needsOnboarding) {
    try { await sendAppWelcomeEmail(result.consumer.email!, token, result.consumer.firstName, `/qr/${result.genCode}`) }
    catch { emailPending = true }
  }
  revalidatePath('/customers')
  revalidatePath(`/customers/business/${id}`)
  revalidatePath('/inventory/activations')
  return done(t(emailPending ? 'deliveredEmailPending' : 'delivered'))
}

export async function resendBusinessGenCode(id: string, genCode: string): Promise<ActionResult> {
  const { customerId } = await verifyTenantSession()
  const t = await getTranslations('BusinessCustomers')
  const code = await prisma.genCode.findFirst({ where: { genCode, tenantId: customerId,
    businessSale: { customerId: id, tenantId: customerId } }, include: { soldToAppUser: true } })
  const consumer = code?.soldToAppUser
  if (!code?.soldAt || !consumer?.isActive || !consumer.email || consumer.tenantId !== customerId || consumer.role !== 'APP_USER') return fail(t('recipientUnavailable'))
  try {
    if (!consumer.password) {
      const token = randomBytes(32).toString('hex')
      await prisma.$transaction(async tx => {
        await tx.passwordResetToken.deleteMany({ where: { appUserId: consumer.id } })
        await tx.passwordResetToken.create({ data: { appUserId: consumer.id, token: hashToken(token), expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) } })
      })
      await sendAppWelcomeEmail(consumer.email, token, consumer.firstName, `/qr/${code.genCode}`)
    } else {
      const emailId = `b2b-redelivery:${code.id}:${randomUUID()}`
      await prisma.$transaction(tx => enqueueEmail(tx, { id: emailId, recipient: consumer.email!,
        context: { type: 'gencode-sale', appUserId: consumer.id, genCode: code.genCode, soldAt: code.soldAt!.toISOString() },
        message: { subject: 'Seu GenCode está disponível', name: consumer.firstName,
          paragraphs: [`Acesse o GenCode ${code.genCode} na sua conta.`],
          action: { label: 'Acessar GenCode', url: notificationUrl('app', `/qr/${encodeURIComponent(code.genCode)}`) },
        },
      }))
      if (await deliverEmail(emailId) !== 'sent') return fail(t('accessEmailPending'))
    }
  } catch { return fail(t('accessEmailPending')) }
  return done(t('accessEmailSent'))
}
