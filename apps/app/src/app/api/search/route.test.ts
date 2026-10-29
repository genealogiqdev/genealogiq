import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn(), rateLimit: vi.fn() }))
vi.mock("@/auth", () => ({ auth: mocks.auth }))
vi.mock("@/lib/prisma", () => ({ prisma: { appUser: { findMany: mocks.findMany } } }))
vi.mock("@genealogiq/services/rate-limit", () => ({ checkRateLimit: mocks.rateLimit }))
import { GET } from "./route"

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: "actor" } })
  mocks.rateLimit.mockResolvedValue({ allowed: true })
  mocks.findMany.mockResolvedValue([{ id: "memorial", firstName: "Maria", role: "APP_MEMO" }])
})

describe("guarded memorial search", () => {
  it("lists accepted human memorials without requiring a search term", async () => {
    const response = await GET(new Request("http://localhost/api/search?mode=guarded-relative&guardianId=someone-else"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ id: "memorial", firstName: "Maria", role: "APP_MEMO" }])
    expect(mocks.findMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      where: { role: "APP_MEMO", guardedBy: { some: { guardianId: "actor", status: "ACCEPTED" } }, AND: [] },
      take: 8,
    }))
  })

  it("allows short names and applies every search term inside the guardian scope", async () => {
    await GET(new Request("http://localhost/api/search?mode=guarded-relative&q=Li"))
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      role: "APP_MEMO", guardedBy: { some: { guardianId: "actor", status: "ACCEPTED" } },
      AND: [{ OR: [
        { firstName: { contains: "Li", mode: "insensitive" } },
        { lastName: { contains: "Li", mode: "insensitive" } },
        { petSpecies: { contains: "Li", mode: "insensitive" } },
        { petBreed: { contains: "Li", mode: "insensitive" } },
      ] }],
    } }))
  })

  it("returns an empty list when the viewer has no matching accepted memorials", async () => {
    mocks.findMany.mockResolvedValue([])
    expect(await (await GET(new Request("http://localhost/api/search?mode=guarded-relative"))).json()).toEqual([])
  })

  it("rejects anonymous enumeration", async () => {
    mocks.auth.mockResolvedValue(null)
    expect((await GET(new Request("http://localhost/api/search?mode=guarded-relative"))).status).toBe(401)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  it("preserves rate limiting", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false })
    expect((await GET(new Request("http://localhost/api/search?mode=guarded-relative"))).status).toBe(429)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  it("keeps the minimum search length for global relative searches", async () => {
    expect(await (await GET(new Request("http://localhost/api/search?mode=relative&q=Li"))).json()).toEqual([])
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
})
