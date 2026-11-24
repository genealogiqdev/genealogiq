import { createAuth, googleCredentialsFromEnv } from "@genealogiq/auth"
import { createMobileAuth } from "@genealogiq/auth/mobile"
import type { Profile } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authConfig } from "@/auth.config"
import { isBmsStaff } from '@/lib/staff-scope'

function syncGoogleLink(row: { id: string; emailVerified: Date | null }, profile: Profile) {
  return prisma.user.update({
    where: { id: row.id },
    data: {
      googleId: profile.sub,
      ...(row.emailVerified ? {} : { emailVerified: new Date() }),
    },
  })
}

// Resolved once at module scope — see googleCredentialsFromEnv's own comment
// in packages/auth/src/node.ts for why this can't be called inline below.
const googleCreds = googleCredentialsFromEnv()

const nextAuth = createAuth({
  edgeConfig: authConfig,
  loadUserByEmail: (email) => prisma.user.findUnique({ where: { email } }),
  resetLockout: (id) =>
    prisma.user.update({ where: { id }, data: { failedLoginAttempts: 0, lockedUntil: null } }),
  extraGate: (user) => isBmsStaff(user),
  toPrincipal: (u) => ({
    id:    u.id,
    email: u.email,
    name:  `${u.firstName} ${u.lastName}`,
    role:  u.role,
    image: u.avatarUrl,
  }),
  google: googleCreds && {
    ...googleCreds,
    // No createUserFromGoogleProfile — internal staff portal, invite-only.
    // An unmatched email is simply rejected, never auto-registered as staff.
    allowSelfSignup: false,
    syncGoogleLink,
  },
})

export const { handlers, signIn, signOut } = nextAuth

// Native (Expo) clients authenticate with a bearer token instead of the session
// cookie. Same identity rules as the web sign-in; the row is reloaded per request.
export const mobileAuth = createMobileAuth({
  cookieName: authConfig.cookies.sessionToken.name,
  loadUserById: (id) => prisma.user.findUnique({ where: { id } }),
  loadUserByEmail: (email) => prisma.user.findUnique({ where: { email } }),
  resetLockout: (id) =>
    prisma.user.update({ where: { id }, data: { failedLoginAttempts: 0, lockedUntil: null } }),
  persistFailedLogin: (id, data) => prisma.user.update({ where: { id }, data }),
  extraGate: (u) => isBmsStaff(u),
  toPrincipal: (u) => ({
    id:    u.id,
    email: u.email,
    name:  `${u.firstName} ${u.lastName}`,
    role:  u.role,
    image: u.avatarUrl,
  }),
})

// Cookie session first (browser), bearer token second (mobile). Every guard,
// query, action and route handler that calls auth() accepts both.
export const auth = mobileAuth.withBearer(() => nextAuth.auth())
