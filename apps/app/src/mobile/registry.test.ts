import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, it, expect, vi, beforeEach } from "vitest"

// A lazily-populated Prisma double: prismaMock.<model>.<method> is a vi.fn that
// resolves to undefined until a test says otherwise.
const { prismaMock, resetPrisma, authMock, sendFeedbackEmail, checkRateLimit, issueToken } = vi.hoisted(() => {
  const fns = new Map<string, ReturnType<typeof vi.fn>>()
  const fn = (key: string) => {
    if (!fns.has(key)) fns.set(key, vi.fn())
    return fns.get(key)!
  }
  const models = new Map<string, unknown>()
  const prisma = new Proxy({} as Record<string, Record<string, ReturnType<typeof vi.fn>>>, {
    get(_target, model: string) {
      if (model === "$transaction") return fn("$transaction")
      if (!models.has(model)) {
        models.set(model, new Proxy({}, { get: (_t, method: string) => fn(`${model}.${method}`) }))
      }
      return models.get(model)
    },
  })
  return {
    prismaMock: prisma,
    resetPrisma: () => fns.forEach((mock) => mock.mockReset()),
    authMock: vi.fn(),
    sendFeedbackEmail: vi.fn(),
    checkRateLimit: vi.fn(),
    issueToken: vi.fn(),
  }
})

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
  mobileAuth: { issueToken },
  toPrincipal: (u: { id: string }) => ({ id: u.id, email: "", name: "", role: "APP_USER" }),
}))
vi.mock("@/lib/stripe", () => ({ stripe: {} }))
vi.mock("@/lib/blob", () => ({ deleteBlobs: vi.fn() }))
vi.mock("@/lib/email", () => ({
  sendFeedback: sendFeedbackEmail,
  sendVerificationEmail: vi.fn(),
  sendEmailChangeEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendAccountDeletionEmail: vi.fn(),
  sendAccountExistsEmail: vi.fn(),
}))
vi.mock("@genealogiq/services/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  checkRateLimit,
  getClientIp: vi.fn(async () => "203.0.113.7"),
}))
vi.mock("@genealogiq/services/media-storage", () => ({ isAuthorizedMediaReference: vi.fn(() => true) }))

import { ForbiddenError } from "@genealogiq/auth/authz"
import { views, publicViews } from "./views"
import { actions, publicActions } from "./actions"

const request = new Request("http://localhost/api/mobile/v1/test")
const runView = (name: string, params: Record<string, string> = {}) => views[name](params, request)
const runAction = (name: string, input: { args?: unknown[]; form?: Record<string, string> } = {}) => {
  const form = new FormData()
  for (const [key, value] of Object.entries(input.form ?? {})) form.append(key, value)
  return actions[name]({ args: input.args ?? [], form }, request)
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("expected a rejection, but the call resolved")
}

const digestOf = (error: unknown) => String((error as { digest?: unknown } | null)?.digest ?? "")

/** What `redirect("/sign-in…")` throws — the bridge answers it with 401. */
function expectSignInRedirect(error: unknown) {
  expect(digestOf(error)).toMatch(/^NEXT_REDIRECT;[^;]*;\/sign-in/)
}

const signedInAs = (id: string, email = `${id}@example.test`) =>
  authMock.mockResolvedValue({ user: { id, name: "Viewer Name", email, role: "APP_USER" } })
const signedOut = () => authMock.mockResolvedValue(null)

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    role: "APP_MEMO",
    isPublicProfile: true,
    firstName: "Ada",
    lastName: "Lovelace",
    avatarUrl: null,
    genCode: null,
    guardedBy: [{ guardianId: "guardian", status: "ACCEPTED", guardian: { firstName: "Gina" } }],
    ...overrides,
  }
}

beforeEach(() => {
  resetPrisma()
  authMock.mockReset()
  sendFeedbackEmail.mockReset()
  issueToken.mockReset()
  checkRateLimit.mockReset()
  checkRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 })
})

/* -------------------------------------------------------------------------- */

const EXPECTED_PUBLIC_VIEWS = [
  "bio",
  "documents",
  "gallery",
  "geolocation",
  "pets",
  "place",
  "places",
  "placesMap",
  "profile",
  "qrLanding",
  "tree",
  "tributes",
]

