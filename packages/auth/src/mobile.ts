import "server-only"

import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { encode, decode } from "next-auth/jwt"
import { checkRateLimit, getClientIp, TooManyRequestsError } from "@genealogiq/services/rate-limit"
import { authorizeUser } from "./authorize"
import { ForbiddenError, NotFoundError } from "./authz"
import { SESSION_MAX_AGE_SECONDS } from "./edge"
import { lockoutRemainingMinutes, nextFailedLoginState } from "./lockout"
import { buildSessionToken } from "./session-token"
import { SignInSchema } from "./schemas"
import type { AppPrincipal, AuthUserRow } from "./types"

/**
 * Native-client (Expo) authentication.
 *
 * A mobile token is the same stateless JWT a browser session uses, encrypted
 * with the app's AUTH_SECRET but a DIFFERENT salt than the session cookie. A
 * mobile token therefore cannot be replayed as a cookie and a stolen cookie
 * cannot be replayed as a bearer token. Unlike the cookie path, the bearer path
 * reloads the identity row on every request, so deactivation, role changes and
 * tenant changes apply immediately.
 */

export interface MobileSession {
  user: {
    id: string
    name: string
    email: string
    image: string | null
    role: string
    customerId?: string
  }
  expires: string
}

export interface CreateMobileAuthOptions<Row extends AuthUserRow> {
  /** The app's session cookie name; the mobile salt is derived from it. */
  cookieName: string
  loadUserById: (id: string) => Promise<Row | null>
  loadUserByEmail: (email: string) => Promise<Row | null>
  toPrincipal: (row: Row) => AppPrincipal
  resetLockout: (id: string) => Promise<unknown>
  persistFailedLogin: (
    id: string,
    state: { failedLoginAttempts: number; lockedUntil: Date | null },
  ) => Promise<unknown>
  /** Same per-app gate the web sign-in applies (APP: APP_USER, SEQ: tenant, BMS: staff). */
  extraGate?: (row: Row) => boolean
}

function secret(): string {
  const value = process.env.AUTH_SECRET
  if (!value) throw new Error("AUTH_SECRET is not configured")
  return value
}

const mobileSalt = (cookieName: string) => `${cookieName}.mobile`

function bearerFrom(value: string | null): string | null {
  if (!value) return null
  const match = /^Bearer\s+(.+)$/i.exec(value.trim())
  return match ? match[1] : null
}

export type MobileErrorCode =
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "invalidData"
  | "tooManyRequests"
  | "accountLocked"
  | "verifyEmailFirst"
  | "incorrectCredentials"
  | "wrongSystem"
  | "unknownOperation"
  | "serverError"

export function mobileError(
  status: number,
  code: MobileErrorCode,
  values?: Record<string, string | number>,
): NextResponse {
  return NextResponse.json({ error: { code, ...(values ? { values } : {}) } }, { status })
}

/** JSON that survives Prisma BigInt columns (Decimal and Date already define toJSON). */
export function mobileJson(data: unknown, init?: ResponseInit): NextResponse {
  const body = JSON.stringify(data ?? null, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  )
  return new NextResponse(body, {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(init?.headers ?? {}) },
  })
}

function digestOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("digest" in error)) return null
  const digest = (error as { digest?: unknown }).digest
  return typeof digest === "string" ? digest : null
}

/**
 * Translate what guards, queries and server actions throw into a JSON response.
 * `redirect()` to the sign-in page means "no valid session"; any other redirect
 * is how a server action reports success, so the destination is returned.
 */
export function mobileErrorResponse(error: unknown): NextResponse {
  const digest = digestOf(error)
  if (digest?.startsWith("NEXT_REDIRECT;")) {
    const destination = digest.split(";").slice(2, -2).join(";")
    // Guards send signed-out callers to "/sign-in" (optionally with a
    // callbackUrl). "/sign-in?reset=true" is the password-reset success path.
    if (destination === "/sign-in" || destination.startsWith("/sign-in?callbackUrl=")) {
      return mobileError(401, "unauthorized")
    }
    return mobileJson({ result: { ok: true }, redirect: destination })
  }
  if (digest?.startsWith("NEXT_HTTP_ERROR_FALLBACK;")) {
    const status = Number(digest.split(";")[1])
    if (status === 401) return mobileError(401, "unauthorized")
    if (status === 403) return mobileError(403, "forbidden")
    if (status === 404) return mobileError(404, "notFound")
  }
  if (error instanceof ForbiddenError) return mobileError(403, "forbidden")
  if (error instanceof NotFoundError) return mobileError(404, "notFound")
  if (error instanceof TooManyRequestsError) {
    return mobileError(429, "tooManyRequests", { seconds: error.retryAfter })
  }
  console.error("[mobile-api]", error)
  return mobileError(500, "serverError")
}

