"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { done, fail, type ActionResult } from "@genealogiq/core"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/dal"
import { bioSchema } from "@/schemas/bio.schema"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { deleteBlobs } from "@/lib/blob"
import { getMemorialFeatures } from "@/lib/subscription"
import { exceedsQuota } from "@/lib/quota"
import { getCombinedMediaUsage } from "@/queries/media-usage"
import { isAuthorizedMediaReference } from "@genealogiq/services/media-storage"

export async function saveBio(profileId: string, data: unknown): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(profileId)
  if (!profile) return fail(t("bio.profileNotFound"))
  if (!canManageProfile(profile, session.user.id)) return fail(t("bio.notAuthorized"))

  const parsed = bioSchema.safeParse(data)
  if (!parsed.success) return fail(t("common.invalidData"))

  const { quote, text, images } = parsed.data

  const features = await getMemorialFeatures(profileId)
  // Grandfathered: a bio written under a richer plan stays editable after the
  // plan lapses, as long as it does not grow. See lib/quota.ts.
  const currentBio = await prisma.bio.findUnique({ where: { userId: profileId }, select: { text: true } })
  if (exceedsQuota(text?.length ?? 0, features.bioMaxChars, currentBio?.text?.length ?? 0)) {
    return fail(t("bio.charLimit", { max: features.bioMaxChars }))
  }

  // Images share one combined pool with Gallery and Geolocalizações — check
  // what's used OUTSIDE this bio (combined total minus this bio's own current
  // images, since this save replaces the bio's whole image set) plus what
  // this save is about to submit.
  const [combined, currentBioImageCount] = await Promise.all([
    getCombinedMediaUsage(profileId),
    prisma.bioImage.count({ where: { bio: { userId: profileId } } }),
  ])
  const otherImages = combined.images - currentBioImageCount
  // Grandfathered like the text above: a media pool filled under a richer plan
  // stays editable after it lapses, it just cannot grow.
  if (exceedsQuota(otherImages + images.length, features.mediaMaxImages, combined.images)) {
    return fail(t("bio.imageLimit", { max: features.mediaMaxImages }))
  }

  const oldImages = await prisma.bioImage.findMany({
    where: { bio: { userId: profileId } },
    select: { url: true },
  })
  const oldUrls = new Set(oldImages.map((image) => image.url))
  if (images.some((image) =>
    !oldUrls.has(image.url) &&
    !isAuthorizedMediaReference(
      image.url,
      [`profiles/${profileId}/bio`],
      { allowLegacy: false },
    )
  )) {
    return fail(t("common.invalidData"))
  }

  const bio = await prisma.bio.upsert({
    where: { userId: profileId },
    create: { userId: profileId, quote, text },
    update: { quote, text },
  })

  const newUrls = new Set(images.map((i) => i.url))
  const staleUrls = oldImages.map((i) => i.url).filter((u) => !newUrls.has(u))

  await prisma.$transaction(async (tx) => {
    await tx.bioImage.deleteMany({ where: { bioId: bio.id } })
    if (images.length > 0) {
      await tx.bioImage.createMany({
        data: images.map((img, i) => ({
          id: img.id,
          url: img.url,
          aspect: img.aspect ?? "square",
          order: i,
          bioId: bio.id,
        })),
      })
    }
  })
  await deleteBlobs(staleUrls)

  revalidatePath(`/profile/${profileId}/bio`)
  return done()
}

export async function deleteBio(profileId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(profileId)
  if (!profile) return fail(t("bio.profileNotFound"))
  if (!canManageProfile(profile, session.user.id)) return fail(t("bio.notAuthorized"))

  const bio = await prisma.bio.findUnique({
    where: { userId: profileId },
    include: { images: { select: { url: true } } },
  })
  await prisma.bio.deleteMany({ where: { userId: profileId } })
  await deleteBlobs(bio?.images.map((i) => i.url) ?? [])
  revalidatePath(`/profile/${profileId}/bio`)
  return done()
}