const EXPECTED_PROTECTED_VIEWS = [
  "billingQrCode",
  "bioEdit",
  "documentEdit",
  "documentNew",
  "favorites",
  "galleryEdit",
  "genealogyScan",
  "genealogyScans",
  "geolocationEdit",
  "header",
  "home",
  "me",
  "memorialFromTree",
  "memorialNew",
  "memorialized",
  "messages",
  "petNew",
  "placeEdit",
  "placeNew",
  "profileEdit",
  "qrCode",
  "subscriptions",
  "tributeEdit",
]

const EXPECTED_PUBLIC_ACTIONS = ["forgotPassword", "resetPassword", "signUp", "verifyEmail"]

describe("public surface", () => {
  it("exposes exactly the anonymous web pages as public views", () => {
    expect([...publicViews].sort()).toEqual(EXPECTED_PUBLIC_VIEWS)
  })

  it("keeps every other registered view behind a token", () => {
    const protectedViews = Object.keys(views).filter((name) => !publicViews.includes(name)).sort()
    expect(protectedViews).toEqual(EXPECTED_PROTECTED_VIEWS)
  })

  it("exposes exactly the signed-out account steps as public actions", () => {
    expect([...publicActions].sort()).toEqual(EXPECTED_PUBLIC_ACTIONS)
    for (const name of publicActions) expect(actions).toHaveProperty(name)
  })
})

describe("server action coverage", () => {
  // Read from source rather than from the registry's own imports.
  const actionsDir = fileURLToPath(new URL("../actions/", import.meta.url))
  const exported = readdirSync(actionsDir)
    .filter((file) => file.endsWith(".actions.ts"))
    .flatMap((file) =>
      [...readFileSync(`${actionsDir}${file}`, "utf8").matchAll(/^export\s+(?:async\s+function|const)\s+(\w+)/gm)]
        .map((match) => match[1]),
    )
  const NOT_FOR_MOBILE = ["login", "logout"]

  it("finds the action modules", () => {
    expect(exported.length).toBeGreaterThanOrEqual(50)
    expect(exported).toEqual(expect.arrayContaining(["toggleFavorite", "deleteAccount", "activateGenCode", "login"]))
  })

  it("registers every exported server action except login and logout", () => {
    const missing = exported.filter((name) => !NOT_FOR_MOBILE.includes(name) && !Object.hasOwn(actions, name))
    expect(missing).toEqual([])
  })

  it("does not register login or logout", () => {
    expect(actions).not.toHaveProperty("login")
    expect(actions).not.toHaveProperty("logout")
  })
})

describe("protected views without a session", () => {
  it.each(EXPECTED_PROTECTED_VIEWS)("%s throws the sign-in redirect", async (name) => {
    signedOut()
    const error = await rejectionOf(runView(name, { id: "p1", documentId: "d1", placeId: "pl1" }))
    expectSignInRedirect(error)
  })
})

describe("manager-only views", () => {
  const MANAGER_ONLY = [
    "profileEdit",
    "bioEdit",
    "galleryEdit",
    "documentNew",
    "documentEdit",
    "placeNew",
    "placeEdit",
    "geolocationEdit",
    "petNew",
  ]

  it.each(MANAGER_ONLY)("%s rejects a signed-in non-manager and loads no content", async (name) => {
    signedInAs("stranger")
    prismaMock.appUser.findUnique.mockResolvedValue(profileRow())

    const error = await rejectionOf(runView(name, { id: "p1", documentId: "d1", placeId: "pl1" }))

    expect(error).toBeInstanceOf(ForbiddenError)
    expect(prismaMock.bio.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.galleryItem.findMany).not.toHaveBeenCalled()
    expect(prismaMock.document.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.geoPlace.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.geolocation.findUnique).not.toHaveBeenCalled()
  })

  it.each(MANAGER_ONLY.filter((name) => name !== "profileEdit"))(
    "%s does not treat a PENDING guardianship as management",
    async (name) => {
      signedInAs("stranger")
      prismaMock.appUser.findUnique.mockResolvedValue(
        profileRow({ guardedBy: [{ guardianId: "stranger", status: "PENDING", guardian: { firstName: "S" } }] }),
      )
      const error = await rejectionOf(runView(name, { id: "p1", documentId: "d1", placeId: "pl1" }))
      expect(error).toBeInstanceOf(ForbiddenError)
    },
  )

  it("tributeEdit refuses writing a tribute to yourself", async () => {
    signedInAs("p1")
    const error = await rejectionOf(runView("tributeEdit", { id: "p1" }))
    expect(error).toBeInstanceOf(ForbiddenError)
  })

  it("qrCode hides a memorial's QR page from a non-guardian as a 404", async () => {
    signedInAs("stranger")
    prismaMock.appUser.findUnique.mockResolvedValue(profileRow())
    const error = await rejectionOf(runView("qrCode", { id: "p1" }))
    expect(digestOf(error)).toBe("NEXT_HTTP_ERROR_FALLBACK;404")
  })
})

