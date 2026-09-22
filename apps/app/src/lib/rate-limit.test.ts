import { describe, it, expect, vi, beforeEach } from "vitest"

const { prismaMock, headersMock } = vi.hoisted(() => ({
  prismaMock: {
    rateLimitAttempt: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
  headersMock: vi.fn(),
}))
// rate-limit's logic now lives in @genealogiq/services and imports prisma from
// @genealogiq/db, so we mock that module (not the local @/lib/prisma shim).
vi.mock("@genealogiq/db", () => ({ prisma: prismaMock }))
vi.mock("next/headers", () => ({ headers: headersMock }))

import { checkRateLimit, getClientIp, requireWithinRateLimit, TooManyRequestsError } from "./rate-limit"

const headerBag = (entries: Record<string, string | null>) => ({
  get: (k: string) => entries[k] ?? null,
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.rateLimitAttempt.create.mockResolvedValue({})
  prismaMock.rateLimitAttempt.deleteMany.mockResolvedValue({})
})

describe("checkRateLimit", () => {
  it("allows and records an attempt when under the limit", async () => {
    prismaMock.rateLimitAttempt.findMany.mockResolvedValue([]) // 0 < max

    const res = await checkRateLimit({ key: "signin:ip:1.1.1.1", maxAttempts: 5, windowSeconds: 300 })

    expect(res.allowed).toBe(true)
    expect(prismaMock.rateLimitAttempt.create).toHaveBeenCalledWith({ data: { key: "signin:ip:1.1.1.1" } })
  })

  it("blocks and does NOT record once the window is full", async () => {
    const oldest = new Date(Date.now() - 100_000) // 100s ago, window 300s
    prismaMock.rateLimitAttempt.findMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({ attemptedAt: oldest })),
    )

    const res = await checkRateLimit({ key: "signin:ip:1.1.1.1", maxAttempts: 5, windowSeconds: 300 })

    expect(res.allowed).toBe(false)
    expect(res.retryAfter).toBeGreaterThan(0)
    expect(prismaMock.rateLimitAttempt.create).not.toHaveBeenCalled()
  })
})

describe("getClientIp", () => {
  it("uses the Azure-appended rightmost IP from x-forwarded-for", async () => {
    headersMock.mockResolvedValue(headerBag({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))
    expect(await getClientIp()).toBe("2.2.2.2")
  })

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    headersMock.mockResolvedValue(headerBag({ "x-real-ip": "3.3.3.3" }))
    expect(await getClientIp()).toBe("3.3.3.3")
  })

  it("returns 'unknown' when no client IP header is present", async () => {
    headersMock.mockResolvedValue(headerBag({}))
    expect(await getClientIp()).toBe("unknown")
  })
})

describe("requireWithinRateLimit (throwing guard)", () => {
  it("resolves when under the limit", async () => {
    prismaMock.rateLimitAttempt.findMany.mockResolvedValue([])
    await expect(requireWithinRateLimit("k", { limit: 5, windowSec: 300 })).resolves.toBeUndefined()
  })

  it("throws TooManyRequestsError with a retryAfter once the window is full", async () => {
    const oldest = new Date(Date.now() - 100_000) // 100s ago, window 300s
    prismaMock.rateLimitAttempt.findMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({ attemptedAt: oldest })),
    )
    await expect(requireWithinRateLimit("k", { limit: 5, windowSec: 300 })).rejects.toBeInstanceOf(
      TooManyRequestsError,
    )
    expect(prismaMock.rateLimitAttempt.create).not.toHaveBeenCalled()
  })
})
