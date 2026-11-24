import "server-only"

import { getTranslations } from "next-intl/server"
import { done, fail, hashToken, ok, type ActionResult } from "@genealogiq/core"
import { form, type MobileAction } from "@genealogiq/auth/mobile"
import { isAuthorizedMediaReference } from "@genealogiq/services/media-storage"
import { mobileAuth, toPrincipal } from "@/auth"
import { verifySession } from "@/lib/dal"
import { sendFeedback as sendFeedbackEmail } from "@/lib/email"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { safeCallback } from "@/lib/safe-callback"
import { getFeedbackSchema } from "@/schemas/feedback.schema"
import { identityTranslator } from "@/schemas/i18n"

import {
  changePassword,
  deleteAccount,
  forgotPassword,
  requestEmailChange,
  resetPassword,
  signUp,
} from "@/actions/auth.actions"
import { changeSubscription, createCheckoutSession, createPortalSession } from "@/actions/billing.actions"
import { deleteBio, saveBio } from "@/actions/bio.actions"
import { deleteDocument, saveDocument } from "@/actions/documents.actions"
import { createExtraUnitCheckoutSession } from "@/actions/extra-units.actions"
import {
  acceptFamilyRequest,
  addGhostRelative,
  addRelation,
  rejectFamilyRequest,
  removeMember,
  removeRelation,
  updateMember,
  updateRelation,
} from "@/actions/family-tree.actions"
import { toggleFavorite } from "@/actions/favorite.actions"
import { deleteGallery, saveGallery } from "@/actions/gallery.actions"
import { activateGenCode } from "@/actions/gencode.actions"
import { deleteGeolocation, saveGeolocation } from "@/actions/geolocation.actions"
import { approveGuardianship, rejectGuardianship, requestGuardianship } from "@/actions/guardian.actions"
import { updatePreferredLocale } from "@/actions/locale.actions"
import { createMemorial, deleteMemorial, updateMemorial } from "@/actions/memorial.actions"
import { loadMoreActivity } from "@/actions/messages.actions"
import { downloadPetQrCode } from "@/actions/pet-qr.actions"
import { attachPet, createPet, deletePet, detachPet, detachPetFromTree, updatePet } from "@/actions/pet.actions"
import { downloadPlaceQrCode } from "@/actions/place-qr.actions"
import { deletePlace, markPlaceQrGenerated, savePlace } from "@/actions/places.actions"
import { updateProfile } from "@/actions/profile.actions"
import { subscribePush, unsubscribePush } from "@/actions/push.actions"
import { registerDevicePushToken, unregisterDevicePushToken } from "@/actions/device-push.actions"
import { deleteGenealogyScan, startGenealogyScan } from "@/actions/genealogy-scan.actions"
import { addMemorialFromTree } from "@/actions/tree-memorial.actions"
import { approveTribute, deleteTribute, rejectTribute, submitTribute } from "@/actions/tribute.actions"

/* -------------------------------------------------------------------------- */
/* Argument shaping                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Positional-argument kinds. The JSON body is untrusted, and the wrapped
 * actions type their id parameters as `string` without re-checking: an object
 * in an id position would reach Prisma as a filter (`{ not: "" }`). So every
 * id position is checked here; `data` positions are validated by the action's
 * own Zod schema.
 */
type ArgKind = "string" | "string?" | "string|null" | "data"

type AnyAction = (...args: never[]) => Promise<unknown>

async function invalidData(): Promise<ActionResult> {
  const t = await getTranslations("Actions")
  return fail(t("common.invalidData"))
}

function shape(list: unknown[], kinds: readonly ArgKind[]): unknown[] | null {
  if (list.length > kinds.length) return null
  const shaped: unknown[] = []
  for (let index = 0; index < kinds.length; index++) {
    const kind = kinds[index]
    const value = list[index]
    if (kind === "data") {
      shaped.push(value)
    } else if (typeof value === "string") {
      shaped.push(value)
    } else if (kind === "string?" && (value === undefined || value === null)) {
      shaped.push(undefined)
    } else if (kind === "string|null" && (value === undefined || value === null)) {
      shaped.push(null)
    } else {
      return null
    }
  }
  return shaped
}