describe("public views for an anonymous visitor", () => {
  it.each([
    ["an opted-out living profile", profileRow({ role: "APP_USER", isPublicProfile: false, guardedBy: [] })],
    ["a ghost", profileRow({ role: "APP_GHOST", guardedBy: [] })],
    ["a missing profile", null],
  ])("answers %s with the sign-in redirect on every profile view", async (_label, row) => {
    signedOut()
    prismaMock.appUser.findUnique.mockResolvedValue(row)
    for (const name of EXPECTED_PUBLIC_VIEWS.filter((view) => view !== "qrLanding")) {
      expectSignInRedirect(await rejectionOf(runView(name, { id: "p1", placeId: "pl1" })))
    }
  })

  it("gallery returns only the first 12 items, without their metadata", async () => {
    signedOut()
    prismaMock.appUser.findUnique.mockResolvedValue(profileRow())
    prismaMock.galleryItem.findMany.mockResolvedValue([
      { id: "g1", kind: "image", url: "https://media.test/1.jpg", poster: null, durationSec: null, takenAt: "1999", location: "Lisbon", description: "private note", order: 0, userId: "p1" },
    ])
    prismaMock.galleryItem.count.mockResolvedValue(40)

    const data = (await runView("gallery", { id: "p1" })) as Record<string, unknown>

    expect(prismaMock.galleryItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 12 }))
    expect(data.gated).toBe(true)
    expect(data.canManage).toBe(false)
    expect(data.hasMore).toBe(true)
    expect(data.quota).toBeNull()
    expect(data.items).toEqual([
      { id: "g1", kind: "image", url: "https://media.test/1.jpg", poster: null, durationSec: null, takenAt: null, location: null, description: null, order: 0 },
    ])
  })

  it("tributes returns only the first 16 approved tributes and nobody's unpublished ones", async () => {
    signedOut()
    prismaMock.appUser.findUnique.mockResolvedValue(profileRow())
    prismaMock.tribute.findMany.mockResolvedValue([])
    prismaMock.tribute.count.mockResolvedValue(30)

    const data = (await runView("tributes", { id: "p1" })) as Record<string, unknown>

    expect(prismaMock.tribute.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.tribute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { profileId: "p1", status: "APPROVED" }, take: 16 }),
    )
    expect(data).toMatchObject({ gated: true, canWrite: false, isManager: false, tributeCount: 30, unpublishedTributes: [] })
  })

  it("documents returns only the first 12 public documents and never the stored file URL", async () => {
    signedOut()
    prismaMock.appUser.findUnique.mockResolvedValue(profileRow())
    prismaMock.subscription.findUnique.mockResolvedValue({ code: "FREE", documentsMax: 3 })
    prismaMock.appUserGuardian.findMany.mockResolvedValue([])
    prismaMock.document.findMany.mockResolvedValue([
      { id: "d1", title: "Will", description: null, category: "legal", fileUrl: "https://media.test/secret.pdf", fileName: "will.pdf", isPublic: true, order: 0, createdAt: new Date("2026-01-02T00:00:00Z"), updatedAt: new Date(), userId: "p1" },
    ])
    prismaMock.document.count.mockResolvedValue(1)

    const data = (await runView("documents", { id: "p1" })) as Record<string, unknown>

    expect(prismaMock.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "p1", isPublic: true }, take: 12 }),
    )
    expect(JSON.stringify(data)).not.toContain("secret.pdf")
    expect(data).toMatchObject({ gated: true, canManage: false, quota: null })
  })

  it("places and the map share the 12-place bound", async () => {
    signedOut()
    prismaMock.appUser.findUnique.mockResolvedValue(profileRow())
    prismaMock.subscription.findUnique.mockResolvedValue({ code: "FREE", geoPlacesMax: 1 })
    prismaMock.appUserGuardian.findMany.mockResolvedValue([])
    prismaMock.geoPlace.findMany.mockResolvedValue([])

    await runView("places", { id: "p1" })
    await runView("placesMap", { id: "p1" })

    expect(prismaMock.geoPlace.findMany).toHaveBeenCalledTimes(2)
    for (const [query] of prismaMock.geoPlace.findMany.mock.calls) {
      expect(query).toMatchObject({ where: { userId: "p1" }, take: 12 })
    }
  })

  it("place sends a visitor outside the first 12 back to the list instead of the detail", async () => {
    signedOut()
    prismaMock.appUser.findUnique.mockResolvedValue(profileRow())
    prismaMock.geoPlace.findFirst.mockResolvedValue({
      id: "pl13", userId: "p1", title: "Hidden", description: "beyond the wall", categories: [], photos: [], qrGenerated: false, lat: 1, lon: 2,
    })
    prismaMock.geoPlace.findMany.mockResolvedValue([{ id: "pl1" }, { id: "pl2" }])

    const data = await runView("place", { id: "p1", placeId: "pl13", view: "details" })

    expect(data).toEqual({ state: "places", profileId: "p1" })
  })
})

