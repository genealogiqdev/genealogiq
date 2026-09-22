'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { Prisma } from '@genealogiq/db'
import { prisma } from '@/lib/prisma'
import { hashToken, done, fail, type ActionResult } from '@genealogiq/core'
import { verifyAdmin } from '@/lib/dal'
import { sendSequoiaWelcomeEmail } from '@/lib/email'
import {
  getCustomerSchema,
  getCustomerCreateSchema,
  type CustomerFormValues,
  type CustomerCreateFormValues,
} from '@/schemas/customer.schema'
import { identityTranslator } from '@/schemas/i18n'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAddressWrite(address: CustomerFormValues['address'], mode: 'create' | 'update'): any {
  if (!address) return undefined
  const hasData = Object.entries(address).some(([k, v]) => k !== 'country' && v)
  if (!hasData && !address.country) return undefined
  return mode === 'create'
    ? { create: address }
    : { upsert: { create: address, update: address } }
}

export async function createCustomer(data: CustomerCreateFormValues): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  const validated = getCustomerCreateSchema(identityTranslator).safeParse(data)
  if (!validated.success) return fail(t('common.invalidData'))

  const { address, birthDate, owner, ...rest } = validated.data

  const dupTax = await prisma.tenant.findFirst({ where: { taxId: rest.taxId }, select: { id: true } })
  if (dupTax) return fail(t('customer.taxIdExists'))

  const existingOwner = await prisma.user.findUnique({ where: { email: owner.email }, select: { id: true } })
  if (existingOwner) return fail(t('customer.adminEmailInUse'))

  // The owner row is written here because this is where the wizard collects the
  // owner's details and there is nowhere else to keep them — but it is born
  // INACTIVE, with no reset token and no welcome email. Sequoia access is what
  // the first payment buys; provisionTenantAccess flips it when the money lands.
  // Registering a customer who never buys must not hand out a login.
  try {
    await prisma.$transaction(async (tx) => {
      const customer = await tx.tenant.create({
        data: {
          ...rest,
          birthDate: birthDate ? new Date(birthDate) : null,
          address:   buildAddressWrite(address, 'create'),
        },
        select: { id: true },
      })

      await tx.user.create({
        data: {
          firstName:     owner.firstName,
          lastName:      owner.lastName,
          email:         owner.email,
          role:          'OWNER',
          tenantId:      customer.id,
          password:      null,
          emailVerified: new Date(),
          isActive:      false,
        },
        select: { id: true },
      })
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return fail(t('common.duplicate'))
    }
    throw e
  }

  revalidatePath('/customers')
  return done(t('customer.createdAwaitingPayment'))
}

export async function updateCustomer(id: string, data: CustomerFormValues): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  const validated = getCustomerSchema(identityTranslator).safeParse(data)
  if (!validated.success) return fail(t('common.invalidData'))

  const { address, birthDate, ...rest } = validated.data

  const dupTax = await prisma.tenant.findFirst({ where: { taxId: rest.taxId, NOT: { id } }, select: { id: true } })
  if (dupTax) return fail(t('customer.taxIdExists'))

  try {
    await prisma.tenant.update({
      where: { id },
      data: {
        ...rest,
        birthDate: birthDate ? new Date(birthDate) : null,
        address:   buildAddressWrite(address, 'update'),
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return fail(t('customer.notFound'))
    }
    throw e
  }

  revalidatePath('/customers')
  return done(t('customer.updated'))
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  // A Tenant cascade-deletes its APP-side memorials (AppUser), its subscription
  // rows (AppSale) and now its credit grants, so a back-office delete could
  // silently destroy paid, end-user-facing memorials provisioned by SEQ. Guard
  // every dependent explicitly — a Cascade FK doesn't raise P2003, so the catch
  // below would never stop it.
  const [salesCount, genCodeOrderCount, appUserCount, appSaleCount] = await Promise.all([
    prisma.partnerSubscription.count({ where: { tenantId: id } }),
    prisma.genCodeOrder.count({ where: { tenantId: id } }),
    prisma.appUser.count({ where: { tenantId: id } }),
    prisma.appSale.count({ where: { tenantId: id } }),
  ])
  if (salesCount > 0 || genCodeOrderCount > 0) {
    return fail(t('customer.hasSales'))
  }
  const appDataCount = appUserCount + appSaleCount
  if (appDataCount > 0) {
    return fail(t('customer.hasAppData', { count: appDataCount }))
  }

  try {
    await prisma.tenant.delete({ where: { id } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return fail(t('customer.notFound'))
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return fail(t('customer.hasDependents'))
    }
    throw e
  }

  revalidatePath('/customers')
  return done()
}

export async function resendCustomerEmail(tenantId: string): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  const owner = await prisma.user.findFirst({
    where:  { tenantId, role: 'OWNER' },
    select: { id: true, email: true, password: true, isActive: true },
  })
  if (!owner) return fail(t('customer.noOwner'))
  if (owner.password) return fail(t('customer.passwordAlreadySet'))
  // Resending is for an owner who lost their link, not a back door around the
  // payment gate: an inactive owner has not paid for anything yet.
  if (!owner.isActive) return fail(t('customer.accessNotProvisioned'))

  await prisma.passwordResetToken.deleteMany({ where: { userId: owner.id } })

  const token = randomBytes(32).toString('hex')
  await prisma.passwordResetToken.create({
    data: { token: hashToken(token), userId: owner.id, expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) },
  })

  await sendSequoiaWelcomeEmail(owner.email, token)
  return done()
}

export async function toggleCustomerActive(id: string): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  const customer = await prisma.tenant.findUnique({ where: { id }, select: { isActive: true } })
  if (!customer) return fail(t('customer.notFound'))

  await prisma.tenant.update({ where: { id }, data: { isActive: !customer.isActive } })
  revalidatePath('/customers')
  return done()
}
