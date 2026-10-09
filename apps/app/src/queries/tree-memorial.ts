import "server-only"
import type { Prisma } from "@genealogiq/db"
import { prisma } from "@/lib/prisma"
import { getTreeMemberIds } from "@/queries/family-tree"

/** Tree membership never grants guardianship. Pets do not join their owners' trees. */
export async function getTreeMemorialScope(
  guardianId: string,
  db: Pick<Prisma.TransactionClient, "familyRelation"> = prisma,
): Promise<Prisma.AppUserWhereInput> {
  const memberIds = Array.from(await getTreeMemberIds(guardianId, db))
  return {
    id: { not: guardianId },
    guardedBy: { some: { guardianId, status: "ACCEPTED" } },
    OR: [
      { id: { in: memberIds }, role: { in: ["APP_GHOST", "APP_MEMO"] } },
      { role: "APP_PET", petOwnerships: { some: { ownerId: { in: memberIds } } } },
    ],
  }
}

export async function getTreeMemorialCandidates(guardianId: string) {
  return prisma.appUser.findMany({
    where: await getTreeMemorialScope(guardianId),
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      role: true,
      birthDate: true,
      deathDate: true,
      petSpecies: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
  })
}

export type TreeMemorialCandidate = Awaited<ReturnType<typeof getTreeMemorialCandidates>>[number]
