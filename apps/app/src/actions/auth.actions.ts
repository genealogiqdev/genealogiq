"use server"

import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { z, flattenError } from "zod"
import { getTranslations } from "next-intl/server"
import { signIn, signOut } from "@/auth"
import { prisma } from "@/lib/prisma"
import {
  ResetPasswordSchema,
  ChangePasswordSchema,
  ChangeEmailSchema,
  DeleteAccountSchema,
} from "@/lib/auth"
import { getSignUpSchema } from "@/schemas/auth.schema"
import { identityTranslator } from "@/schemas/i18n"
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendEmailChangeEmail,
  sendAccountDeletionEmail,
  sendAccountExistsEmail,
} from "@/lib/email"
import { verifySession } from "@/lib/dal"
import { safeCallback } from "@/lib/safe-callback"
import { resolveLocale } from "@genealogiq/i18n/server"
import { deleteBlobs } from "@/lib/blob"
import { getClientIp, checkRateLimit } from "@/lib/rate-limit"
import { hashToken, done, fail, type ActionResult } from "@genealogiq/core"
import { createLoginAction } from "@genealogiq/auth/login"
import { randomBytes } from "crypto"

// The useActionState forms render two things: a banner (the discriminated
// ActionResult's `message`) AND per-field validation errors INLINE next to each
// input. The canonical ActionResult union carries no per-field slot, so failures
// here widen it with an optional `fieldErrors`. `undefined` is a valid seed.
type FieldErrors = Record<string, string[] | undefined>
type AuthState = (ActionResult & { fieldErrors?: FieldErrors }) | undefined

// fail() with inline per-field errors, preserving the ActionResult failure shape.
const failFields = (message: string, fieldErrors?: FieldErrors): AuthState => ({
  ...fail(message),
  fieldErrors,
})

const _login = createLoginAction({
  signIn,
  loadLockoutFields: (email) =>
    prisma.appUser.findFirst({
      where: { email },
      select: { id: true, emailVerified: true, lockedUntil: true, failedLoginAttempts: true },
    }),
  persistFailedLogin: (id, data) => prisma.appUser.update({ where: { id }, data }),
  redirectTo: "/home",
})

export async function login(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const result = await _login(prevState, formData)
  // _login (shared @genealogiq/auth/login) returns { errorKey, values? } | undefined.
  // Success throws a redirect; a returned error means failure.
  if (!result) return undefined
  const t = await getTranslations("Actions")
  const key = result.errorKey === "invalidData" ? "common.invalidData" : `auth.${result.errorKey}`
  return fail(t(key, result.values))
}