export function createMobileAuth<Row extends AuthUserRow>(opts: CreateMobileAuthOptions<Row>) {
  async function issueToken(principal: AppPrincipal): Promise<{ token: string; expiresAt: string }> {
    const token = await encode({
      token: buildSessionToken(principal),
      secret: secret(),
      salt: mobileSalt(opts.cookieName),
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
    return { token, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString() }
  }

  function toSession(principal: AppPrincipal, expires: string): MobileSession {
    return {
      user: {
        id: principal.id,
        name: principal.name,
        email: principal.email,
        image: principal.image ?? null,
        role: principal.role,
        ...(principal.customerId ? { customerId: principal.customerId } : {}),
      },
      expires,
    }
  }

  /** Whether the current request carries an Authorization bearer header at all. */
  async function hasBearer(): Promise<boolean> {
    return bearerFrom((await headers()).get("authorization")) !== null
  }

  /**
   * Session for the current request's bearer token, or null. The identity row
   * is reloaded so the returned role/tenant are live, never the token snapshot.
   */
  async function readBearerSession(): Promise<MobileSession | null> {
    const raw = bearerFrom((await headers()).get("authorization"))
    if (!raw) return null

    let payload: Record<string, unknown> | null
    try {
      payload = (await decode({ token: raw, secret: secret(), salt: mobileSalt(opts.cookieName) })) as Record<string, unknown> | null
    } catch {
      return null
    }
    const id = typeof payload?.id === "string" ? payload.id : null
    if (!payload || !id) return null
    if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return null

    const row = await opts.loadUserById(id)
    if (!row || !row.isActive || row.emailVerified === null) return null
    if (opts.extraGate && !opts.extraGate(row)) return null

    const expires = typeof payload.exp === "number"
      ? new Date(payload.exp * 1000).toISOString()
      : new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString()
    return toSession(opts.toPrincipal(row), expires)
  }

  /**
   * Wrap the app's NextAuth `auth()` so every existing guard, query, action and
   * route handler also accepts a mobile bearer token. Cookie sessions win, so
   * browser behaviour is unchanged.
   */
  function withBearer<S>(auth: () => Promise<S | null>): () => Promise<S | null> {
    return async () => {
      const session = await auth()
      if (session) return session
      return (await readBearerSession()) as unknown as S | null
    }
  }

  /** POST { email, password } → { token, expiresAt, user } with the web sign-in's limits. */
  async function login(request: Request): Promise<NextResponse> {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return mobileError(400, "invalidData")
    }
    const validated = SignInSchema.safeParse(body)
    if (!validated.success) return mobileError(400, "invalidData")

    const ip = await getClientIp()
    const limit = await checkRateLimit({ key: `signin:ip:${ip}`, maxAttempts: 10, windowSeconds: 300 })
    if (!limit.allowed) return mobileError(429, "tooManyRequests", { seconds: limit.retryAfter })

    const row = await opts.loadUserByEmail(validated.data.email)

    const lockedMinutes = lockoutRemainingMinutes(row?.lockedUntil ?? null)
    if (lockedMinutes !== null) return mobileError(423, "accountLocked", { minutes: lockedMinutes })

    // Password first, the per-app gate second: only someone who already knows
    // the password learns that the account belongs to another system.
    const principal = await authorizeUser(validated.data, {
      loadUserByEmail: async () => row,
      toPrincipal: opts.toPrincipal,
      resetLockout: opts.resetLockout,
    })
    if (!principal || !row) {
      if (row && row.emailVerified === null) return mobileError(403, "verifyEmailFirst")
      if (row) await opts.persistFailedLogin(row.id, nextFailedLoginState(row))
      return mobileError(401, "incorrectCredentials")
    }
    if (opts.extraGate && !opts.extraGate(row)) return mobileError(403, "wrongSystem")

    const issued = await issueToken(principal)
    return mobileJson({ ...issued, user: toSession(principal, issued.expiresAt).user })
  }

  /** GET → the live session for the presented token (401 when it no longer holds). */
  async function me(): Promise<NextResponse> {
    const session = await readBearerSession()
    if (!session) return mobileError(401, "unauthorized")
    return mobileJson({ user: session.user, expiresAt: session.expires })
  }

  return { issueToken, readBearerSession, hasBearer, withBearer, login, me }
}

/* -------------------------------------------------------------------------- */
/* Operation bridge                                                            */
/* -------------------------------------------------------------------------- */

export type MobileParams = Record<string, string>

/** A read: receives the query-string parameters. It must apply its own guard. */
export type MobileView = (params: MobileParams, request: Request) => Promise<unknown>

/** A write: receives the decoded JSON body. The wrapped action applies its own guard. */
export type MobileAction = (input: MobileActionInput, request: Request) => Promise<unknown>

export interface MobileActionInput {
  /** Positional arguments for actions with a typed signature. */
  args: unknown[]
  /** Field values for actions that read a FormData. */
  form: FormData
}

type AnyFn = (...args: never[]) => Promise<unknown>

/** Register an action called with positional arguments: `fn(...args)`. */
export function args<F extends AnyFn>(fn: F): MobileAction {
  return ({ args: list }) => (fn as unknown as (...a: unknown[]) => Promise<unknown>)(...list)
}

/** Register a `useActionState` action: `fn(prevState, formData)`. */
export function form<F extends AnyFn>(fn: F): MobileAction {
  return ({ form: data }) => (fn as unknown as (p: unknown, f: FormData) => Promise<unknown>)(undefined, data)
}

/** Register a bound form action: `fn(...args, prevState, formData)`. */
export function boundForm<F extends AnyFn>(fn: F): MobileAction {
  return ({ args: list, form: data }) =>
    (fn as unknown as (...a: unknown[]) => Promise<unknown>)(...list, undefined, data)
}

function toFormData(value: unknown): FormData {
  const data = new FormData()
  if (typeof value !== "object" || value === null) return data
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || entry === undefined) continue
    if (Array.isArray(entry)) {
      for (const item of entry) data.append(key, String(item))
    } else if (typeof entry === "object") {
      data.append(key, JSON.stringify(entry))
    } else {
      data.append(key, String(entry))
    }
  }
  return data
}

