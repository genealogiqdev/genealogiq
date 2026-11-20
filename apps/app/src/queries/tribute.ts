import { prisma } from "@/lib/prisma"

export async function getApprovedTributesByProfileId(profileId: string, take?: number) {
  return prisma.tribute.findMany({
    where: { profileId, status: "APPROVED" },
    include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
    take,
  })
}

export async function getMyTributeForProfile(authorId: string, profileId: string, tributeId: string) {
  return prisma.tribute.findFirst({ where: { id: tributeId, authorId, profileId } })
}

export async function getMyUnpublishedTributesForProfile(authorId: string, profileId: string) {
  return prisma.tribute.findMany({
    where: { authorId, profileId, status: { in: ["PENDING", "REJECTED"] } },
    select: { id: true, text: true, status: true },
    orderBy: { createdAt: "desc" },
  })
}

export type UnpublishedTributeRow = Awaited<ReturnType<typeof getMyUnpublishedTributesForProfile>>[number]

export async function getTributeCountByProfileId(profileId: string) {
  return prisma.tribute.count({ where: { profileId, status: "APPROVED" } })
}

export type ApprovedTributeRow = Awaited<ReturnType<typeof getApprovedTributesByProfileId>>[number]

export type TributeAuthorPreview = {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
}

export async function getTributeAuthors(profileId: string, limit = 5): Promise<TributeAuthorPreview[]> {
  const rows = await prisma.tribute.findMany({
    where: { profileId, status: "APPROVED" },
    select: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    take: limit,
    orderBy: { createdAt: "desc" },
  })
  return rows.map((r) => r.author)
}