export async function signUp(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations("Actions")

  const data = {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
  }

  const validated = getSignUpSchema(identityTranslator, identityTranslator).safeParse(data)
  if (!validated.success) {
    return failFields(t("common.invalidData"), flattenError(validated.error).fieldErrors)
  }

  const ip    = await getClientIp()
  const limit = await checkRateLimit({ key: `signup:ip:${ip}`, maxAttempts: 5, windowSeconds: 3600 })
  if (!limit.allowed) return fail(t("auth.tooManySignUpAttempts", { minutes: Math.ceil(limit.retryAfter / 60) }))

  // Carry the post-verification destination (e.g. /qr/<code>) into the email link
  // so the buyer returns to the activation flow after confirming their email.
  const callbackUrl = safeCallback(formData.get("callbackUrl") as string | null)

  const existing = await prisma.appUser.findFirst({
    where: { email: validated.data.email },
    select: { id: true, firstName: true },
  })
  if (existing) {
    // Redirect identically to the success path instead of revealing that the
    // email is taken — an "email already in use" response is a user-enumeration
    // oracle. The actual account owner is notified by email instead.
    await sendAccountExistsEmail(validated.data.email, existing.firstName ?? undefined)
    redirect("/verify-email")
  }

  const hashedPassword = await bcrypt.hash(validated.data.password, 12)

  const user = await prisma.appUser.create({
    data: {
      firstName: validated.data.firstName,
      lastName: validated.data.lastName,
      email: validated.data.email,
      password: hashedPassword,
      role: "APP_USER",
      // Seed push-payload localization from the request locale (cookie → geo
      // header → en-US); the language switcher keeps it updated afterwards.
      preferredLocale: await resolveLocale(),
    },
    select: { id: true },
  })

  await prisma.emailToken.deleteMany({ where: { appUserId: user.id, type: "VERIFICATION" } })

  const token = randomBytes(32).toString("hex")
  await prisma.emailToken.create({
    data: {
      token: hashToken(token),
      type: "VERIFICATION",
      appUserId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })

  await sendVerificationEmail(validated.data.email, token, validated.data.firstName, callbackUrl ?? undefined)

  redirect("/verify-email")
}

export async function forgotPassword(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations("Actions")

  const email = formData.get("email")
  const validated = z.string().email("Invalid email").safeParse(email)
  if (!validated.success) return fail(t("auth.invalidEmail"))

  const ip    = await getClientIp()
  const limit = await checkRateLimit({ key: `forgot:ip:${ip}`, maxAttempts: 3, windowSeconds: 3600 })
  if (!limit.allowed) return fail(t("auth.tooManyRequests", { minutes: Math.ceil(limit.retryAfter / 60) }))

  const user = await prisma.appUser.findFirst({
    where: { email: validated.data },
    select: { id: true, email: true },
  })

  if (!user) redirect("/forgot-password?sent=true")

  await prisma.passwordResetToken.deleteMany({ where: { appUserId: user.id } })

  const token = randomBytes(32).toString("hex")
  await prisma.passwordResetToken.create({
    data: { token: hashToken(token), appUserId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  })

  await sendPasswordResetEmail(user.email!, token)
  redirect("/forgot-password?sent=true")
}

export async function resetPassword(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations("Actions")

  const token = formData.get("token") as string
  const validated = ResetPasswordSchema.safeParse({ password: formData.get("password") })

  if (!validated.success) {
    return failFields(t("common.invalidData"), flattenError(validated.error).fieldErrors)
  }

  const ip    = await getClientIp()
  const limit = await checkRateLimit({ key: `reset:ip:${ip}`, maxAttempts: 5, windowSeconds: 3600 })
  if (!limit.allowed) return fail(t("auth.tooManyAttempts", { minutes: Math.ceil(limit.retryAfter / 60) }))

  const record = await prisma.passwordResetToken.findUnique({
    where: { token: hashToken(token) },
    select: { appUserId: true, userId: true, expiresAt: true },
  })

  if (!record || record.expiresAt < new Date()) {
    return fail(t("auth.invalidOrExpiredLink"))
  }

  // appUserId for new tokens; userId as fallback for tokens created before Phase 3
  const appUserId = record.appUserId ?? record.userId!
  const hashedPassword = await bcrypt.hash(validated.data.password, 12)

  await prisma.$transaction([
    prisma.appUser.update({
      where: { id: appUserId },
      data: { password: hashedPassword, emailVerified: new Date() },
    }),
    prisma.passwordResetToken.delete({ where: { token: hashToken(token) } }),
  ])

  // Preserve a deep-link destination (e.g. /qr/<code> from a platform sale) so the
  // user continues to it after signing in with their new password.
  const callbackUrl = safeCallback(formData.get("callbackUrl") as string | null)
  redirect(callbackUrl ? `/sign-in?reset=true&callbackUrl=${encodeURIComponent(callbackUrl)}` : "/sign-in?reset=true")
}

export async function changePassword(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const validated = ChangePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  })
  if (!validated.success) return failFields(t("common.invalidData"), flattenError(validated.error).fieldErrors)

  const userId = session.user!.id!
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { password: true },
  })
  if (!user?.password) return fail(t("auth.userNotFound"))

  const match = await bcrypt.compare(validated.data.currentPassword, user.password)
  if (!match) return failFields(t("common.invalidData"), { currentPassword: [t("auth.incorrectCurrentPassword")] })

  const same = await bcrypt.compare(validated.data.newPassword, user.password)
  if (same) return failFields(t("common.invalidData"), { newPassword: [t("auth.newPasswordMustDiffer")] })

  const hashed = await bcrypt.hash(validated.data.newPassword, 12)
  await prisma.appUser.update({ where: { id: userId }, data: { password: hashed } })

  return done(t("auth.passwordChanged"))
}

export async function requestEmailChange(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const validated = ChangeEmailSchema.safeParse({
    newEmail: formData.get("newEmail"),
    currentPassword: formData.get("currentPassword"),
  })
  if (!validated.success) return failFields(t("common.invalidData"), flattenError(validated.error).fieldErrors)

  const ip    = await getClientIp()
  const limit = await checkRateLimit({ key: `change-email:ip:${ip}`, maxAttempts: 5, windowSeconds: 3600 })
  if (!limit.allowed) return fail(t("auth.tooManyAttempts", { minutes: Math.ceil(limit.retryAfter / 60) }))

  const userId = session.user!.id!
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { email: true, password: true },
  })
  if (!user?.password) return fail(t("auth.userNotFound"))

  if (validated.data.newEmail === user.email) {
    return failFields(t("common.invalidData"), { newEmail: [t("auth.emailMustDiffer")] })
  }

  const match = await bcrypt.compare(validated.data.currentPassword, user.password)
  if (!match) return failFields(t("common.invalidData"), { currentPassword: [t("auth.incorrectPassword")] })

  const existing = await prisma.appUser.findFirst({ where: { email: validated.data.newEmail } })
  if (existing) return failFields(t("common.invalidData"), { newEmail: [t("auth.emailInUse")] })

  await prisma.emailToken.deleteMany({ where: { appUserId: userId, type: "CHANGE" } })

  const token = randomBytes(32).toString("hex")
  await prisma.emailToken.create({
    data: {
      token: hashToken(token),
      type: "CHANGE",
      appUserId: userId,
      newEmail: validated.data.newEmail,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  })

  await sendEmailChangeEmail(validated.data.newEmail, token)

  return done(t("auth.emailChangeLinkSent"))
}

