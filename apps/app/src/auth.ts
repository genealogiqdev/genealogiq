import { createAuth, googleCredentialsFromEnv } from "@genealogiq/auth"
import { createMobileAuth } from "@genealogiq/auth/mobile"
import type { AppPrincipal } from "@genealogiq/auth/types"
import type { Profile } from "next-auth"
import { resolveLocale } from "@genealogiq/i18n/server"
import { prisma } from "@/lib/prisma"
import { authConfig } from "@/auth.config"

// Exported (not inline) so the verify-email auto-login route can map an
// AppUser row to the same principal shape a normal login produces, without
// duplicating this mapping.
export function toPrincipal(u: { id: string; email: string | null; firstName: string; lastName: string; role: string }): AppPrincipal {
  return {
    id:    u.id,
    email: u.email ?? "",
    name:  `${u.firstName} ${u.lastName}`,
    role:  u.role,
  }
}

// Google's `given_name`/`family_name` cover almost every real profile; the
// `name`-splitting fallback (and the "Google User" one below it) only exist
// for the rare profile missing both — firstName/lastName are NOT NULL columns.
function splitGoogleName(profile: Profile): { firstName: string; lastName: string } {
  if (profile.given_name) return { firstName: profile.given_name, lastName: profile.family_name || profile.given_name }
  const parts = (profile.name ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: "Google", lastName: "User" }
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

async function createUserFromGoogleProfile(profile: Profile) {
  const { firstName, lastName } = splitGoogleName(profile)
  return prisma.appUser.create({
    data: {
      email: profile.email!.toLowerCase(), // resolveGoogleSignIn already required profile.email + email_verified
      firstName,
      lastName,
      password: null,
      emailVerified: new Date(), // Google already proved ownership — same trust signUp gives after the email-link click
      role: "APP_USER",
      avatarUrl: profile.picture ?? null,
      preferredLocale: await resolveLocale(),
      googleId: profile.sub,
    },
  })
}

function syncGoogleLink(row: { id: string; emailVerified: Date | null }, profile: Profile) {
  return prisma.appUser.update({
    where: { id: row.id },
    data: {
      googleId: profile.sub,
      // Unblocks a stuck signup (never clicked the verification email) — a
      // successful Google sign-in is equally strong proof of email ownership.
      // Never overwrites an already-set timestamp.
      ...(row.emailVerified ? {} : { emailVerified: new Date() }),
    },
  })
}

// Resolved once at module scope, outside createAuth's own generic call, so
// referencing it below is a plain value (not a nested generic call) — keeps
// Row's inference shared with the sibling properties. See
// googleCredentialsFromEnv's own comment in packages/auth/src/node.ts.
const googleCreds = googleCredentialsFromEnv()

const nextAuth = createAuth({
  edgeConfig: authConfig,
  loadUserByEmail: (email) => prisma.appUser.findFirst({ where: { email } }),
  resetLockout: (id) =>
    prisma.appUser.update({ where: { id }, data: { failedLoginAttempts: 0, lockedUntil: null } }),
  // Wrapped (not passed by reference) so `u`'s type is still inferred from
  // createAuth's generic context here, same as before this was extracted —
  // passing the standalone toPrincipal directly makes TS's generic inference
  // fall back to the narrower AuthUserRow constraint instead of the actual
  // AppUser row shape, which then rejects the call as missing fields.
  toPrincipal: (u) => toPrincipal(u),
  // Memorial/ghost rows (role !== APP_USER) must never authenticate —
  // loadUserByEmail has no role filter, and unlike Credentials (blocked
  // incidentally by no password ever being set on those rows), the Google
  // auto-link path only requires an email match.
  extraGate: (u) => u.role === "APP_USER",
  google: googleCreds && {
    ...googleCreds,
    allowSelfSignup: true, // public app — mirrors the existing signUp action
    createUserFromGoogleProfile,
    syncGoogleLink,
  },
})

export const { handlers, signIn, signOut } = nextAuth

// Native (Expo) clients authenticate with a bearer token instead of the session
// cookie. Same identity rules as the web sign-in; the row is reloaded per request.
export const mobileAuth = createMobileAuth({
  cookieName: authConfig.cookies.sessionToken.name,
  loadUserById: (id) => prisma.appUser.findUnique({ where: { id } }),
  loadUserByEmail: (email) => prisma.appUser.findFirst({ where: { email } }),
  resetLockout: (id) =>
    prisma.appUser.update({ where: { id }, data: { failedLoginAttempts: 0, lockedUntil: null } }),
  persistFailedLogin: (id, data) => prisma.appUser.update({ where: { id }, data }),
  extraGate: (u) => u.role === "APP_USER",
  toPrincipal: (u) => ({ ...toPrincipal(u), image: u.avatarUrl }),
})

// Cookie session first (browser), bearer token second (mobile). Every guard,
// query, action and route handler that calls auth() accepts both.
export const auth = mobileAuth.withBearer(() => nextAuth.auth())
