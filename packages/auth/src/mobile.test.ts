import { describe, it, expect, vi, beforeEach } from "vitest"

const { compareMock, headerStore, rateLimitMock } = vi.hoisted(() => ({
  compareMock: vi.fn(),
  headerStore: { current: new Headers() },
  rateLimitMock: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("bcryptjs", () => ({ default: { compare: compareMock } }))
vi.mock("next/headers", () => ({ headers: async () => headerStore.current }))
vi.mock("@genealogiq/services/rate-limit", () => ({
  checkRateLimit: rateLimitMock,
  getClientIp: async () => "203.0.113.7",
  TooManyRequestsError: class TooManyRequestsError extends Error {
    constructor(public readonly retryAfter: number) {
      super("Too many requests")
    }
  },
}))

import { encode } from "next-auth/jwt"
import {
  args,
  boundForm,
  createActionRoute,
  createMobileAuth,
  createViewRoute,
  form,
  mobileErrorResponse,
} from "./mobile"

type Row = {
  id: string
  email: string
  password: string | null
  isActive: boolean
  emailVerified: Date | null
  failedLoginAttempts: number
  lockedUntil: Date | null
  role: string
  tenantId: string | null
}

const COOKIE = "seq.session-token"

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "u1",
    email: "ana@example.com",
    password: "hashed",
    isActive: true,
    emailVerified: new Date("2026-01-01T00:00:00Z"),
    failedLoginAttempts: 0,
    lockedUntil: null,
    role: "OWNER",
    tenantId: "tenant-1",
    ...overrides,
  }
}

function setup(current: { row: Row | null }) {
  const persistFailedLogin = vi.fn(async () => ({}))
  const resetLockout = vi.fn(async () => ({}))
  const auth = createMobileAuth<Row>({
    cookieName: COOKIE,
    loadUserById: async (id) => (current.row && current.row.id === id ? current.row : null),
    loadUserByEmail: async (email) => (current.row && current.row.email === email ? current.row : null),
    toPrincipal: (r) => ({ id: r.id, email: r.email, name: "Ana Souza", role: r.role, customerId: r.tenantId ?? undefined }),
    resetLockout,
    persistFailedLogin,
    extraGate: (r) => !!r.tenantId,
  })
  return { auth, persistFailedLogin, resetLockout }
}

const loginRequest = (body: unknown) =>
  new Request("http://localhost/api/mobile/v1/auth/login", { method: "POST", body: JSON.stringify(body) })

const withBearer = (token: string | null) => {
  headerStore.current = new Headers(token ? { authorization: `Bearer ${token}` } : {})
}

beforeEach(() => {
  process.env.AUTH_SECRET = "unit-test-secret-unit-test-secret-0123456789"
  compareMock.mockReset()
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue({ allowed: true, retryAfter: 0 })
  withBearer(null)
})

describe("mobile login", () => {
  it("issues a token whose bearer session carries the live principal", async () => {
    const current = { row: row() }
    const { auth } = setup(current)
    compareMock.mockResolvedValue(true)

    const response = await auth.login(loginRequest({ email: "ana@example.com", password: "pw" }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.user).toEqual({ id: "u1", name: "Ana Souza", email: "ana@example.com", image: null, role: "OWNER", customerId: "tenant-1" })
    expect(typeof body.token).toBe("string")

    withBearer(body.token)
    const session = await auth.readBearerSession()
    expect(session?.user).toMatchObject({ id: "u1", role: "OWNER", customerId: "tenant-1" })
  })

  it("rejects a wrong password and advances the lockout counter", async () => {
    const { auth, persistFailedLogin } = setup({ row: row({ failedLoginAttempts: 3 }) })
    compareMock.mockResolvedValue(false)

    const response = await auth.login(loginRequest({ email: "ana@example.com", password: "nope" }))
    expect(response.status).toBe(401)
    expect((await response.json()).error.code).toBe("incorrectCredentials")
    expect(persistFailedLogin).toHaveBeenCalledWith("u1", { failedLoginAttempts: 4, lockedUntil: null })
  })

  it("answers an unknown email exactly like a wrong password", async () => {
    const { auth, persistFailedLogin } = setup({ row: null })
    const response = await auth.login(loginRequest({ email: "ghost@example.com", password: "pw" }))
    expect(response.status).toBe(401)
    expect((await response.json()).error.code).toBe("incorrectCredentials")
    expect(persistFailedLogin).not.toHaveBeenCalled()
  })

  it("refuses a locked account before checking the password", async () => {
    const lockedUntil = new Date(Date.now() + 9.5 * 60_000)
    const { auth } = setup({ row: row({ lockedUntil, failedLoginAttempts: 5 }) })

    const response = await auth.login(loginRequest({ email: "ana@example.com", password: "pw" }))
    expect(response.status).toBe(423)
    expect((await response.json()).error).toEqual({ code: "accountLocked", values: { minutes: 10 } })
    expect(compareMock).not.toHaveBeenCalled()
  })

  it("tells an unverified account to confirm its email without counting a failure", async () => {
    const { auth, persistFailedLogin } = setup({ row: row({ emailVerified: null }) })
    compareMock.mockResolvedValue(true)

    const response = await auth.login(loginRequest({ email: "ana@example.com", password: "pw" }))
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe("verifyEmailFirst")
    expect(persistFailedLogin).not.toHaveBeenCalled()
  })

  it("reports the wrong system only after the password was correct, and issues no token", async () => {
    const { auth } = setup({ row: row({ tenantId: null }) })
    compareMock.mockResolvedValue(true)

    const response = await auth.login(loginRequest({ email: "ana@example.com", password: "pw" }))
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error.code).toBe("wrongSystem")
    expect(body.token).toBeUndefined()
  })

  it("applies the sign-in rate limit", async () => {
    const { auth } = setup({ row: row() })
    rateLimitMock.mockResolvedValue({ allowed: false, retryAfter: 42 })

    const response = await auth.login(loginRequest({ email: "ana@example.com", password: "pw" }))
    expect(response.status).toBe(429)
    expect((await response.json()).error).toEqual({ code: "tooManyRequests", values: { seconds: 42 } })
    expect(rateLimitMock).toHaveBeenCalledWith({ key: "signin:ip:203.0.113.7", maxAttempts: 10, windowSeconds: 300 })
  })

  it("rejects malformed input", async () => {
    const { auth } = setup({ row: row() })
    const response = await auth.login(loginRequest({ email: "not-an-email", password: "" }))
    expect(response.status).toBe(400)
  })
})

describe("bearer sessions", () => {
  async function tokenFor(current: { row: Row | null }) {
    const { auth } = setup(current)
    compareMock.mockResolvedValue(true)
    const body = await (await auth.login(loginRequest({ email: "ana@example.com", password: "pw" }))).json()
    return { auth, token: body.token as string }
  }

  it("reflects a role change immediately instead of the token snapshot", async () => {
    const current = { row: row({ role: "OWNER" }) }
    const { auth, token } = await tokenFor(current)
    current.row = row({ role: "USER" })
    withBearer(token)
    expect((await auth.readBearerSession())?.user.role).toBe("USER")
  })

  it("stops working when the account is deactivated, deleted or loses its tenant", async () => {
    const current: { row: Row | null } = { row: row() }
    const { auth, token } = await tokenFor(current)
    withBearer(token)

    current.row = row({ isActive: false })
    expect(await auth.readBearerSession()).toBeNull()
    current.row = row({ tenantId: null })
    expect(await auth.readBearerSession()).toBeNull()
    current.row = null
    expect(await auth.readBearerSession()).toBeNull()
  })

  it("does not accept a browser session cookie value as a bearer token", async () => {
    const { auth } = setup({ row: row() })
    const cookieJwt = await encode({ token: { id: "u1", sub: "u1" }, secret: process.env.AUTH_SECRET!, salt: COOKIE, maxAge: 3600 })
    withBearer(cookieJwt)
    expect(await auth.readBearerSession()).toBeNull()
  })

  it("does not accept another app's mobile token", async () => {
    const { auth } = setup({ row: row() })
    const foreign = await encode({ token: { id: "u1", sub: "u1" }, secret: process.env.AUTH_SECRET!, salt: "bms.session-token.mobile", maxAge: 3600 })
    withBearer(foreign)
    expect(await auth.readBearerSession()).toBeNull()
  })

  it("ignores garbage and missing tokens", async () => {
    const { auth } = setup({ row: row() })
    withBearer("not-a-token")
    expect(await auth.readBearerSession()).toBeNull()
    withBearer(null)
    expect(await auth.readBearerSession()).toBeNull()
    expect(await auth.hasBearer()).toBe(false)
  })

  it("prefers the cookie session and only falls back to the bearer token", async () => {
    const current = { row: row() }
    const { auth, token } = await tokenFor(current)
    withBearer(token)

    const cookieSession = { user: { id: "cookie-user", role: "ADMIN" } }
    expect(await auth.withBearer(async () => cookieSession)()).toBe(cookieSession)
    const fallback = await auth.withBearer<{ user: { id: string } }>(async () => null)()
    expect(fallback?.user.id).toBe("u1")
  })

  it("me() answers 401 without a valid token", async () => {
    const { auth } = setup({ row: row() })
    expect((await auth.me()).status).toBe(401)
  })
})

describe("error translation", () => {
  const thrown = (digest: string) => Object.assign(new Error("NEXT"), { digest })

  it("treats a sign-in redirect as an ended session", async () => {
    expect(mobileErrorResponse(thrown("NEXT_REDIRECT;replace;/sign-in;307;")).status).toBe(401)
    expect(mobileErrorResponse(thrown("NEXT_REDIRECT;replace;/sign-in?callbackUrl=/profile/abc;307;")).status).toBe(401)
  })

  it("treats any other redirect as the action's success path", async () => {
    const response = mobileErrorResponse(thrown("NEXT_REDIRECT;replace;/sign-in?reset=true;307;"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ result: { ok: true }, redirect: "/sign-in?reset=true" })

    const sent = mobileErrorResponse(thrown("NEXT_REDIRECT;push;/forgot-password?sent=true;307;"))
    expect(await sent.json()).toEqual({ result: { ok: true }, redirect: "/forgot-password?sent=true" })
  })

  it("maps forbidden() and notFound()", async () => {
    expect(mobileErrorResponse(thrown("NEXT_HTTP_ERROR_FALLBACK;403")).status).toBe(403)
    expect(mobileErrorResponse(thrown("NEXT_HTTP_ERROR_FALLBACK;404")).status).toBe(404)
  })

  it("hides unexpected errors behind a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const response = mobileErrorResponse(new Error("connection string leaked"))
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain("leaked")
    spy.mockRestore()
  })
})

