import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))
vi.mock("@/queries/pet", () => ({ countPetsByCreatorId: vi.fn() }))

import { getPetCreationStatus } from "./pet-quota"
import { getMemorialFeatures } from "@/lib/subscription"
import { countPetsByCreatorId } from "@/queries/pet"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getPetCreationStatus", () => {
  it.each([[4, true], [5, false]] as const)("allows exactly five Premium pets (count=%s)", async (count, allowed) => {
    vi.mocked(countPetsByCreatorId).mockResolvedValue(count)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ code: 'PREMIUM', petsMax: 5 } as never)
    expect(await getPetCreationStatus('guardian-premium')).toEqual({ count, limit: 5, allowed })
  })

  it("allows creation when under the FREE limit", async () => {
    vi.mocked(countPetsByCreatorId).mockResolvedValue(1)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ petsMax: 2 } as never)

    const status = await getPetCreationStatus("guardian-1")

    expect(status).toEqual({ count: 1, limit: 2, allowed: true })
  })

  it("disallows creation at the limit", async () => {
    vi.mocked(countPetsByCreatorId).mockResolvedValue(2)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ petsMax: 2 } as never)

    const status = await getPetCreationStatus("guardian-1")

    expect(status).toEqual({ count: 2, limit: 2, allowed: false })
  })

  it("uses the guardian's own resolved plan, giving PREMIUM guardians a higher limit", async () => {
    vi.mocked(countPetsByCreatorId).mockResolvedValue(3)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ petsMax: 6 } as never)

    const status = await getPetCreationStatus("premium-guardian")

    expect(status).toEqual({ count: 3, limit: 6, allowed: true })
    expect(getMemorialFeatures).toHaveBeenCalledWith("premium-guardian")
  })

  it("disallows creation over the limit (not just exactly at it)", async () => {
    vi.mocked(countPetsByCreatorId).mockResolvedValue(5)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ petsMax: 2 } as never)

    const status = await getPetCreationStatus("guardian-1")

    expect(status.allowed).toBe(false)
  })

  it("blocks FREE guardians outright (petsMax=0 is a premium-only gate, not just a small quota)", async () => {
    vi.mocked(countPetsByCreatorId).mockResolvedValue(0)
    vi.mocked(getMemorialFeatures).mockResolvedValue({ petsMax: 0 } as never)

    const status = await getPetCreationStatus("free-guardian")

    expect(status).toEqual({ count: 0, limit: 0, allowed: false })
  })
})
