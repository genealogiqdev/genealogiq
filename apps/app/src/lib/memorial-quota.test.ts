import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))
vi.mock("@/queries/memorial", () => ({ countMemorialsByCreatorId: vi.fn() }))
vi.mock("@/lib/extra-units", () => ({ getExtraUnits: vi.fn() }))

import { getMemorialCreationStatus } from "./memorial-quota"
import { getMemorialFeatures } from "@/lib/subscription"
import { countMemorialsByCreatorId } from "@/queries/memorial"
import { getExtraUnits } from "@/lib/extra-units"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getExtraUnits).mockResolvedValue(0)
})

describe("getMemorialCreationStatus", () => {
  it.each([[0, true], [1, false]] as const)("allows exactly one Free human memorial (count=%s)", async (count, allowed) => {
    vi.mocked(countMemorialsByCreatorId).mockResolvedValue(count)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ code: 'FREE', memorialsMax: 1 } as never)
    expect(await getMemorialCreationStatus('guardian-free')).toEqual({ count, limit: 1, allowed })
  })

  it.each([[4, true], [5, false]] as const)("allows exactly five Premium human memorials (count=%s)", async (count, allowed) => {
    vi.mocked(countMemorialsByCreatorId).mockResolvedValue(count)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ code: 'PREMIUM', memorialsMax: 5 } as never)
    expect(await getMemorialCreationStatus('guardian-premium')).toEqual({ count, limit: 5, allowed })
  })

  it("allows creation when under the FREE limit", async () => {
    vi.mocked(countMemorialsByCreatorId).mockResolvedValue(1)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ memorialsMax: 2 } as never)

    const status = await getMemorialCreationStatus("guardian-1")

    expect(status).toEqual({ count: 1, limit: 2, allowed: true })
  })

  it("disallows creation at the limit", async () => {
    vi.mocked(countMemorialsByCreatorId).mockResolvedValue(2)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ memorialsMax: 2 } as never)

    const status = await getMemorialCreationStatus("guardian-1")

    expect(status).toEqual({ count: 2, limit: 2, allowed: false })
  })

  it("uses the guardian's own resolved plan, giving PREMIUM guardians a higher limit", async () => {
    vi.mocked(countMemorialsByCreatorId).mockResolvedValue(3)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ memorialsMax: 6 } as never)

    const status = await getMemorialCreationStatus("premium-guardian")

    expect(status).toEqual({ count: 3, limit: 6, allowed: true })
    expect(getMemorialFeatures).toHaveBeenCalledWith("premium-guardian")
  })

  it("disallows creation over the limit (not just exactly at it)", async () => {
    vi.mocked(countMemorialsByCreatorId).mockResolvedValue(5)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ memorialsMax: 2 } as never)

    const status = await getMemorialCreationStatus("guardian-1")

    expect(status.allowed).toBe(false)
  })

  it("adds purchased extra memorial slots on top of the plan's base quota", async () => {
    vi.mocked(countMemorialsByCreatorId).mockResolvedValue(2)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ memorialsMax: 1 } as never)
    vi.mocked(getExtraUnits).mockResolvedValue(2)

    const status = await getMemorialCreationStatus("guardian-1")

    expect(status).toEqual({ count: 2, limit: 3, allowed: true })
    expect(getExtraUnits).toHaveBeenCalledWith("guardian-1", "MEMORIAL")
  })
})
