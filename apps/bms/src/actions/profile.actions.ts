'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { prisma } from '@/lib/prisma'
import { done, fail, isAllowedMediaUrl, type ActionResult } from '@genealogiq/core'
import {
  deleteUnreferencedMediaUrls,
  isAuthorizedMediaReference,
} from '@genealogiq/services/media-storage'
import { verifySession } from '@/lib/dal'
import { getProfileSchema, type ProfileFormValues } from '@/schemas/profile.schema'
import { identityTranslator } from '@/schemas/i18n'

// Self-profile edit: any logged-in user can update their OWN profile. Scope is
// clamped to session.user.id, so role/email/isActive/tenantId stay untouched
// here — those go through dedicated flows (admin actions or the dialogs in
// components/auth/).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAddressWrite(address: ProfileFormValues['address']): any {
  if (!address) return undefined
  const hasData = Object.entries(address).some(([k, v]) => k !== 'country' && v)
  if (!hasData && !address.country) return undefined
  return { upsert: { create: address, update: address } }
}

export async function updateProfile(data: ProfileFormValues): Promise<ActionResult> {
  const session = await verifySession()
  const t = await getTranslations('Actions')

  const validated = getProfileSchema(identityTranslator).safeParse(data)
  if (!validated.success) return fail(t('common.invalidData'))

  const { address, birthDate, ...rest } = validated.data

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...rest,
      birthDate: birthDate ? new Date(birthDate) : null,
      address:   buildAddressWrite(address),
    },
  })

  revalidatePath('/profile')
  return done(t('profile.updated'))
}

export async function updateAvatar(url: string): Promise<ActionResult> {
  const session = await verifySession()
  const t = await getTranslations('Actions')

  if (!isAllowedMediaUrl(url)) {
    return fail(t('profile.invalidAvatarUrl'))
  }

  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { avatarUrl: true },
  })
  if (
    url !== current?.avatarUrl &&
    !isAuthorizedMediaReference(
      url,
      [`users/${session.user.id}/avatar`],
      { allowLegacy: false },
    )
  ) {
    return fail(t('profile.invalidAvatarUrl'))
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data:  { avatarUrl: url },
  })
  if (current?.avatarUrl && current.avatarUrl !== url) {
    await deleteUnreferencedMediaUrls([current.avatarUrl])
  }

  revalidatePath('/profile')
  return done(t('profile.avatarUpdated'))
}