describe("public views for a signed-in non-manager", () => {
  it("gallery is not truncated, documents stay public-only", async () => {
    signedInAs("stranger")
    prismaMock.appUser.findUnique.mockResolvedValue(profileRow())
    prismaMock.subscription.findUnique.mockResolvedValue({ code: "FREE", documentsMax: 3 })
    prismaMock.appUserGuardian.findMany.mockResolvedValue([])
    prismaMock.galleryItem.findMany.mockResolvedValue([])
    prismaMock.document.findMany.mockResolvedValue([])

    const gallery = (await runView("gallery", { id: "p1" })) as Record<string, unknown>
    const documents = (await runView("documents", { id: "p1" })) as Record<string, unknown>

    expect(prismaMock.galleryItem.findMany.mock.calls[0][0].take).toBeUndefined()
    expect(prismaMock.document.findMany.mock.calls[0][0]).toMatchObject({ where: { userId: "p1", isPublic: true } })
    expect(prismaMock.document.findMany.mock.calls[0][0].take).toBeUndefined()
    expect(gallery).toMatchObject({ gated: false, canManage: false, quota: null })
    expect(documents).toMatchObject({ gated: false, canManage: false, quota: null })
  })
})

describe("session-scoped data", () => {
  it("header reads the session user, never a client-supplied id", async () => {
    signedInAs("me")
    prismaMock.notification.count.mockResolvedValue(4)
    prismaMock.appUser.findUnique.mockResolvedValue({ firstName: "Mia", lastName: "Stone", avatarUrl: null })

    const data = await runView("header", { id: "victim", userId: "victim" })

    expect(prismaMock.notification.count).toHaveBeenCalledWith({ where: { userId: "me", readAt: null } })
    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "me" } }))
    expect(data).toEqual({ userId: "me", userName: "Mia Stone", userImage: null, unreadCount: 4 })
  })

  it("messages is a pure read; markMessagesRead clears only the session user's badge", async () => {
    signedInAs("me")
    prismaMock.notification.findMany.mockResolvedValue([])
    prismaMock.notification.updateMany.mockResolvedValue({ count: 3 })

    const data = await runView("messages", { id: "victim" })
    expect(data).toEqual({ pending: [], activity: [], nextCursor: null })
    expect(prismaMock.notification.updateMany).not.toHaveBeenCalled()
    for (const [query] of prismaMock.notification.findMany.mock.calls) expect(query.where.userId).toBe("me")

    const result = await runAction("markMessagesRead", { args: ["victim"] })
    expect(result).toEqual({ ok: true, data: { marked: 3 }, message: undefined })
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "me", readAt: null } }),
    )
  })
})