export interface MobileRouteOptions {
  /** Whether a bearer header is present on this request. */
  hasBearer: () => Promise<boolean>
  /** Operation names reachable without a token (sign-up, password reset, public profile…). */
  publicNames?: readonly string[]
}

type RouteContext = { params: Promise<{ name: string }> }

/**
 * Mobile operations require an Authorization header even though the guards
 * would also accept a cookie session: a custom header cannot be sent
 * cross-site without a CORS preflight these routes never grant, which keeps
 * the JSON write surface out of reach of browser CSRF.
 */
async function gate(name: string, opts: MobileRouteOptions): Promise<NextResponse | null> {
  if (opts.publicNames?.includes(name)) return null
  return (await opts.hasBearer()) ? null : mobileError(401, "unauthorized")
}

export function createViewRoute(registry: Record<string, MobileView>, opts: MobileRouteOptions) {
  return async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
    const { name } = await context.params
    const view = Object.hasOwn(registry, name) ? registry[name] : undefined
    if (!view) return mobileError(404, "unknownOperation")
    const denied = await gate(name, opts)
    if (denied) return denied
    try {
      const params = Object.fromEntries(new URL(request.url).searchParams.entries())
      return mobileJson({ data: await view(params, request) })
    } catch (error) {
      return mobileErrorResponse(error)
    }
  }
}

export function createActionRoute(registry: Record<string, MobileAction>, opts: MobileRouteOptions) {
  return async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
    const { name } = await context.params
    const action = Object.hasOwn(registry, name) ? registry[name] : undefined
    if (!action) return mobileError(404, "unknownOperation")
    const denied = await gate(name, opts)
    if (denied) return denied

    let body: { args?: unknown; form?: unknown }
    try {
      body = (await request.json()) as { args?: unknown; form?: unknown }
    } catch {
      return mobileError(400, "invalidData")
    }
    if (typeof body !== "object" || body === null) return mobileError(400, "invalidData")
    if (body.args !== undefined && !Array.isArray(body.args)) return mobileError(400, "invalidData")

    try {
      const result = await action(
        { args: (body.args as unknown[] | undefined) ?? [], form: toFormData(body.form) },
        request,
      )
      return mobileJson({ result: result ?? { ok: true } })
    } catch (error) {
      return mobileErrorResponse(error)
    }
  }
}
