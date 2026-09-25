"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { ok, done, fail, type ActionResult } from "@genealogiq/core"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/dal"
import { getMemorialSchema } from "@/schemas/memorial.schema"
import { getProfileEditSchema } from "@/schemas/profile.schema"
import { identityTranslator } from "@/schemas/i18n"
import { getProfileById, getProfileForEdit } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { deleteBlobs } from "@/lib/blob"
import { getMemorialCreationStatus } from "@/lib/memorial-quota"
import { isAuthorizedMediaReference } from "@genealogiq/services/media-storage"

export async function createMemorial(data: unknown): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  // Can the guardian create ANOTHER memorial at all (plan's memorialsMax) —
  // independent of whether this new one gets bound to a paid slot below.
  const creationStatus = await getMemorialCreationStatus(session.user.id)
  if (!creationStatus.allowed) {
    return fail(t("memorial.limitReached", { max: creationStatus.limit }))
  }

  const parsed = getMemorialSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(t("common.invalidData"))
  if (!isAuthorizedMediaReference(
    parsed.data.avatarUrl,
    [`pending/${session.user.id}/create-memorial`],
    { allowLegacy: false },
  )) {
    return fail(t("common.invalidData"))
  }

  const { firstName, lastName, gender, birthDate, birthPlace, birthCountry, deathDate, deathPlace, deathCountry, avatarUrl } = parsed.data

  const memorial = await prisma.appUser.create({
    data: {
      firstName,
      lastName,
      gender: gender ?? null,
      role: "APP_MEMO",
      birthDate,
      birthPlace,
      birthCountry,
      deathDate,
      deathPlace,
      deathCountry,
      avatarUrl,
    },
  })

  await prisma.appUserGuardian.create({
    data: { appUserId: memorial.id, guardianId: session.user.id },
  })

  revalidatePath(`/profile/${session.user.id}/memorialized`)
  return ok({ id: memorial.id })
}

export async function deleteMemorial(profileId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(profileId)
  if (!profile || profile.role !== "APP_MEMO") return fail(t("memorial.notFound"))
  if (!canManageProfile(profile, session.user.id)) return fail(t("memorial.notAuthorized"))

  const [bio, galleryItems, tributes, geo, documents, places] = await Promise.all([
    prisma.bio.findUnique({
      where: { userId: profileId },
      include: { images: { select: { url: true } } },
    }),
    prisma.galleryItem.findMany({ where: { userId: profileId }, select: { url: true, poster: true } }),
    prisma.tribute.findMany({ where: { profileId }, select: { imageUrl: true } }),
    prisma.geolocation.findUnique({
      where: { userId: profileId },
      select: { photo1: true, photo2: true, photo3: true },
    }),
    prisma.document.findMany({ where: { userId: profileId }, select: { fileUrl: true } }),
    prisma.geoPlace.findMany({ where: { userId: profileId }, select: { photos: true } }),
  ])

  await prisma.appUser.delete({ where: { id: profileId } })
  await deleteBlobs([
    profile.avatarUrl,
    ...(bio?.images.map((i) => i.url) ?? []),
    ...galleryItems.map((i) => i.url),
    ...galleryItems.map((i) => i.poster),
    ...tributes.map((t) => t.imageUrl),
    ...documents.map((d) => d.fileUrl),
    ...places.flatMap((place) => place.photos),
    geo?.photo1,
    geo?.photo2,
    geo?.photo3,
  ])

  revalidatePath(`/profile/${session.user.id}`)
  return done()
}

export async function updateMemorial(profileId: string, data: unknown): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  // Manager-only edit path — uses the full projection (needs address id).
  const profile = await getProfileForEdit(profileId)
  if (!profile || profile.role !== "APP_MEMO") return fail(t("memorial.notFound"))
  if (!canManageProfile(profile, session.user.id)) return fail(t("memorial.notAuthorized"))

  const parsed = getProfileEditSchema(identityTranslator, true).safeParse(data)
  if (!parsed.success) return fail(t("common.invalidData"))
  if (
    parsed.data.avatarUrl !== profile.avatarUrl &&
    !isAuthorizedMediaReference(
      parsed.data.avatarUrl,
      [`profiles/${profileId}/bio`],
      { allowLegacy: false },
    )
  ) {
    return fail(t("common.invalidData"))
  }

  const {
    firstName, lastName, maidenName, nickname, gender, avatarUrl,
    birthDate, birthPlace, birthState, birthCountry,
    deathDate, deathPlace, deathState, deathCountry, deathCause,
    website, instagram, linkedin, fb, x, tiktok, youtube, otherSocial,
    notes,
  } = parsed.data

  // Memorials have no phone/contact/address of their own, and National ID is no
  // longer part of the form — leave those columns untouched so any existing data
  // is preserved.
  await prisma.appUser.update({
    where: { id: profileId },
    data: {
      firstName, lastName,
      maidenName:   maidenName   || null,
      nickname:     nickname     || null,
      gender:       gender       ?? null,
      avatarUrl:    avatarUrl    ?? null,
      birthDate:    birthDate    ?? null,
      birthPlace:   birthPlace   || null,
      birthState:   birthState   || null,
      birthCountry: birthCountry || null,
      deathDate:    deathDate    ?? null,
      deathPlace:   deathPlace   || null,
      deathState:   deathState   || null,
      deathCountry: deathCountry || null,
      deathCause:   deathCause   || null,
      website:      website      || null,
      instagram:    instagram    || null,
      linkedin:     linkedin     || null,
      fb:           fb           || null,
      x:            x            || null,
      tiktok:       tiktok       || null,
      youtube:      youtube      || null,
      otherSocial:  otherSocial  || null,
      notes:        notes        || null,
    },
  })
  if (profile.avatarUrl && profile.avatarUrl !== avatarUrl) {
    await deleteBlobs([profile.avatarUrl])
  }

  revalidatePath(`/profile/${profileId}`)
  return done()
}
