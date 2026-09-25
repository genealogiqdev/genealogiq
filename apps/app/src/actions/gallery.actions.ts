"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { done, fail, type ActionResult } from "@genealogiq/core"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/dal"
import { saveGallerySchema } from "@/schemas/gallery.schema"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { deleteBlobs } from "@/lib/blob"
import { getMemorialFeatures } from "@/lib/subscription"
import { exceedsQuota } from "@/lib/quota"
import { getCombinedMediaUsage } from "@/queries/media-usage"
import { isAuthorizedMediaReference } from "@genealogiq/services/media-storage"

export async function saveGallery(profileId: string, data: unknown): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(profileId)
  if (!profile || !canManageProfile(profile, session.user.id)) return fail(t("gallery.notAuthorized"))

  const parsed = saveGallerySchema.safeParse(data)
  if (!parsed.success) return fail(t("common.invalidData"))

  const { items } = parsed.data

  const features = await getMemorialFeatures(profileId)
  const imgCount = items.filter((i) => i.kind === "image").length
  const vidCount = items.filter((i) => i.kind === "video").length

  // Images share one combined pool with Bio and Geolocalizações — check
  // what's used OUTSIDE this gallery plus what this save is about to submit.
  // Videos have no other source today, so no subtraction is needed there.
  const [combined, currentGalleryImages] = await Promise.all([
    getCombinedMediaUsage(profileId),
    prisma.galleryItem.count({ where: { userId: profileId, kind: "image" } }),
  ])
  // What the profile holds today, which is the floor a grandfathered save may
  // not exceed. combined.videos is gallery-only, so it needs no subtraction.
  const currentVideos = combined.videos
  const otherImages = combined.images - currentGalleryImages
  // Grandfathered: over the limit is allowed to stay and to shrink, never to grow.
  if (exceedsQuota(otherImages + imgCount, features.mediaMaxImages, combined.images)) {
    return fail(t("gallery.imageLimit", { max: features.mediaMaxImages }))
  }
  if (exceedsQuota(vidCount, features.mediaMaxVideos, currentVideos)) {
    return fail(t("gallery.videoLimit", { max: features.mediaMaxVideos }))
  }

  const oldItems = await prisma.galleryItem.findMany({
    where: { userId: profileId },
    select: { url: true, poster: true },
  })
  const oldUrls = new Set(
    oldItems
      .flatMap((item) => [item.url, item.poster])
      .filter((url): url is string => Boolean(url)),
  )
  if (items.some((item) =>
    (!oldUrls.has(item.url) &&
      !isAuthorizedMediaReference(item.url, [`profiles/${profileId}/gallery`], {
        allowLegacy: false,
      })) ||
    (Boolean(item.poster) &&
      !oldUrls.has(item.poster!) &&
      !isAuthorizedMediaReference(item.poster, [`profiles/${profileId}/gallery`], {
        allowLegacy: false,
      }))
  )) {
    return fail(t("common.invalidData"))
  }
  const newUrls = new Set(
    items
      .flatMap((item) => [item.url, item.poster])
      .filter((url): url is string => Boolean(url)),
  )
  const staleUrls = oldItems
    .flatMap((item) => [item.url, item.poster])
    .filter((url): url is string => Boolean(url))
    .filter((url) => !newUrls.has(url))

  await prisma.$transaction(async (tx) => {
    await tx.galleryItem.deleteMany({ where: { userId: profileId } })
    if (items.length > 0) {
      await tx.galleryItem.createMany({
        data: items.map((item, i) => ({
          // id is DB-generated (cuid) — never persist a client-supplied primary key.
          kind: item.kind,
          url: item.url,
          poster: item.poster,
          durationSec: item.durationSec,
          takenAt: item.takenAt,
          location: item.location,
          description: item.description,
          order: i,
          userId: profileId,
        })),
      })
    }
  })
  await deleteBlobs(staleUrls)

  revalidatePath(`/profile/${profileId}/gallery`)
  return done()
}

export async function deleteGallery(profileId: string): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const profile = await getProfileById(profileId)
  if (!profile || !canManageProfile(profile, session.user.id)) return fail(t("gallery.notAuthorized"))

  const items = await prisma.galleryItem.findMany({
    where: { userId: profileId },
    select: { url: true, poster: true },
  })
  await prisma.galleryItem.deleteMany({ where: { userId: profileId } })
  await deleteBlobs(
    items
      .flatMap((item) => [item.url, item.poster])
      .filter((url): url is string => Boolean(url)),
  )
  revalidatePath(`/profile/${profileId}/gallery`)
  return done()
}
