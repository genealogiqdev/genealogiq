import { prisma } from "@/lib/prisma"
import type { Prisma } from "@genealogiq/db"

export async function getMemorialsByCreatorId(guardianId: string) {
  return prisma.appUser.findMany({
    where: { role: "APP_MEMO", guardedBy: { some: { guardianId, status: "ACCEPTED" } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      role: true,
      birthDate: true,
      birthPlace: true,
      birthCountry: true,
      deathDate: true,
      deathPlace: true,
      deathCountry: true,
    },
    orderBy: { createdAt: "desc" },
  })
}

export type MemorialRow = Awaited<ReturnType<typeof getMemorialsByCreatorId>>[number]

export async function countMemorialsByCreatorId(
  guardianId: string,
  db: Pick<Prisma.TransactionClient, "appUser"> = prisma,
) {
  return db.appUser.count({
    where: { role: "APP_MEMO", guardedBy: { some: { guardianId, status: "ACCEPTED" } } },
  })
}

/** The guarded-profile list includes pets; their quota remains independent. */
export async function getGuardedProfilesByGuardianId(guardianId: string) {
  return prisma.appUser.findMany({
    where: {
      role: { in: ["APP_MEMO", "APP_PET"] },
      guardedBy: { some: { guardianId, status: "ACCEPTED" } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      role: true,
      birthDate: true,
      birthPlace: true,
      birthCountry: true,
      deathDate: true,
      deathPlace: true,
      deathCountry: true,
      petSpecies: true,
      petBreed: true,
    },
    orderBy: { createdAt: "desc" },
  })
}

export type GuardedProfileRow = Awaited<ReturnType<typeof getGuardedProfilesByGuardianId>>[number]
