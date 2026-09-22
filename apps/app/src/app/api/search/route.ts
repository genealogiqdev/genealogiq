import { NextResponse } from "next/server"
import type { Prisma } from "@genealogiq/db"
import { checkRateLimit } from "@genealogiq/services/rate-limit"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

// Open search across all AppUsers (memorials + living): a logged-in user can
// look up any profile by name. Memorials are public-facing by product design
// (/profile/[id] is reachable without authorization for the viewer), so the
// search has no per-result visibility filter. If a private/"discoverable" flag
// is ever added to AppUser, gate the where-clause on it here.
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Bounds reconnaissance for target-selection abuse (this is the only way to
  // discover a profileId to spam requestGuardianship/addRelation against).
  const limit = await checkRateLimit({ key: `search:${session.user.id}`, maxAttempts: 120, windowSeconds: 3600 })
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const searchParams = new URL(request.url).searchParams
  const q = searchParams.get("q")?.trim() ?? ""
  const mode = searchParams.get("mode")
  if (q.length < (mode === "pet" ? 1 : 3)) return NextResponse.json([])

  const terms = q.split(/\s+/).filter(Boolean)
  const roleFilter: Prisma.AppUserWhereInput = mode === "pet"
    ? { role: "APP_PET", guardedBy: { some: { guardianId: session.user.id, status: "ACCEPTED" } } }
    : mode === "relative"
      ? { role: { in: ["APP_USER", "APP_MEMO"] } }
      : { role: { in: ["APP_USER", "APP_MEMO", "APP_PET"] } }

  const results = await prisma.appUser.findMany({
    where: {
      ...roleFilter,
      AND: terms.map((term) => ({
        OR: [
          { firstName: { contains: term, mode: "insensitive" } },
          { lastName: { contains: term, mode: "insensitive" } },
          { petSpecies: { contains: term, mode: "insensitive" } },
          { petBreed: { contains: term, mode: "insensitive" } },
        ],
      })),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      gender: true,
      role: true,
      birthPlace: true,
      birthCountry: true,
      deathDate: true,
      petSpecies: true,
      petBreed: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 8,
  })

  return NextResponse.json(results)
}
