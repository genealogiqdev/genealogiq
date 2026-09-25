"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { ok, done, fail, type ActionResult } from "@genealogiq/core"
import { checkRateLimit } from "@genealogiq/services/rate-limit"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/dal"
import { getPetSchema, getPetEditSchema } from "@/schemas/pet.schema"
import { identityTranslator } from "@/schemas/i18n"
import { getProfileById, getProfileForEdit } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { deleteBlobs } from "@/lib/blob"
import { getPetCreationStatus } from "@/lib/pet-quota"
import { getTreeMemberIds } from "@/queries/family-tree"
import { isAuthorizedMediaReference } from "@genealogiq/services/media-storage"

async function getAuthorizedHumanOwners(rootId: string, actorId: string, ownerIds: string[]) {
  const root = await getProfileById(rootId)
  if (!root || !canManageProfile(root, actorId)) return null

  const memberIds = await getTreeMemberIds(rootId)
  const uniqueOwnerIds = Array.from(new Set(ownerIds))
  if (uniqueOwnerIds.some((id) => !memberIds.has(id))) return null

  const owners = await prisma.appUser.findMany({
    where: { id: { in: uniqueOwnerIds }, role: { not: "APP_PET" } },
    select: { id: true },
  })
  return owners.length === uniqueOwnerIds.length ? uniqueOwnerIds : null
}

function revalidatePetOwnershipPaths(petId: string, guardianId: string, ownerIds: string[]) {
  revalidatePath(`/profile/${petId}`)
  revalidatePath(`/profile/${guardianId}/pets`)
  for (const ownerId of new Set(ownerIds)) {
    revalidatePath(`/profile/${ownerId}`)
    revalidatePath(`/profile/${ownerId}/pets`)
    revalidatePath(`/profile/${ownerId}/tree`)
  }
}

export async function createPet(data: unknown, rootId?: string): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const limit = await checkRateLimit({ key: `pet:create:${session.user.id}`, maxAttempts: 20, windowSeconds: 3600 })
  if (!limit.allowed) return fail(t("familyTree.tooManyRequests"))

  const creationStatus = await getPetCreationStatus(session.user.id)
  if (!creationStatus.allowed) {
    return fail(t("pet.limitReached", { max: creationStatus.limit }))
  }

  const parsed = getPetSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(t("common.invalidData"))
  if (!isAuthorizedMediaReference(
    parsed.data.avatarUrl,
    [`pending/${session.user.id}/create-pet`],
    { allowLegacy: false },
  )) {
    return fail(t("common.invalidData"))
  }

  const { firstName, species, breed, gender, birthDate, deathDate, avatarUrl, ownerIds } = parsed.data

  // Every proposed owner must be a human member of the managed context tree.
  // The context may be a memorial the caller guards, not only their own root.
  const contextRootId = rootId ?? session.user.id
  const uniqueOwnerIds = await getAuthorizedHumanOwners(contextRootId, session.user.id, ownerIds)
  if (!uniqueOwnerIds) {
    return fail(t("pet.ownerNotInTree"))
  }

  const pet = await prisma.$transaction(async (tx) => {
    const created = await tx.appUser.create({
      data: {
        firstName,
        lastName: "",
        role: "APP_PET",
        petSpecies: species || null,
        petBreed: breed || null,
        gender: gender ?? null,
        birthDate,
        deathDate,
        avatarUrl,
      },
    })

    await tx.appUserGuardian.create({
      data: { appUserId: created.id, guardianId: session.user.id },
    })

    await tx.petOwnership.createMany({
      data: uniqueOwnerIds.map((ownerId) => ({
        petId: created.id,
        ownerId,
      })),
    })

    return created
  })

  revalidatePetOwnershipPaths(pet.id, session.user.id, uniqueOwnerIds)
  return ok({ id: pet.id })
}

export async function updatePet(profileId: string, data: unknown, rootId?: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileForEdit(profileId)
  if (!profile || profile.role !== "APP_PET") return fail(t("pet.notFound"))
  if (!canManageProfile(profile, session.user.id)) return fail(t("pet.notAuthorized"))

  const parsed = getPetEditSchema(identityTranslator).safeParse(data)
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

  const { firstName, species, breed, gender, birthDate, deathDate, avatarUrl, ownerIds } = parsed.data
  const previousOwners = await prisma.petOwnership.findMany({
    where: { petId: profileId },
    select: { ownerId: true },
  })
  const uniqueOwnerIds = Array.from(new Set(ownerIds))
  const previousOwnerIds = new Set(previousOwners.map((owner) => owner.ownerId))
  const addedOwnerIds = uniqueOwnerIds.filter((ownerId) => !previousOwnerIds.has(ownerId))
  if (addedOwnerIds.length > 0) {
    const contextRootId = rootId ?? session.user.id
    const authorizedAddedOwners = await getAuthorizedHumanOwners(contextRootId, session.user.id, addedOwnerIds)
    if (!authorizedAddedOwners) return fail(t("pet.ownerNotInTree"))
  }
  const validOwnerCount = await prisma.appUser.count({
    where: { id: { in: uniqueOwnerIds }, role: { not: "APP_PET" } },
  })
  if (validOwnerCount !== uniqueOwnerIds.length) return fail(t("pet.ownerNotInTree"))

  await prisma.$transaction(async (tx) => {
    await tx.appUser.update({
      where: { id: profileId },
      data: {
        firstName,
        petSpecies: species || null,
        petBreed: breed || null,
        gender: gender ?? null,
        birthDate: birthDate ?? null,
        deathDate: deathDate ?? null,
        avatarUrl: avatarUrl ?? null,
      },
    })
    await tx.petOwnership.deleteMany({
      where: { petId: profileId, ownerId: { notIn: uniqueOwnerIds } },
    })
    await tx.petOwnership.createMany({
      data: uniqueOwnerIds.map((ownerId) => ({ petId: profileId, ownerId })),
      skipDuplicates: true,
    })
  })
  if (profile.avatarUrl && profile.avatarUrl !== avatarUrl) {
    await deleteBlobs([profile.avatarUrl])
  }

  revalidatePetOwnershipPaths(
    profileId,
    session.user.id,
    [...previousOwners.map((owner) => owner.ownerId), ...uniqueOwnerIds],
  )
  return done()
}

