import "server-only"

import { notFound } from "next/navigation"
import type { MobileView } from "@genealogiq/auth/mobile"
import { canActivate } from "@genealogiq/services/credits"
import { auth } from "@/auth"
import { verifySession } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { applyCheckoutSessionSync } from "@/lib/billing"
import { getExtraUnits } from "@/lib/extra-units"
import { getGuardianGeoPlacesStatus } from "@/lib/geo-quota"
import { getMemorialCreationStatus } from "@/lib/memorial-quota"
import { getPetCreationStatus } from "@/lib/pet-quota"
import { allowsExtraPurchase } from "@/lib/plan-quotas"
import { getQrQuotaStatus } from "@/lib/qr-quota"
import { getMemorialFeatures } from "@/lib/subscription"
import { getActivePlan } from "@/queries/billing"
import { getBioByUserId } from "@/queries/bio"
import { getDocumentsCount } from "@/queries/documents"
import { countTreeMembers } from "@/queries/family-tree"
import { getFavoritesByUserId } from "@/queries/favorite"
import { getLicenseByGenCode } from "@/queries/gencode"
import { getCombinedMediaUsage } from "@/queries/media-usage"
import { getGuardedProfilesByGuardianId } from "@/queries/memorial"
import { getMessages, getUnreadCount } from "@/queries/notifications"
import { getActiveSubscriptions } from "@/queries/subscriptions"
import { optionalParam, requireParam, toPlanSummary, toProfileCard } from "./shared"

/** The signed-in account row. Always keyed by the session, never by a parameter. */
function getAccount(userId: string) {
  return prisma.appUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarUrl: true,
      preferredLocale: true,
      isPublicProfile: true,
      // Only whether one exists is returned: Google-only accounts have none and
      // cannot use the change-password / change-email / delete-account forms.
      password: true,
    },
  })
}

/** `me` — account basics, plan summary and every quota the app gates on. */
export const me: MobileView = async () => {
  const session = await verifySession()
  const userId = session.user.id

  const [account, unreadCount, features, activePlan, memorials, pets, geoPlaces, qr, treeMembers, media, documents, bio, extraGeo, extraQr, extraMemorial] =
    await Promise.all([
      getAccount(userId),
      getUnreadCount(userId),
      getMemorialFeatures(userId),
      getActivePlan(userId),
      getMemorialCreationStatus(userId),
      getPetCreationStatus(userId),
      getGuardianGeoPlacesStatus(userId),
      getQrQuotaStatus(userId, userId),
      countTreeMembers(userId),
      getCombinedMediaUsage(userId),
      getDocumentsCount(userId, true),
      getBioByUserId(userId),
      getExtraUnits(userId, "GEO_PLACE"),
      getExtraUnits(userId, "QR_CODE"),
      getExtraUnits(userId, "MEMORIAL"),
    ])
  if (!account) notFound()

  const { password, ...basics } = account

  return {
    user: { ...basics, hasPassword: password !== null },
    unreadCount,
    plan: {
      code: features.code,
      quotas: features,
      active: toPlanSummary(activePlan),
    },
    quotas: {
      memorials,
      pets,
      geoPlaces: { ...geoPlaces, allowed: geoPlaces.usage < geoPlaces.limit },
      qrCode: qr,
      tree: { count: treeMembers, limit: features.treeMaxMembers },
      media: {
        images: media.images,
        videos: media.videos,
        maxImages: features.mediaMaxImages,
        maxVideos: features.mediaMaxVideos,
      },
      documents: { count: documents, limit: features.documentsMax },
      bio: { chars: bio?.text?.length ?? 0, limit: features.bioMaxChars },
    },
    extraUnits: {
      purchased: { GEO_PLACE: extraGeo, QR_CODE: extraQr, MEMORIAL: extraMemorial },
      purchasable: {
        GEO_PLACE: allowsExtraPurchase("geoPlacesMax", features.code),
        QR_CODE: allowsExtraPurchase("qrCodeMax", features.code),
        MEMORIAL: allowsExtraPurchase("memorialsMax", features.code),
      },
    },
  }
}

