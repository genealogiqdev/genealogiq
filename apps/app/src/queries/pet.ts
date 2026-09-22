import { prisma } from "@/lib/prisma"

const petListSelect = {
  id: true,
  firstName: true,
  avatarUrl: true,
  role: true,
  petSpecies: true,
  petBreed: true,
  birthDate: true,
  deathDate: true,
} as const

/** Pets a person is represented as owning. Used for public profile cards/lists. */
export async function getPetsByOwnerId(ownerId: string) {
  return prisma.appUser.findMany({
    where: {
      role: "APP_PET",
      petOwnerships: { some: { ownerId } },
    },
    select: petListSelect,
    orderBy: { createdAt: "desc" },
  })
}

/** Pets the user can manage. Guardianship is authorization, not ownership. */
export async function getManagedPetsByGuardianId(guardianId: string) {
  return prisma.appUser.findMany({
    where: { role: "APP_PET", guardedBy: { some: { guardianId, status: "ACCEPTED" } } },
    select: petListSelect,
    orderBy: { createdAt: "desc" },
  })
}

export type PetRow = Awaited<ReturnType<typeof getPetsByOwnerId>>[number]

export async function countManagedPetsByGuardianId(guardianId: string) {
  return prisma.appUser.count({
    where: { role: "APP_PET", guardedBy: { some: { guardianId, status: "ACCEPTED" } } },
  })
}

export async function getPetOwners(petId: string) {
  return prisma.petOwnership.findMany({
    where: { petId },
    select: {
      id: true,
      ownerId: true,
      createdAt: true,
      owner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          role: true,
          guardedBy: {
            where: { status: "ACCEPTED" },
            select: { guardianId: true },
          },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { ownerId: "asc" }],
  })
}

// Compatibility aliases for quota code while keeping ownership semantics
// explicit at call sites.
export const getPetsByCreatorId = getManagedPetsByGuardianId
export const countPetsByCreatorId = countManagedPetsByGuardianId
