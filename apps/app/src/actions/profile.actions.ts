"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { done, fail, type ActionResult } from "@genealogiq/core"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/dal"
import { getProfileEditSchema } from "@/schemas/profile.schema"
import { identityTranslator } from "@/schemas/i18n"
import { deleteBlobs } from "@/lib/blob"
import { isAuthorizedMediaReference } from "@genealogiq/services/media-storage"

export async function updateProfile(data: unknown): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const parsed = getProfileEditSchema(identityTranslator, false).safeParse(data)
  if (!parsed.success) return fail(t("common.invalidData"))

  const {
    firstName, lastName, maidenName, nickname, gender, avatarUrl,
    birthDate, birthPlace, birthState, birthCountry,
    phoneCountryCode, phone,
    website, instagram, linkedin, fb, x, tiktok, youtube, otherSocial,
    notes,
    address,
    isPublicProfile,
  } = parsed.data

  const current = await prisma.appUser.findUnique({
    where: { id: session.user.id },
    select: { avatarUrl: true, addressId: true },
  })
  if (
    avatarUrl !== current?.avatarUrl &&
    !isAuthorizedMediaReference(
      avatarUrl,
      [`profiles/${session.user.id}/bio`],
      { allowLegacy: false },
    )
  ) {
    return fail(t("common.invalidData"))
  }

  const addressId = await upsertAddress(current?.addressId ?? null, address)

  // National ID is no longer part of the form — leave that column untouched so
  // any existing data is preserved.
  await prisma.appUser.update({
    where: { id: session.user.id },
    data: {
      firstName, lastName,
      maidenName:       maidenName       || null,
      nickname:         nickname         || null,
      gender:           gender           ?? null,
      avatarUrl:        avatarUrl        ?? null,
      birthDate:        birthDate        ?? null,
      birthPlace:       birthPlace       || null,
      birthState:       birthState       || null,
      birthCountry:     birthCountry     || null,
      phoneCountryCode: phoneCountryCode || "55",
      phone:            phone            || null,
      website:          website          || null,
      instagram:        instagram        || null,
      linkedin:         linkedin         || null,
      fb:               fb               || null,
      x:                x                || null,
      tiktok:           tiktok           || null,
      youtube:          youtube          || null,
      otherSocial:      otherSocial      || null,
      notes:            notes            || null,
      isPublicProfile,
      addressId,
    },
  })
  if (current?.avatarUrl && current.avatarUrl !== avatarUrl) {
    await deleteBlobs([current.avatarUrl])
  }

  revalidatePath(`/profile/${session.user.id}`)
  revalidatePath("/", "layout")
  return done()
}

async function upsertAddress(
  existingId: string | null,
  data: Record<string, string | null | undefined>,
): Promise<string | null> {
  const hasData = Object.entries(data).some(
    ([k, v]) => k !== "country" && typeof v === "string" && v.trim(),
  )

  if (!hasData) {
    if (existingId) {
      // Orphan-address cleanup is best-effort: a missing row (P2025) is fine,
      // but any other failure should surface in logs, not be swallowed silently.
      await prisma.address.delete({ where: { id: existingId } }).catch((err: unknown) => {
        if ((err as { code?: string }).code !== "P2025") {
          console.error("[upsertAddress] failed to delete orphan address", existingId, err)
        }
      })
    }
    return null
  }

  if (existingId) {
    await prisma.address.update({ where: { id: existingId }, data })
    return existingId
  }

  const created = await prisma.address.create({ data })
  return created.id
}