describe("mobile action variants", () => {
  it("sendFeedback requires a session", async () => {
    signedOut()
    const error = await rejectionOf(runAction("sendFeedback", { args: [{ type: "bug", message: "It broke" }] }))
    expectSignInRedirect(error)
    expect(sendFeedbackEmail).not.toHaveBeenCalled()
  })

  it("sendFeedback sends with the account email under a per-user limit, with no captcha", async () => {
    signedInAs("me", "me@example.test")

    const result = await runAction("sendFeedback", {
      args: [{ type: "bug", message: "It broke", email: "spoofed@evil.test", page: "/home" }],
    })

    expect(result).toEqual({ ok: true, message: undefined })
    expect(checkRateLimit).toHaveBeenCalledWith({ key: "feedback:user:me", maxAttempts: 5, windowSeconds: 3600 })
    expect(sendFeedbackEmail).toHaveBeenCalledWith({
      type: "bug", email: "me@example.test", message: "It broke", cvUrl: undefined, page: "/home",
    })
  })

  it("sendFeedback stops at the per-user rate limit", async () => {
    signedInAs("me")
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 120 })

    const result = await runAction("sendFeedback", { args: [{ type: "contact", message: "Hello" }] })

    expect(result).toEqual({ ok: false, message: "feedback.tooManyRequests" })
    expect(sendFeedbackEmail).not.toHaveBeenCalled()
  })

  it("markPlaceQrGenerated requires a session on mobile", async () => {
    signedOut()
    const error = await rejectionOf(runAction("markPlaceQrGenerated", { args: ["p1", "pl1"] }))
    expectSignInRedirect(error)
    expect(prismaMock.geoPlace.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.geoPlace.update).not.toHaveBeenCalled()
  })

  it("rejects a non-string id argument before it can reach a query", async () => {
    signedInAs("me")
    const result = await runAction("toggleFavorite", { args: [{ not: "" }] })
    expect(result).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.favorite.findUnique).not.toHaveBeenCalled()

    const place = await runAction("deletePlace", { args: ["p1", { not: "" }] })
    expect(place).toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.geoPlace.findFirst).not.toHaveBeenCalled()
  })

  it("createExtraUnitCheckoutSession refuses an unknown resource or an external return path", async () => {
    signedInAs("me")
    expect(await runAction("createExtraUnitCheckoutSession", { args: ["GOLD"] }))
      .toEqual({ ok: false, message: "common.invalidData" })
    expect(await runAction("createExtraUnitCheckoutSession", { args: ["QR_CODE", "@evil.test/"] }))
      .toEqual({ ok: false, message: "common.invalidData" })
    expect(await runAction("createExtraUnitCheckoutSession", { args: ["QR_CODE", "//evil.test"] }))
      .toEqual({ ok: false, message: "common.invalidData" })
    expect(prismaMock.extraUnitPrice.findUnique).not.toHaveBeenCalled()
  })

  it("verifyEmail rejects an unknown token and consumes an expired one", async () => {
    signedOut()
    prismaMock.emailToken.findUnique.mockResolvedValueOnce(null)
    expect(await runAction("verifyEmail", { form: { token: "nope" } }))
      .toEqual({ ok: false, message: "auth.invalidOrExpiredLink" })

    prismaMock.emailToken.findUnique.mockResolvedValueOnce({
      type: "VERIFICATION", appUserId: "u1", userId: null, newEmail: null, expiresAt: new Date(Date.now() - 1000),
    })
    prismaMock.emailToken.delete.mockResolvedValue({})
    expect(await runAction("verifyEmail", { form: { token: "old" } }))
      .toEqual({ ok: false, message: "auth.invalidOrExpiredLink" })
    expect(prismaMock.emailToken.delete).toHaveBeenCalledTimes(1)
    expect(prismaMock.appUser.update).not.toHaveBeenCalled()
    expect(issueToken).not.toHaveBeenCalled()
  })

  it("verifyEmail confirms an email change without issuing a session", async () => {
    signedOut()
    prismaMock.emailToken.findUnique.mockResolvedValue({
      type: "CHANGE", appUserId: "u1", userId: null, newEmail: "new@example.test", expiresAt: new Date(Date.now() + 60_000),
    })
    prismaMock.$transaction.mockResolvedValue([{}, {}])

    const result = await runAction("verifyEmail", { form: { token: "change-token" } })

    expect(result).toEqual({ ok: true, data: { status: "emailChanged" }, message: undefined })
    expect(prismaMock.appUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" }, data: expect.objectContaining({ email: "new@example.test" }) }),
    )
    expect(issueToken).not.toHaveBeenCalled()
  })
})