/** Register `fn(...args)` with a checked positional signature. */
function call<F extends AnyAction>(fn: F, ...kinds: ArgKind[]): MobileAction {
  return async ({ args: list }) => {
    const shaped = shape(list, kinds)
    if (!shaped) return invalidData()
    return (fn as unknown as (...a: unknown[]) => Promise<unknown>)(...shaped)
  }
}

function redirectDestination(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("digest" in error)) return null
  const digest = (error as { digest?: unknown }).digest
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) return null
  return digest.split(";").slice(2, -2).join(";")
}

/**
 * Some web actions report success by redirecting to the sign-in page (password
 * reset done, account deleted). The bridge reads a sign-in redirect as "no
 * session", so those are turned into a plain success here. Only use around a
 * call that cannot reach an unauthenticated `verifySession()`.
 */
async function signInRedirectIsSuccess(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run()
  } catch (error) {
    if (redirectDestination(error)?.startsWith("/sign-in")) return done()
    throw error
  }
}

/* -------------------------------------------------------------------------- */
/* Mobile-specific actions                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The web confirms an email token while rendering /verify-email (and signs the
 * browser in through /api/verify-email). Native clients post the token here.
 * Same rules: unknown/expired → invalid (an expired token is consumed), CHANGE
 * swaps the email, anything else marks the account verified. A verified sign-up
 * also receives a mobile token, mirroring the web's auto-login.
 */
const verifyEmail: MobileAction = async ({ args: list, form: data }) => {
  const t = await getTranslations("Actions")
  const raw = typeof list[0] === "string" ? list[0] : data.get("token")
  const token = typeof raw === "string" ? raw.trim() : ""
  if (!token) return fail(t("common.invalidData"))

  const ip = await getClientIp()
  const limit = await checkRateLimit({ key: `verify-email:ip:${ip}`, maxAttempts: 10, windowSeconds: 3600 })
  if (!limit.allowed) return fail(t("auth.tooManyAttempts", { minutes: Math.ceil(limit.retryAfter / 60) }))

  const hashed = hashToken(token)
  const record = await prisma.emailToken.findUnique({ where: { token: hashed } })
  if (!record || record.expiresAt < new Date()) {
    if (record) await prisma.emailToken.delete({ where: { token: hashed } }).catch(() => undefined)
    return fail(t("auth.invalidOrExpiredLink"))
  }

  // appUserId for new tokens; userId as fallback for tokens created before Phase 3
  const appUserId = record.appUserId ?? record.userId
  if (!appUserId) return fail(t("auth.invalidOrExpiredLink"))

  if (record.type === "CHANGE") {
    if (!record.newEmail) return fail(t("auth.invalidOrExpiredLink"))
    try {
      await prisma.$transaction([
        prisma.appUser.update({
          where: { id: appUserId },
          data: { email: record.newEmail, emailVerified: new Date() },
        }),
        prisma.emailToken.delete({ where: { token: hashed } }),
      ])
    } catch {
      return fail(t("auth.invalidOrExpiredLink"))
    }
    return ok({ status: "emailChanged" as const })
  }

  let user: { id: string; email: string | null; firstName: string; lastName: string; role: string; avatarUrl: string | null }
  try {
    const [updated] = await prisma.$transaction([
      prisma.appUser.update({
        where: { id: appUserId },
        data: { emailVerified: new Date() },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, avatarUrl: true },
      }),
      prisma.emailToken.delete({ where: { token: hashed } }),
    ])
    user = updated
  } catch {
    return fail(t("auth.invalidOrExpiredLink"))
  }

  // Only real consumer accounts sign in; every later request re-checks the row.
  if (record.type !== "VERIFICATION" || user.role !== "APP_USER") {
    return ok({ status: "verified" as const })
  }
  const issued = await mobileAuth.issueToken({ ...toPrincipal(user), image: user.avatarUrl })
  return ok({ status: "verified" as const, token: issued.token, expiresAt: issued.expiresAt })
}

