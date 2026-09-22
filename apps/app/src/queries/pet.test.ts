import { beforeEach, describe, expect, it, vi } from "vitest"

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    appUser: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    petOwnership: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

import {
  countManagedPetsByGuardianId,
  getManagedPetsByGuardianId,
  getPetsByOwnerId,
} from "./pet"

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.appUser.findMany.mockResolvedValue([])
  prismaMock.appUser.count.mockResolvedValue(0)
})

describe("pet queries", () => {
  it("lists a person's pets through ownership, not guardianship", async () => {
    await getPetsByOwnerId("owner-1")

    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        role: "APP_PET",
        petOwnerships: { some: { ownerId: "owner-1" } },
      },
    }))
  })

  it("lists and counts managed pets through accepted guardianship", async () => {
    await getManagedPetsByGuardianId("guardian-1")
    await countManagedPetsByGuardianId("guardian-1")

    const where = {
      role: "APP_PET",
      guardedBy: { some: { guardianId: "guardian-1", status: "ACCEPTED" } },
    }
    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }))
    expect(prismaMock.appUser.count).toHaveBeenCalledWith({ where })
  })
})
