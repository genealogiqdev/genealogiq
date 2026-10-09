import { getMemorialFeatures } from "@/lib/subscription"
import { countMemorialsByCreatorId } from "@/queries/memorial"
import { getExtraUnits } from "@/lib/extra-units"
import type { Prisma } from "@genealogiq/db"

export interface MemorialCreationStatus {
  count: number
  limit: number
  allowed: boolean
}

// Consolidates what used to be three independent, disagreeing
// implementations of "can this guardian create another memorial" (a
// hardcoded MAX_MEMORIALS=2 page guard, a real free-tier rule of "1" in
// createMemorial, and a third ad hoc paid-slot formula in the list page)
// into one shared check, driven by the guardian's own resolved plan
// (features.memorialsMax) plus any extra slots purchased on top. This is now
// the ONLY memorial cap: the old per-sale bulk-slot binding (maxProfiles /
// nextSale) went with the B2B package channel it belonged to.
export async function getMemorialCreationStatus(
  guardianId: string,
  db?: Prisma.TransactionClient,
): Promise<MemorialCreationStatus> {
  const [count, features, extra] = await Promise.all([
    countMemorialsByCreatorId(guardianId, db),
    db ? getMemorialFeatures(guardianId, db) : getMemorialFeatures(guardianId),
    db ? getExtraUnits(guardianId, "MEMORIAL", db) : getExtraUnits(guardianId, "MEMORIAL"),
  ])
  const limit = features.memorialsMax + extra
  return { count, limit, allowed: count < limit }
}