/** The web clears the bell badge while rendering /messages; mobile does it explicitly. */
const markMessagesRead: MobileAction = async () => {
  const session = await verifySession()
  const result = await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  })
  return ok({ marked: result.count })
}

const loadMoreActivityAction: MobileAction = async ({ args: list }) => {
  const cursor = list[0] as { id?: unknown; createdAt?: unknown } | null | undefined
  if (!cursor || typeof cursor !== "object" || typeof cursor.id !== "string" || typeof cursor.createdAt !== "string") {
    return invalidData()
  }
  return loadMoreActivity({ id: cursor.id, createdAt: cursor.createdAt })
}

/**
 * Feedback from a native client. The web action is public and leans on a
 * honeypot, a fill timer and a Turnstile captcha — none of which a native app
 * can produce. This variant requires a signed-in account instead, rate-limits
 * per account, and uses the account's own email as the reply address. The web
 * action is unchanged.
 */
const sendFeedbackSignedIn: MobileAction = async ({ args: list }) => {
  const session = await verifySession()
  const t = await getTranslations("Actions")

  const parsed = getFeedbackSchema(identityTranslator)
    .pick({ type: true, message: true, cvUrl: true, page: true })
    .safeParse(list[0])
  if (!parsed.success) return fail(t("common.invalidData"))
  if (!isAuthorizedMediaReference(parsed.data.cvUrl, ["career"], { allowLegacy: false })) {
    return fail(t("common.invalidData"))
  }

  const email = session.user.email
  if (!email) return fail(t("common.invalidData"))

  const limit = await checkRateLimit({ key: `feedback:user:${session.user.id}`, maxAttempts: 5, windowSeconds: 3600 })
  if (!limit.allowed) return fail(t("feedback.tooManyRequests", { minutes: Math.ceil(limit.retryAfter / 60) }))

  await sendFeedbackEmail({
    type: parsed.data.type,
    email,
    message: parsed.data.message,
    cvUrl: parsed.data.cvUrl,
    page: parsed.data.page,
  })
  return done()
}

const EXTRA_UNIT_RESOURCES = ["GEO_PLACE", "QR_CODE", "MEMORIAL"] as const

/** Stripe returns the buyer to `APP_URL + returnPath`; only an internal path is accepted. */
const createExtraUnitCheckout: MobileAction = async ({ args: list }) => {
  const resource = EXTRA_UNIT_RESOURCES.find((candidate) => candidate === list[0])
  if (!resource) return invalidData()
  if (list[1] === undefined || list[1] === null) return createExtraUnitCheckoutSession(resource)
  const returnPath = typeof list[1] === "string" ? safeCallback(list[1]) : null
  if (!returnPath) return invalidData()
  return createExtraUnitCheckoutSession(resource, returnPath)
}

const deleteAccountAction: MobileAction = async (input, request) => {
  // Establish the session first, so the only sign-in redirect left is the
  // sign-out that ends a completed deletion.
  await verifySession()
  return signInRedirectIsSuccess(() => form(deleteAccount)(input, request))
}

