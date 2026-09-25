"use server"

import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { z, flattenError } from "zod"
import { getTranslations } from "next-intl/server"
import { signIn, signOut } from "@/auth"
import { prisma } from "@/lib/prisma"
import { SetupSchema, ResetPasswordSchema, ChangePasswordSchema, ChangeEmailSchema, DeleteAccountSchema } from "@/lib/auth"
import { getCompanySchema, type CompanyFormValues } from "@/schemas/company.schema"
import { identityTranslator } from "@/schemas/i18n"
import { sendPasswordResetEmail, sendEmailChangeEmail, sendAccountDeletionEmail } from "@/lib/email"
import { verifySession } from "@/lib/dal"
import { getClientIp, checkRateLimit } from "@/lib/rate-limit"
import { hashToken, done, fail, type ActionResult } from "@genealogiq/core"
import { createLoginAction } from "@genealogiq/auth/login"
import { deleteUnreferencedMediaUrls } from "@genealogiq/services/media-storage"
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
    prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true, lockedUntil: true, failedLoginAttempts: true },
    }),
  persistFailedLogin: (id, data) => prisma.user.update({ where: { id }, data }),
  redirectTo: "/dashboard",
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

export async function setupSystem(
  companyData: CompanyFormValues,
  adminData: { firstName: string; lastName: string; email: string; password: string },
): Promise<ActionResult> {
  const t = await getTranslations("Actions")

  const count = await prisma.user.count()
  if (count > 0) return fail(t("auth.systemAlreadyConfigured"))

  const companyValidated = getCompanySchema(identityTranslator).safeParse(companyData)
  if (!companyValidated.success) return fail(t("auth.invalidCompanyData"))

  const adminValidated = SetupSchema.safeParse(adminData)
  if (!adminValidated.success) return fail(t("auth.invalidAdminData"))

  const { password, ...adminRest } = adminValidated.data

  const existing = await prisma.user.findUnique({ where: { email: adminRest.email }, select: { id: true } })
  if (existing) return fail(t("auth.emailInUse"))

  const hashedPassword = await bcrypt.hash(password, 12)

  const { address, ...companyRest } = companyValidated.data

  const addressCreate = address && Object.values(address).some(Boolean)
    ? { create: address }
    : undefined

  await prisma.$transaction([
    prisma.company.create({ data: { ...companyRest, address: addressCreate } }),
    prisma.user.create({
      data: { ...adminRest, password: hashedPassword, role: "SUPER_ADMIN", emailVerified: new Date() },
    }),
  ])

  redirect("/sign-in")
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

  const user = await prisma.user.findUnique({
    where: { email: validated.data },
    select: { id: true },
  })

  // Identical response regardless of whether email exists (prevents enumeration)
  if (!user) redirect("/forgot-password?sent=true")

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })

  const token = randomBytes(32).toString("hex")
  await prisma.passwordResetToken.create({
    data: { token: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  })

  await sendPasswordResetEmail(validated.data, token)
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
    select: { userId: true, expiresAt: true },
  })

  // userId is nullable in the schema (also supports AppUser tokens written by
  // SEQ/APP); BMS only ever issues User-bound tokens, so reject if absent.
  if (!record || !record.userId || record.expiresAt < new Date()) {
    return fail(t("auth.invalidOrExpiredLink"))
  }
  const userId = record.userId

  const hashedPassword = await bcrypt.hash(validated.data.password, 12)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    }),
    prisma.passwordResetToken.delete({ where: { token: hashToken(token) } }),
  ])

  redirect("/sign-in?reset=true")
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  })
  if (!user?.password) return fail(t("auth.userNotFound"))

  const match = await bcrypt.compare(validated.data.currentPassword, user.password)
  if (!match) return failFields(t("common.invalidData"), { currentPassword: [t("auth.incorrectCurrentPassword")] })

  const same = await bcrypt.compare(validated.data.newPassword, user.password)
  if (same) return failFields(t("common.invalidData"), { newPassword: [t("auth.newPasswordMustDiffer")] })

  const hashed = await bcrypt.hash(validated.data.newPassword, 12)
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } })

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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, password: true },
  })
  if (!user?.password) return fail(t("auth.userNotFound"))

  if (validated.data.newEmail === user.email) {
    return failFields(t("common.invalidData"), { newEmail: [t("auth.emailMustDiffer")] })
  }

  const match = await bcrypt.compare(validated.data.currentPassword, user.password)
  if (!match) return failFields(t("common.invalidData"), { currentPassword: [t("auth.incorrectPassword")] })

  const existing = await prisma.user.findUnique({ where: { email: validated.data.newEmail } })
  if (existing) return failFields(t("common.invalidData"), { newEmail: [t("auth.emailInUse")] })

  await prisma.emailToken.deleteMany({ where: { userId, type: 'CHANGE' } })

  const token = randomBytes(32).toString("hex")
  await prisma.emailToken.create({
    data: {
      token: hashToken(token),
      type: 'CHANGE',
      userId,
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, password: true, avatarUrl: true, cover_url: true },
  })
  if (!user?.password) return fail(t("auth.userNotFound"))

  const match = await bcrypt.compare(validated.data.currentPassword, user.password)
  if (!match) return failFields(t("common.invalidData"), { currentPassword: [t("auth.incorrectPassword")] })

  await sendAccountDeletionEmail(user.email)
  await prisma.user.delete({ where: { id: userId } })
  await deleteUnreferencedMediaUrls([user.avatarUrl, user.cover_url])

  await signOut({ redirectTo: "/" })
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/" })
}
