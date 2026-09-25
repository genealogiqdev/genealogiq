'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { Prisma } from '@genealogiq/db'
import { prisma } from '@/lib/prisma'
import { hashToken, done, fail, type ActionResult } from '@genealogiq/core'
import { deleteUnreferencedMediaUrls } from '@genealogiq/services/media-storage'
import { verifyAdmin } from '@/lib/dal'
import { sendWelcomeEmail } from '@/lib/email'
import { getUserSchema, type UserFormValues } from '@/schemas/user.schema'
import { identityTranslator } from '@/schemas/i18n'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAddressWrite(address: UserFormValues['address'], mode: 'create' | 'update'): any {
  if (!address) return undefined
  const hasData = Object.entries(address).some(([k, v]) => k !== 'country' && v)
  if (!hasData && !address.country) return undefined
  if (mode === 'create') return { create: address }
  return { upsert: { create: address, update: address } }
}

export async function createUser(data: UserFormValues): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  const validated = getUserSchema(identityTranslator).safeParse(data)
  if (!validated.success) return fail(t('common.invalidData'))

  const { address, birthDate, ...rest } = validated.data

  let token: string
  try {
    ;({ token } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          ...rest,
          birthDate:    birthDate ? new Date(birthDate) : null,
          password:     null,
          emailVerified: new Date(),
          address:      buildAddressWrite(address, 'create'),
        },
        select: { id: true },
      })
      const t = randomBytes(32).toString('hex')
      await tx.passwordResetToken.create({
        data: { token: hashToken(t), userId: user.id, expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) },
      })
      return { token: t }
    }))
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return fail(t('user.emailExists'))
    }
    throw e
  }

  await sendWelcomeEmail(rest.email, token)

  revalidatePath('/system/users')
  return done(t('user.created'))
}

export async function updateUser(id: string, data: UserFormValues): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  const validated = getUserSchema(identityTranslator).safeParse(data)
  if (!validated.success) return fail(t('common.invalidData'))

  const { address, birthDate, ...rest } = validated.data

  try {
    const existing = await prisma.user.findUnique({ where: { email: rest.email }, select: { id: true } })
    if (existing && existing.id !== id) return fail(t('user.emailExists'))

    await prisma.user.update({
      where: { id },
      data: {
        ...rest,
        birthDate: birthDate ? new Date(birthDate) : null,
        address:   buildAddressWrite(address, 'update'),
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return fail(t('user.notFound'))
    }
    throw e
  }

  revalidatePath('/system/users')
  return done(t('user.updated'))
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  const session = await verifyAdmin()
  const t = await getTranslations('Actions')

  if (session.user!.id === userId) return fail(t('user.cannotDeleteSelf'))

  try {
    const media = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true, cover_url: true },
    })
    await prisma.user.delete({ where: { id: userId } })
    await deleteUnreferencedMediaUrls([media?.avatarUrl, media?.cover_url])
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return fail(t('user.notFound'))
    }
    throw e
  }

  revalidatePath('/system/users')
  return done()
}

export async function toggleUserActive(userId: string): Promise<ActionResult> {
  const session = await verifyAdmin()
  const t = await getTranslations('Actions')

  if (session.user!.id === userId) return fail(t('user.cannotDeactivateSelf'))

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } })
  if (!user) return fail(t('user.notFound'))

  await prisma.user.update({ where: { id: userId }, data: { isActive: !user.isActive } })
  revalidatePath('/system/users')
  return done()
}

export async function resendWelcomeEmail(userId: string): Promise<ActionResult> {
  await verifyAdmin()
  const t = await getTranslations('Actions')

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, password: true } })
  if (!user) return fail(t('user.notFound'))
  if (user.password) return fail(t('user.passwordAlreadySet'))

  await prisma.passwordResetToken.deleteMany({ where: { userId } })

  const token = randomBytes(32).toString('hex')
  await prisma.passwordResetToken.create({
    data: { token: hashToken(token), userId, expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) },
  })

  await sendWelcomeEmail(user.email, token)
  return done()
}
