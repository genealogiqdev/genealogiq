import { prisma } from "@/lib/prisma"
import { redactLivingProfile } from "@/queries/profile"
import { isProfilePubliclyVisible } from "@/lib/public-profile-access"

// viewer: the person BROWSING this favorites list, not the list owner — used
// to (a) redact a favorited living person's exact birth/death date+place the
// same way every other read path does, and (b) for a true anonymous viewer,
// drop any favorited target they wouldn't be allowed to open directly (a
// living person who has since opted out). Any authenticated viewer sees the
// list unfiltered — they could already reach every target's own profile page
// regardless of its opt-out flag, so hiding it here would protect nothing.
// Filtered in JS rather than the Prisma `where` (unlike Documents'
// isPublic filter) so it reuses isProfilePubliclyVisible verbatim instead of
// re-deriving the same rule in query form — this list has no pagination cap
// to make that costlier than it already is.
export async function getFavoritesByUserId(userId: string, viewerId: string | undefined) {
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    include: {
      target: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          role: true,
          isPublicProfile: true,
          birthDate: true,
          birthPlace: true,
          birthState: true,
          birthCountry: true,
          deathDate: true,
          deathPlace: true,
          deathState: true,
          deathCountry: true,
          deathCause: true,
          petSpecies: true,
          petBreed: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const visible = viewerId ? favorites : favorites.filter((fav) => isProfilePubliclyVisible(fav.target))

  return visible.map((fav) => ({
    ...fav,
    target: redactLivingProfile(fav.target, { id: viewerId ?? "", canManage: false }),
  }))
}

export type FavoriteRow = Awaited<ReturnType<typeof getFavoritesByUserId>>[number]

export async function isFavoritedByUser(userId: string, targetId: string) {
  const fav = await prisma.favorite.findUnique({
    where: { userId_targetId: { userId, targetId } },
    select: { userId: true },
  })
  return !!fav
}

export async function getFavoriteCount(targetId: string) {
  return prisma.favorite.count({ where: { targetId } })
}