/** `header` — what `(protected)/layout.tsx` loads for the app bar and bell badge. */
export const header: MobileView = async () => {
  const session = await verifySession()
  const [unreadCount, user] = await Promise.all([
    getUnreadCount(session.user.id),
    prisma.appUser.findUnique({
      where: { id: session.user.id },
      select: { firstName: true, lastName: true, avatarUrl: true },
    }),
  ])
  return {
    userId: session.user.id,
    userName: user ? `${user.firstName} ${user.lastName}` : null,
    userImage: user?.avatarUrl ?? null,
    unreadCount,
  }
}

/** `home` — dashboard: greeting name, own favourites, guarded profiles. */
export const home: MobileView = async () => {
  const session = await verifySession()
  const userId = session.user.id

  const [favorites, memorials, currentUser] = await Promise.all([
    getFavoritesByUserId(userId, userId),
    getGuardedProfilesByGuardianId(userId),
    prisma.appUser.findUnique({ where: { id: userId }, select: { firstName: true } }),
  ])

  return {
    userId,
    firstName: currentUser?.firstName ?? null,
    favorites: favorites.map((fav) => ({ createdAt: fav.createdAt, target: toProfileCard(fav.target) })),
    memorials: memorials.map(toProfileCard),
  }
}

/**
 * `messages` — pending items plus the first activity page. Unlike the web
 * page this read has no side effect: the client calls the `markMessagesRead`
 * action when the inbox is actually shown.
 */
export const messages: MobileView = async () => {
  const session = await verifySession()
  return getMessages(session.user.id)
}

/** `subscriptions` — catalogue, active plan and its gift/manual/cancelling state. */
export const subscriptions: MobileView = async (params) => {
  const session = await verifySession()
  const status = optionalParam(params, "status")
  const checkoutSessionId = optionalParam(params, "sessionId")

  // Same best-effort mirror of a just-completed Checkout Session the page does
  // before reading the plan; the Stripe webhook stays the source of truth.
  if (status === "success" && checkoutSessionId) {
    try {
      await applyCheckoutSessionSync(checkoutSessionId)
    } catch (err) {
      console.error("[mobile subscriptions] applyCheckoutSessionSync failed", err)
    }
  }

  const activePlan = await getActivePlan(session.user.id)
  const catalogue = await getActiveSubscriptions(
    activePlan?.couponRedemption || activePlan?.consumerAccessGrant ? activePlan.subscription.id : undefined,
  )

  return {
    subscriptions: catalogue,
    activePlan: toPlanSummary(activePlan),
    flashStatus: status === "success" ? "success" : status === "cancel" ? "cancel" : null,
  }
}

/** `billingQrCode` — the single entry paid plan offered on /billing/qr-code. */
export const billingQrCode: MobileView = async () => {
  const session = await verifySession()
  const [catalogue, activePlan] = await Promise.all([
    getActiveSubscriptions(),
    getActivePlan(session.user.id),
  ])
  const paidPlans = catalogue.filter((s) => s.code !== "FREE")
  return {
    entryPlan: paidPlans[0] ?? null,
    activePlan: toPlanSummary(activePlan),
  }
}

/**
 * `qrLanding` — state of a scanned/typed GenCode (`/qr/[genCode]`). Public:
 * a visitor holding a plaque sees whether it can be activated before signing up.
 */
export const qrLanding: MobileView = async (params) => {
  const normalized = requireParam(params, "genCode").toUpperCase().replace(/-/g, "")

  const [session, license] = await Promise.all([auth(), getLicenseByGenCode(normalized)])
  if (!license) notFound()

  const authenticated = !!session?.user
  if (license.status === "ACTIVATED") {
    return { state: "activated" as const, genCode: normalized, authenticated, profileId: license.appUserId }
  }

  // A code sold to a named buyer is not offered to another signed-in account.
  if (license.businessSaleId && license.soldToAppUserId && session?.user && license.soldToAppUserId !== session.user.id) {
    return { state: "soldToAnotherBuyer" as const, genCode: normalized, authenticated, profileId: null }
  }

  if (!(await canActivate(license.tenantId, license.id))) {
    return { state: "expired" as const, genCode: normalized, authenticated, profileId: null }
  }

  // Signed in: show the activation form. Visitor: show sign-up / sign-in.
  return { state: "available" as const, genCode: normalized, authenticated, profileId: null }
}
