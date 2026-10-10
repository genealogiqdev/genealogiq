'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { Prisma } from '@genealogiq/db'
import { hashToken, done, fail, type ActionResult } from '@genealogiq/core'
import { prisma } from '@/lib/prisma'
import { verifyTenantSession } from '@/lib/dal'
import { sendAppWelcomeEmail } from '@/lib/email'
import { getAppUserSchema, type AppUserFormValues } from '@/schemas/app-user.schema'
import { getDeceasedSchema, type DeceasedFormValues } from '@/schemas/deceased.schema'
import { identityTranslator } from '@/schemas/i18n'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAddressCreate(address: AppUserFormValues['address']): any {
  if (!address) return undefined
  const hasData = Object.entries(address).some(([k, v]) => k !== 'country' && v)
  if (!hasData && !address.country) return undefined
  return { create: address }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAddressWrite(address: AppUserFormValues['address']): any {
  if (!address) return undefined
  const hasData = Object.entries(address).some(([k, v]) => k !== 'country' && v)
  if (!hasData && !address.country) return undefined
  return { upsert: { create: address, update: address } }
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null
}

export async function createCustomer(
  appUserData: AppUserFormValues,
): Promise<ActionResult> {
  const { customerId } = await verifyTenantSession()
  const t = await getTranslations('Actions')

  const validated = getAppUserSchema(identityTranslator).safeParse(appUserData)
  if (!validated.success) return fail(t('common.invalidData'))

  const { address, birthDate, categoryId, ...rest } = validated.data
  const token = randomBytes(32).toString('hex')

  try {
    await prisma.$transaction(async (tx) => {
      const customer = await tx.appUser.create({
        data: {
          ...rest,
          birthDate: toDate(birthDate),
          tenant:    { connect: { id: customerId } },
          category:  categoryId ? { connect: { id: categoryId } } : undefined,
          address:   buildAddressCreate(address),
        },
      })
      if (rest.isActive) await tx.passwordResetToken.create({
        data: { token: hashToken(token), appUserId: customer.id, expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) },
      })
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return fail(t('customer.emailExists'))
    }
    throw e
  }

  revalidatePath('/customers')
  if (rest.isActive) {
    try { await sendAppWelcomeEmail(rest.email, token, rest.firstName) }
    catch { return done(t('customer.createdEmailPending')) }
  }
  return done(t('customer.created'))
}

export async function createCustomerWithDeceased(
  appUserData: AppUserFormValues,
  deceasedData: DeceasedFormValues,
): Promise<ActionResult> {
  const { customerId } = await verifyTenantSession()
  const t = await getTranslations('Actions')

  const validatedUser = getAppUserSchema(identityTranslator).safeParse(appUserData)
  if (!validatedUser.success) return fail(t('common.invalidData'))

  const validatedDeceased = getDeceasedSchema(identityTranslator).safeParse(deceasedData)
  if (!validatedDeceased.success) return fail(t('common.invalidData'))

  const { address, birthDate, categoryId, ...userRest } = validatedUser.data
  const token = randomBytes(32).toString('hex')
  const { birthDate: dBirthDate, deathDate, burialDate, burialLatitude, burialLongitude, ...deceasedRest } = validatedDeceased.data

  try {
    await prisma.$transaction(async (tx) => {
      const appUser = await tx.appUser.create({
        data: {
          ...userRest,
          birthDate: toDate(birthDate),
          tenant:    { connect: { id: customerId } },
          category:  categoryId ? { connect: { id: categoryId } } : undefined,
          address:   buildAddressCreate(address),
        },
        select: { id: true },
      })

      const { deathCity,
              burialSite, burialZip, burialStreet, burialNumber, burialComplement,
              burialNeighborhood, burialCity, burialState, burialCountry, ...memoRest } = deceasedRest

      const memorial = await tx.appUser.create({
        data: {
          ...memoRest,
          role:       'APP_MEMO',
          birthDate:  toDate(dBirthDate),
          deathDate:  toDate(deathDate),
          deathPlace: (deathCity as string | null | undefined) ?? null,
          tenantId:   customerId,
        },
        select: { id: true },
      })

      await tx.appUserGuardian.create({
        data: { appUserId: memorial.id, guardianId: appUser.id },
      })

      if (burialLatitude != null && burialLongitude != null) {
        const address = [burialStreet, burialNumber, burialComplement].filter(Boolean).join(' ') || null
        await tx.geolocation.create({
          data: {
            userId:    memorial.id,
            placeName: (burialSite as string | null | undefined) || 'Burial site',
            lat:       burialLatitude as number,
            lon:       burialLongitude as number,
            date:      toDate(burialDate as string | null | undefined),
            zip:       (burialZip as string | null | undefined) ?? null,
            address,
            section:   (burialNeighborhood as string | null | undefined) ?? null,
            city:      (burialCity as string | null | undefined) ?? null,
            state:     (burialState as string | null | undefined) ?? null,
            country:   (burialCountry as string | null | undefined) ?? null,
          },
        })
      }
      if (userRest.isActive) await tx.passwordResetToken.create({
        data: { token: hashToken(token), appUserId: appUser.id, expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) },
      })
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return fail(t('common.duplicate'))
    }
    throw e
  }

  revalidatePath('/customers')
  if (userRest.isActive) {
    try { await sendAppWelcomeEmail(userRest.email, token, userRest.firstName) }
    catch { return done(t('customer.createdEmailPending')) }
  }
  return done(t('customer.created'))
}

export async function updateCustomer(id: string, data: AppUserFormValues): Promise<ActionResult> {
  const { customerId } = await verifyTenantSession()
  const t = await getTranslations('Actions')

  const validated = getAppUserSchema(identityTranslator).safeParse(data)
  if (!validated.success) return fail(t('common.invalidData'))

  const { address, birthDate, categoryId, ...rest } = validated.data

  try {
    await prisma.appUser.update({
      where: { id, tenantId: customerId },
      data: {
        ...rest,
        birthDate: toDate(birthDate),
        category:  categoryId ? { connect: { id: categoryId } } : { disconnect: true },
        address:   buildAddressWrite(address),
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
  const { customerId } = await verifyTenantSession()
  const t = await getTranslations('Actions')

  const saleCount = await prisma.appSale.count({ where: { appUserId: id } })
  if (saleCount > 0) return fail(t('customer.hasSales'))

  const soloGuardianships = await prisma.appUserGuardian.count({
    where: {
      guardianId: id,
      appUser: {
        role: 'APP_MEMO',
        guardedBy: { every: { guardianId: id } },
      },
    },
  })
  if (soloGuardianships > 0)
    return fail(t('customer.soleGuardian'))

  try {
    await prisma.$transaction(async (tx) => {
      await tx.appUserGuardian.deleteMany({
        where: { OR: [{ guardianId: id }, { appUserId: id }] },
      })
      await tx.appUser.delete({ where: { id, tenantId: customerId } })
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return fail(t('customer.notFound'))
      return fail(t('customer.deleteFailed', { code: e.code }))
    }
    return fail(t('customer.unexpectedError'))
  }

  revalidatePath('/customers')
  return done()
}

export async function resendCustomerEmail(id: string): Promise<ActionResult> {
  const { customerId } = await verifyTenantSession()
  const t = await getTranslations('Actions')

  const appUser = await prisma.appUser.findUnique({
    where:  { id, tenantId: customerId },
    select: { id: true, email: true, password: true, firstName: true, isActive: true },
  })
  if (!appUser) return fail(t('customer.notFound'))
  if (!appUser.email) return fail(t('customer.noEmail'))
  if (!appUser.isActive) return fail(t('customer.inactiveEmail'))
  if (appUser.password) return fail(t('customer.passwordAlreadySet'))

  await prisma.passwordResetToken.deleteMany({ where: { appUserId: id } })

  const token = randomBytes(32).toString('hex')
  await prisma.passwordResetToken.create({
    data: { token: hashToken(token), appUserId: id, expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) },
  })

  try { await sendAppWelcomeEmail(appUser.email, token, appUser.firstName) }
  catch { return fail(t('customer.emailPending')) }
  return done()
}

export async function toggleCustomerActive(id: string): Promise<ActionResult> {
  const { customerId } = await verifyTenantSession()
  const t = await getTranslations('Actions')

  const appUser = await prisma.appUser.findUnique({
    where:  { id, tenantId: customerId },
    select: { isActive: true },
  })
  if (!appUser) return fail(t('customer.notFound'))

  await prisma.appUser.update({ where: { id }, data: { isActive: !appUser.isActive } })
  revalidatePath('/customers')
  return done()
}