/** On the web anyone viewing a place may flip this flag; a native client must be signed in. */
const markPlaceQrGeneratedSignedIn: MobileAction = async (input, request) => {
  await verifySession()
  return call(markPlaceQrGenerated, "string", "string")(input, request)
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Mobile write registry. Every server action exported from `src/actions` is
 * here except `login`/`logout` (mobile signs in at /api/mobile/v1/auth/login
 * and signs out by discarding its token). Each action keeps its own guard.
 */
export const actions: Record<string, MobileAction> = {
  // Account (form: fields in `form`)
  signUp: form(signUp),
  forgotPassword: form(forgotPassword),
  resetPassword: (input, request) => signInRedirectIsSuccess(() => form(resetPassword)(input, request)),
  verifyEmail,
  changePassword: form(changePassword),
  requestEmailChange: form(requestEmailChange),
  deleteAccount: deleteAccountAction,
  updatePreferredLocale: call(updatePreferredLocale, "data"),
  updateProfile: call(updateProfile, "data"),

  // Billing
  createCheckoutSession: call(createCheckoutSession, "string", "string"),
  changeSubscription: call(changeSubscription, "string", "string"),
  createPortalSession: call(createPortalSession),
  createExtraUnitCheckoutSession: createExtraUnitCheckout,

  // Messages / push / feedback
  loadMoreActivity: loadMoreActivityAction,
  markMessagesRead,
  subscribePush: call(subscribePush, "data"),
  unsubscribePush: call(unsubscribePush, "data"),
  registerDevicePushToken: call(registerDevicePushToken, "data"),
  unregisterDevicePushToken: call(unregisterDevicePushToken, "data"),
  startGenealogyScan: call(startGenealogyScan, "data"),
  deleteGenealogyScan: call(deleteGenealogyScan, "string"),
  sendFeedback: sendFeedbackSignedIn,

  // Favourites, guardians, tributes
  toggleFavorite: call(toggleFavorite, "string"),
  requestGuardianship: call(requestGuardianship, "data"),
  approveGuardianship: call(approveGuardianship, "data"),
  rejectGuardianship: call(rejectGuardianship, "data"),
  submitTribute: call(submitTribute, "string", "data", "string?"),
  approveTribute: call(approveTribute, "string", "string"),
  rejectTribute: call(rejectTribute, "string", "string"),
  deleteTribute: call(deleteTribute, "string"),

  // Memorials, GenCode, pets
  createMemorial: call(createMemorial, "data"),
  updateMemorial: call(updateMemorial, "string", "data"),
  deleteMemorial: call(deleteMemorial, "string"),
  addMemorialFromTree: call(addMemorialFromTree, "data"),
  activateGenCode: call(activateGenCode, "string", "data"),
  createPet: call(createPet, "data", "string?"),
  updatePet: call(updatePet, "string", "data", "string?"),
  attachPet: call(attachPet, "string", "string", "string"),
  detachPet: call(detachPet, "string", "string", "string"),
  detachPetFromTree: call(detachPetFromTree, "string", "string"),
  deletePet: call(deletePet, "string"),
  downloadPetQrCode: call(downloadPetQrCode, "string", "string?"),

  // Family tree
  addRelation: call(addRelation, "string", "data"),
  addGhostRelative: call(addGhostRelative, "string", "data"),
  updateMember: call(updateMember, "string", "string", "data"),
  updateRelation: call(updateRelation, "string", "string", "data"),
  removeRelation: call(removeRelation, "string", "string"),
  removeMember: call(removeMember, "string", "string"),
  acceptFamilyRequest: call(acceptFamilyRequest, "string"),
  rejectFamilyRequest: call(rejectFamilyRequest, "string"),

  // Profile content
  saveBio: call(saveBio, "string", "data"),
  deleteBio: call(deleteBio, "string"),
  saveGallery: call(saveGallery, "string", "data"),
  deleteGallery: call(deleteGallery, "string"),
  saveDocument: call(saveDocument, "string", "string|null", "data"),
  deleteDocument: call(deleteDocument, "string", "string"),
  savePlace: call(savePlace, "string", "string|null", "data"),
  deletePlace: call(deletePlace, "string", "string"),
  markPlaceQrGenerated: markPlaceQrGeneratedSignedIn,
  downloadPlaceQrCode: call(downloadPlaceQrCode, "string", "string", "string?"),
  saveGeolocation: call(saveGeolocation, "string", "data"),
  deleteGeolocation: call(deleteGeolocation, "string"),
}

/** Reachable without a token: the same four steps the web offers a signed-out visitor. */
export const publicActions: readonly string[] = ["signUp", "forgotPassword", "resetPassword", "verifyEmail"]