export async function deleteAccount(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const validated = DeleteAccountSchema.safeParse({ currentPassword: formData.get("currentPassword") })
  if (!validated.success) return failFields(t("common.invalidData"), flattenError(validated.error).fieldErrors)

  const userId = session.user!.id!
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { email: true, password: true },
  })
  if (!user?.password) return fail(t("auth.userNotFound"))

  const match = await bcrypt.compare(validated.data.currentPassword, user.password)
  if (!match) return failFields(t("common.invalidData"), { currentPassword: [t("auth.incorrectPassword")] })

  const [ownProfile, ownBio, ownGallery, ownGeo, ownTributesAuthored, ownTributesReceived, ownDocuments, ownPlaces] =
    await Promise.all([
      prisma.appUser.findUnique({ where: { id: userId }, select: { avatarUrl: true } }),
      prisma.bio.findUnique({ where: { userId }, select: { images: { select: { url: true } } } }),
      prisma.galleryItem.findMany({ where: { userId }, select: { url: true, poster: true } }),
      prisma.geolocation.findUnique({ where: { userId }, select: { photo1: true, photo2: true, photo3: true } }),
      prisma.tribute.findMany({ where: { authorId: userId }, select: { imageUrl: true } }),
      prisma.tribute.findMany({ where: { profileId: userId }, select: { imageUrl: true } }),
      prisma.document.findMany({ where: { userId }, select: { fileUrl: true } }),
      prisma.geoPlace.findMany({ where: { userId }, select: { photos: true } }),
    ])

  const memorials = await prisma.appUser.findMany({
    where: { role: "APP_MEMO", guardedBy: { some: { guardianId: userId, status: "ACCEPTED" } } },
    select: { id: true, avatarUrl: true },
  })
  // A pet with another accepted guardian must survive account deletion. Pets
  // managed only by this account follow the same lifecycle as its memorials.
  const pets = await prisma.appUser.findMany({
    where: {
      role: "APP_PET",
      guardedBy: {
        some: { guardianId: userId, status: "ACCEPTED" },
        none: { guardianId: { not: userId }, status: "ACCEPTED" },
      },
    },
    select: { id: true, avatarUrl: true },
  })
  const managedProfiles = [...memorials, ...pets]
  const managedProfileIds = managedProfiles.map((profile) => profile.id)
  const [managedBios, managedGallery, managedTributes, managedGeos, managedDocuments, managedPlaces] = managedProfileIds.length > 0
    ? await Promise.all([
        prisma.bio.findMany({ where: { userId: { in: managedProfileIds } }, select: { images: { select: { url: true } } } }),
        prisma.galleryItem.findMany({ where: { userId: { in: managedProfileIds } }, select: { url: true, poster: true } }),
        prisma.tribute.findMany({ where: { profileId: { in: managedProfileIds } }, select: { imageUrl: true } }),
        prisma.geolocation.findMany({ where: { userId: { in: managedProfileIds } }, select: { photo1: true, photo2: true, photo3: true } }),
        prisma.document.findMany({ where: { userId: { in: managedProfileIds } }, select: { fileUrl: true } }),
        prisma.geoPlace.findMany({ where: { userId: { in: managedProfileIds } }, select: { photos: true } }),
      ])
    : [[], [], [], [], [], []]

  const blobUrls = [
    ownProfile?.avatarUrl,
    ...(ownBio?.images.map((i) => i.url) ?? []),
    ...ownGallery.flatMap((item) => [item.url, item.poster]),
    ownGeo?.photo1, ownGeo?.photo2, ownGeo?.photo3,
    ...ownTributesAuthored.map((t) => t.imageUrl),
    ...ownTributesReceived.map((t) => t.imageUrl),
    ...ownDocuments.map((document) => document.fileUrl),
    ...ownPlaces.flatMap((place) => place.photos),
    ...managedProfiles.map((profile) => profile.avatarUrl),
    ...managedBios.flatMap((bio) => bio.images.map((image) => image.url)),
    ...managedGallery.flatMap((item) => [item.url, item.poster]),
    ...managedTributes.map((tribute) => tribute.imageUrl),
    ...managedGeos.flatMap((geo) => [geo.photo1, geo.photo2, geo.photo3]),
    ...managedDocuments.map((document) => document.fileUrl),
    ...managedPlaces.flatMap((place) => place.photos),
  ]

  if (managedProfileIds.length > 0) {
    await prisma.appUser.deleteMany({ where: { id: { in: managedProfileIds } } })
  }

  await sendAccountDeletionEmail(user.email!)
  await prisma.appUser.delete({ where: { id: userId } })
  await deleteBlobs(blobUrls)

  await signOut({ redirectTo: "/sign-in" })
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/sign-in" })
}
