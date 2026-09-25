"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { done, fail, type ActionResult } from "@genealogiq/core"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/dal"
import { getTributeSchema } from "@/schemas/tribute.schema"
import { identityTranslator } from "@/schemas/i18n"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { assertOwnership } from "@genealogiq/auth/authz"
import { deleteBlobs } from "@/lib/blob"
import { notify, markNotificationsRead } from "@/lib/notifications"
import { isAuthorizedMediaReference } from "@genealogiq/services/media-storage"

export async function submitTribute(profileId: string, data: unknown): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()
  if (session.user.id === profileId) return fail(t("tribute.cannotTributeSelf"))

  const parsed = getTributeSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(t("common.invalidData"))

  const existing = await prisma.tribute.findUnique({
    where: { authorId_profileId: { authorId: session.user.id, profileId } },
    select: { imageUrl: true },
  })
  if (
    parsed.data.imageUrl !== existing?.imageUrl &&
    !isAuthorizedMediaReference(
      parsed.data.imageUrl,
      [`profiles/${profileId}/tributes/${session.user.id}`],
      { allowLegacy: false },
    )
  ) {
    return fail(t("common.invalidData"))
  }
  const tribute = await prisma.tribute.upsert({
    where: { authorId_profileId: { authorId: session.user.id, profileId } },
    create: { authorId: session.user.id, profileId, ...parsed.data, status: "PENDING" },
    update: { ...parsed.data, status: "PENDING" },
  })
  if (existing?.imageUrl && existing.imageUrl !== parsed.data.imageUrl) {
    await deleteBlobs([existing.imageUrl])
  }

  // Notify everyone who can moderate this profile: the profile owner (when it's
  // a living user) and any guardians (typical for memorial profiles). Deduped.
  const guardians = await prisma.appUserGuardian.findMany({
    where:  { appUserId: profileId },
    select: { guardianId: true },
  })
  const recipientIds = new Set<string>([profileId, ...guardians.map((g) => g.guardianId)])
  recipientIds.delete(session.user.id) // never notify the author about their own tribute
  for (const recipientId of recipientIds) {
    await notify({
      type:      "TRIBUTE_PENDING",
      userId:    recipientId,
      actorId:   session.user.id,
      tributeId: tribute.id,
    })
  }

  revalidatePath(`/profile/${profileId}/tributes`)
  return done()
}

export async function approveTribute(tributeId: string, profileId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(profileId)
  if (!profile || !canManageProfile(profile, session.user.id)) return fail(t("tribute.notAuthorized"))

  // Ensure the tribute actually belongs to the profile the caller manages.
  // Without this, a manager of profile A could moderate tributes on any other
  // profile by passing their own profileId + an arbitrary tributeId (IDOR).
  const owned = assertOwnership(
    await prisma.tribute.findUnique({ where: { id: tributeId }, select: { profileId: true } }),
    (rec) => rec.profileId === profileId,
  )
  if (!owned.ok) return fail(t("tribute.notAuthorized"))

  const tribute = await prisma.tribute.update({
    where: { id: tributeId },
    data:  { status: "APPROVED" },
    select: { authorId: true },
  })

  // Transform every moderator's TRIBUTE_PENDING notification into TRIBUTE_APPROVED
  // so it persists in their Recent Activity ("You approved <author>'s tribute")
  // instead of vanishing. Mark read so the bell badge clears.
  await prisma.notification.updateMany({
    where: { tributeId, type: "TRIBUTE_PENDING" },
    data:  { type: "TRIBUTE_APPROVED", readAt: new Date() },
  })

  // Notify the tribute author too.
  await notify({
    type:      "TRIBUTE_APPROVED",
    userId:    tribute.authorId,
    actorId:   session.user.id,
    tributeId,
  })

  revalidatePath(`/profile/${profileId}/tributes`)
  revalidatePath(`/profile/${profileId}/tributes/moderate`)
  return done()
}

export async function rejectTribute(tributeId: string, profileId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(profileId)
  if (!profile || !canManageProfile(profile, session.user.id)) return fail(t("tribute.notAuthorized"))

  // Ensure the tribute actually belongs to the profile the caller manages (see
  // approveTribute) — prevents cross-profile moderation via a forged profileId.
  const owned = assertOwnership(
    await prisma.tribute.findUnique({ where: { id: tributeId }, select: { profileId: true } }),
    (rec) => rec.profileId === profileId,
  )
  if (!owned.ok) return fail(t("tribute.notAuthorized"))

  const tribute = await prisma.tribute.update({
    where: { id: tributeId },
    data:  { status: "REJECTED" },
    select: { authorId: true },
  })

  // See approveTribute: transform-in-place so the moderator keeps an audit trail
  // in Recent Activity.
  await prisma.notification.updateMany({
    where: { tributeId, type: "TRIBUTE_PENDING" },
    data:  { type: "TRIBUTE_REJECTED", readAt: new Date() },
  })

  await notify({
    type:      "TRIBUTE_REJECTED",
    userId:    tribute.authorId,
    actorId:   session.user.id,
    tributeId,
  })

  revalidatePath(`/profile/${profileId}/tributes/moderate`)
  return done()
}

export async function deleteTribute(tributeId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const tribute = await prisma.tribute.findUnique({
    where:  { id: tributeId },
    select: {
      id: true,
      authorId: true,
      profileId: true,
      imageUrl: true,
      profile: {
        select: {
          id:         true,
          guardedBy:  {
            where:  { status: "ACCEPTED" },
            select: { guardianId: true },
          },
        },
      },
    },
  })
  if (!tribute) return fail(t("tribute.notFound"))

  // Permission: the author OR anyone who can manage the target profile
  // (the profile owner themselves, or any guardian).
  const isAuthor  = tribute.authorId === session.user.id
  const isManager = !!tribute.profile && (
    tribute.profile.id === session.user.id ||
    tribute.profile.guardedBy.some((g) => g.guardianId === session.user.id)
  )
  if (!isAuthor && !isManager) return fail(t("tribute.notAuthorized"))

  await markNotificationsRead(session.user.id, { tributeId: tribute.id })
  await prisma.tribute.delete({ where: { id: tribute.id } })
  await deleteBlobs([tribute.imageUrl])

  revalidatePath(`/profile/${tribute.profileId}/tributes`)
  return done()
}