describe("operation routes", () => {
  const context = (name: string) => ({ params: Promise.resolve({ name }) })
  const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) })

  it("requires a bearer header for protected operations but not for public ones", async () => {
    const secret = vi.fn(async () => ({ ok: true }))
    const open = vi.fn(async () => ({ ok: true }))
    const route = createActionRoute({ secret: args(secret), open: args(open) }, { hasBearer: async () => false, publicNames: ["open"] })

    expect((await route(post({}), context("secret"))).status).toBe(401)
    expect(secret).not.toHaveBeenCalled()
    expect((await route(post({}), context("open"))).status).toBe(200)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it("answers 404 for names that are not registered, including inherited object keys", async () => {
    const route = createActionRoute({}, { hasBearer: async () => true })
    for (const name of ["missing", "constructor", "__proto__", "toString"]) {
      expect((await route(post({}), context(name))).status).toBe(404)
    }
  })

  it("passes positional args, form fields and bound arguments in the action's own order", async () => {
    const positional = vi.fn(async (..._a: unknown[]) => ({ ok: true }))
    const stateful = vi.fn(async (_prev: unknown, _data: FormData) => ({ ok: true }))
    const bound = vi.fn(async (_id: string, _prev: unknown, _data: FormData) => ({ ok: true }))
    const route = createActionRoute(
      { positional: args(positional), stateful: form(stateful), bound: boundForm(bound) },
      { hasBearer: async () => true },
    )

    await route(post({ args: ["p1", { nested: 2 }] }), context("positional"))
    expect(positional).toHaveBeenCalledWith("p1", { nested: 2 })

    await route(post({ form: { email: "a@b.co", tags: ["x", "y"], skip: null } }), context("stateful"))
    const data = stateful.mock.calls[0][1]
    expect(stateful.mock.calls[0][0]).toBeUndefined()
    expect(data.get("email")).toBe("a@b.co")
    expect(data.getAll("tags")).toEqual(["x", "y"])
    expect(data.has("skip")).toBe(false)

    await route(post({ args: ["id-9"], form: { name: "Rex" } }), context("bound"))
    expect(bound.mock.calls[0][0]).toBe("id-9")
    expect(bound.mock.calls[0][1]).toBeUndefined()
    expect(bound.mock.calls[0][2].get("name")).toBe("Rex")
  })

  it("rejects a body whose args are not a list", async () => {
    const fn = vi.fn(async () => ({ ok: true }))
    const route = createActionRoute({ fn: args(fn) }, { hasBearer: async () => true })
    expect((await route(post({ args: "oops" }), context("fn"))).status).toBe(400)
    expect(fn).not.toHaveBeenCalled()
  })

  it("serves a view with its query parameters and serialises bigint values", async () => {
    const route = createViewRoute(
      { stats: async (params) => ({ echo: params, total: BigInt(12) }) },
      { hasBearer: async () => true },
    )
    const response = await route(new Request("http://localhost/x?status=SOLD&page=2"), context("stats"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { echo: { status: "SOLD", page: "2" }, total: "12" } })
  })

  it("turns a guard's sign-in redirect inside a view into 401", async () => {
    const route = createViewRoute(
      { guarded: async () => { throw Object.assign(new Error("NEXT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" }) } },
      { hasBearer: async () => true },
    )
    expect((await route(new Request("http://localhost/x"), context("guarded"))).status).toBe(401)
  })
})
