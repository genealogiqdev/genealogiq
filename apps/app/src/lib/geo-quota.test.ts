import { describe, it, expect, vi, beforeEach } from "vitest"

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    appUser: { findMany: vi.fn() },
    geoPlace: { count: vi.fn() },
  },
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))
vi.mock("@/lib/extra-units", () => ({ getExtraUnits: vi.fn() }))

import { getGuardianGeoPlacesStatus } from "./geo-quota"
import { getMemorialFeatures } from "@/lib/subscription"
import { getExtraUnits } from "@/lib/extra-units"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getMemorialFeatures).mockResolvedValue({ geoPlacesMax: 3 } as never)
  vi.mocked(getExtraUnits).mockResolvedValue(0)
})

describe("getGuardianGeoPlacesStatus", () => {
  it("sums places across the guardian's own profile and every managed memorial", async () => {
    prismaMock.appUser.findMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }])
    prismaMock.geoPlace.count.mockResolvedValue(2)

    const status = await getGuardianGeoPlacesStatus("g1")

    expect(status).toEqual({ usage: 2, limit: 3 })
    expect(prismaMock.geoPlace.count).toHaveBeenCalledWith({
      where: { userId: { in: ["g1", "m1", "m2"] } },
    })
    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith({
      where: {
        role: { in: ["APP_MEMO", "APP_PET"] },
        guardedBy: { some: { guardianId: "g1", status: "ACCEPTED" } },
      },
      select: { id: true },
    })
  })

  it("counts only the guardian's own profile when there are no managed memorials", async () => {
    prismaMock.appUser.findMany.mockResolvedValue([])
    prismaMock.geoPlace.count.mockResolvedValue(1)

    const status = await getGuardianGeoPlacesStatus("g1")

    expect(status).toEqual({ usage: 1, limit: 3 })
  })

  it("adds purchased extra slots on top of the plan's base quota", async () => {
    prismaMock.appUser.findMany.mockResolvedValue([])
    prismaMock.geoPlace.count.mockResolvedValue(3)
    vi.mocked(getExtraUnits).mockResolvedValue(2)

    const status = await getGuardianGeoPlacesStatus("g1")

    expect(status).toEqual({ usage: 3, limit: 5 })
    expect(getExtraUnits).toHaveBeenCalledWith("g1", "GEO_PLACE")
  })
})
