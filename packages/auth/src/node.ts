import NextAuth, { type NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { authorizeUser } from "./authorize"
import { resolveGoogleSignIn, type GoogleAuthOptions } from "./google"
import { SESSION_MAX_AGE_SECONDS } from "./edge"
import type { AppPrincipal, AuthUserRow } from "./types"

export { buildSessionToken } from "./session-token"
import { buildSessionToken } from "./session-token"

export interface CreateAuthOptions<Row extends AuthUserRow> {
  /** Edge-safe config from createEdgeAuthConfig() — provides cookies, pages,
   *  the session + authorized callbacks. */
  edgeConfig: NextAuthConfig
  /** App-specific identity lookup (prisma.user / prisma.appUser by email). */
  loadUserByEmail: (email: string) => Promise<Row | null>
  /** Map the loaded row to the canonical principal stored in the session. */
  toPrincipal: (row: Row) => AppPrincipal
  /** Clear failedLoginAttempts/lockedUntil on the app's identity table.
   *  Returns the prisma update promise (any value) — we only await it. */
  resetLockout: (id: string) => Promise<unknown>
  /** Optional extra gate after password check (SEQ: row must have a tenantId).
   *  Applied identically on the Credentials AND Google paths (both read this
   *  same opts object), so the two providers cannot drift apart. */
  extraGate?: (row: Row) => boolean
  /** Omitted, or GOOGLE_CLIENT_ID/SECRET unset for this app's env (see
   *  resolveGoogleOptions() below) = provider not registered at all — zero
   *  behavior change for apps that haven't provisioned Google OAuth yet. */
  google?: GoogleAuthOptions<Row>
}

/**
 * The single canonical NextAuth setup for all three apps. The credential
 * `authorize` flow is identical everywhere — including UNIFORM lockout
 * enforcement (`lockedUntil`), which previously only APP did. Apps supply only
 * their identity lookup, field mapping, lockout reset, and optional extra gate.
 */
export function createAuth<Row extends AuthUserRow>(opts: CreateAuthOptions<Row>) {
  if (opts.google?.allowSelfSignup && !opts.google.createUserFromGoogleProfile) {
    throw new Error("createAuth: allowSelfSignup requires createUserFromGoogleProfile")
  }

  return NextAuth({
    ...opts.edgeConfig,
    // Explicit: the Credentials provider has no DB session table — sessions are
    // stateless JWTs (the edge authorized()/jwt callbacks read role/customerId
    // from the token). This is NextAuth's default for Credentials, declared here
    // so the strategy and its implications aren't implicit. `maxAge` was also
    // an implicit default — see SESSION_MAX_AGE_SECONDS's own comment in edge.ts.
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
    providers: [
      Credentials({
        credentials: { email: {}, password: {} },
        authorize: async (credentials) => {
          const principal = await authorizeUser(credentials, opts)
          // AppPrincipal is assignable to the (augmented) NextAuth User.
          return principal as unknown as (AppPrincipal & { id: string }) | null
        },
      }),
      ...(opts.google
        ? [Google({
            clientId: opts.google.clientId,
            clientSecret: opts.google.clientSecret,
            // Forces Google's account chooser instead of silently using
            // whichever Google session is already active in the browser —
            // relevant here since personal/family/work Google accounts
            // commonly coexist for the same person.
            authorization: { params: { prompt: "select_account" } },
          })]
        : []),
    ],
    callbacks: {
      ...opts.edgeConfig.callbacks,
      async signIn({ user, account, profile }) {
        // Credentials is already fully vetted inside authorize() above by the
        // time signIn ever runs for it — this callback only has real work to
        // do for Google. Defining `signIn` at all REPLACES next-auth's own
        // default (`() => true`), so every other provider must still get an
        // explicit pass-through or it would silently start failing.
        if (account?.provider !== "google") return true
        if (!opts.google) return false

        const row = await resolveGoogleSignIn(profile, { ...opts, google: opts.google })
        if (!row) return false

        // Mutates the SAME object reference NextAuth passes into jwt({user})
        // right after this callback returns (no adapter → no cloning anywhere
        // in that chain) — so the jwt callback below picks this up unchanged,
        // identically to how it already consumes Credentials' `authorize()`
        // return value.
        Object.assign(user, opts.toPrincipal(row))
        return true
      },
      jwt({ token, user, trigger, session }) {
        if (user) {
          Object.assign(token, buildSessionToken(user as unknown as AppPrincipal))
        }
        if (trigger === "update" && session && typeof session === "object" && "image" in session) {
          token.image = (session as { image: string | null }).image
        }
        return token
      },
    },
  })
}

/**
 * Standard per-app Google env-detection: missing either var disables the
 * provider entirely (Credentials-only, zero behavior change) — same
 * graceful-no-op-when-unset convention already used for VAPID/Turnstile.
 *
 * Deliberately NOT generic over Row (unlike GoogleAuthOptions<Row> itself) —
 * callers spread this into their own `google: { ...googleCredentialsFromEnv(),
 * allowSelfSignup: ..., ... }` object literal directly inside the same
 * createAuth({ ... }) call. A separate generic call here would get its own
 * independent Row inference, which can resolve to the bare AuthUserRow
 * constraint instead of the concrete Prisma row every sibling property (like
 * toPrincipal) is inferring — silently narrowing Row for the whole call.
 */
export function googleCredentialsFromEnv(): { clientId: string; clientSecret: string } | undefined {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return undefined
  return { clientId, clientSecret }
}