export async function attachPet(rootId: string, petId: string, ownerId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const [pet, ownerIds] = await Promise.all([
    getProfileById(petId),
    getAuthorizedHumanOwners(rootId, session.user.id, [ownerId]),
  ])
  if (!pet || pet.role !== "APP_PET") return fail(t("pet.notFound"))
  if (!canManageProfile(pet, session.user.id)) return fail(t("pet.notAuthorized"))
  if (!ownerIds) return fail(t("pet.ownerNotInTree"))

  await prisma.petOwnership.upsert({
    where: { petId_ownerId: { petId, ownerId } },
    create: { petId, ownerId },
    update: {},
  })
  revalidatePetOwnershipPaths(petId, session.user.id, [ownerId])
  return done()
}

export async function detachPet(rootId: string, petId: string, ownerId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const root = await getProfileById(rootId)
  if (!root || !canManageProfile(root, session.user.id)) return fail(t("pet.notAuthorized"))
  const memberIds = await getTreeMemberIds(rootId)
  if (!memberIds.has(ownerId)) return fail(t("pet.ownerNotInTree"))

  const ownerships = await prisma.petOwnership.findMany({
    where: { petId },
    select: { id: true, ownerId: true },
  })
  const target = ownerships.find((ownership) => ownership.ownerId === ownerId)
  if (!target) return fail(t("pet.notFound"))
  if (ownerships.length <= 1) return fail(t("pet.ownerRequired"))

  await prisma.petOwnership.delete({ where: { id: target.id } })
  revalidatePetOwnershipPaths(petId, session.user.id, [ownerId])
  return done()
}

export async function detachPetFromTree(rootId: string, petId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const root = await getProfileById(rootId)
  if (!root || !canManageProfile(root, session.user.id)) return fail(t("pet.notAuthorized"))
  const memberIds = await getTreeMemberIds(rootId)
  const ownerships = await prisma.petOwnership.findMany({
    where: { petId },
    select: { id: true, ownerId: true },
  })
  const attachedHere = ownerships.filter((ownership) => memberIds.has(ownership.ownerId))
  if (attachedHere.length === 0) return fail(t("pet.notFound"))
  if (ownerships.length === attachedHere.length) return fail(t("pet.ownerRequired"))

  await prisma.petOwnership.deleteMany({
    where: { id: { in: attachedHere.map((ownership) => ownership.id) } },
  })
  revalidatePetOwnershipPaths(petId, session.user.id, attachedHere.map((ownership) => ownership.ownerId))
  return done()
}

export async function deletePet(profileId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(profileId)
  if (!profile || profile.role !== "APP_PET") return fail(t("pet.notFound"))
  if (!canManageProfile(profile, session.user.id)) return fail(t("pet.notAuthorized"))

  const [bio, galleryItems, documents, places, geolocation, ownerships, tributes] = await Promise.all([
    prisma.bio.findUnique({
      where: { userId: profileId },
      include: { images: { select: { url: true } } },
    }),
    prisma.galleryItem.findMany({ where: { userId: profileId }, select: { url: true, poster: true } }),
    prisma.document.findMany({ where: { userId: profileId }, select: { fileUrl: true } }),
    prisma.geoPlace.findMany({ where: { userId: profileId }, select: { photos: true } }),
    prisma.geolocation.findUnique({
      where: { userId: profileId },
      select: { photo1: true, photo2: true, photo3: true },
    }),
    prisma.petOwnership.findMany({ where: { petId: profileId }, select: { ownerId: true } }),
    prisma.tribute.findMany({ where: { profileId }, select: { imageUrl: true } }),
  ])

  await prisma.appUser.delete({ where: { id: profileId } })
  await deleteBlobs([
    profile.avatarUrl,
    ...(bio?.images.map((i) => i.url) ?? []),
    ...galleryItems.map((i) => i.url),
    ...galleryItems.map((i) => i.poster),
    ...documents.map((d) => d.fileUrl),
    ...places.flatMap((p) => p.photos),
    geolocation?.photo1,
    geolocation?.photo2,
    geolocation?.photo3,
    ...tributes.map((tribute) => tribute.imageUrl),
  ])

  revalidatePetOwnershipPaths(profileId, session.user.id, ownerships.map((ownership) => ownership.ownerId))
  return done()
}
