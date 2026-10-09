"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { fail, ok, type ActionResult } from "@genealogiq/core"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/dal"
import { getMemorialCreationStatus } from "@/lib/memorial-quota"
import { getMemorialFeatures } from "@/lib/subscription"
import type { PlanTier } from "@/lib/plan-quotas"
import { getTreeMemorialScope } from "@/queries/tree-memorial"
import { getMemorialFromTreeSchema } from "@/schemas/memorial.schema"
import { identityTranslator } from "@/schemas/i18n"

export type MemorialFromTreeResult = ActionResult<{ id: string; alreadyAdded: boolean }> & {
  quota?: { limit: number; tier: PlanTier }
}

export async function addMemorialFromTree(data: unknown): Promise<MemorialFromTreeResult> {
  const t = await getTranslations("Actions")
  const session = await verifySession()
  const parsed = getMemorialFromTreeSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(t("common.invalidData"))
  const guardianId = session.user.id
  const { profileId } = parsed.data
  if (profileId === guardianId) return fail(t("treeMemorial.unavailable"))

  // SERIALIZABLE + retry makes two additions competing for the last slot
  // recheck the count, and makes stale submissions for the same person harmless.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx): Promise<MemorialFromTreeResult> => {
        const profile = await tx.appUser.findFirst({
          where: { AND: [await getTreeMemorialScope(guardianId, tx), { id: profileId }] },
          select: {
            id: true,
            role: true,
            guardedBy: {
              where: { status: "ACCEPTED" },
              select: { guardianId: true, status: true },
            },
          },
        })
        if (!profile || !profile.guardedBy.some((g) => g.guardianId === guardianId && g.status === "ACCEPTED")) {
          return fail(t("treeMemorial.unavailable"))
        }
        // These profiles already consume their own quota. Opening them, even
        // after a downgrade, must not charge another slot or change a pet's role.
        if (profile.role === "APP_MEMO" || profile.role === "APP_PET") {
          return ok({ id: profile.id, alreadyAdded: true })
        }
        if (profile.role !== "APP_GHOST") return fail(t("treeMemorial.unavailable"))

        // Role belongs to the profile, so promotion affects every accepted
        // guardian's memorial count. Check the actor first for actionable UX.
        const guardians = [guardianId, ...profile.guardedBy.map((g) => g.guardianId).filter((id) => id !== guardianId)]
        for (const id of guardians) {
          const status = await getMemorialCreationStatus(id, tx)
          if (!status.allowed) {
            if (id !== guardianId) return fail(t("treeMemorial.coGuardianLimit"))
            const features = await getMemorialFeatures(guardianId, tx)
            return {
              ...fail(t("memorial.limitReached", { max: status.limit })),
              quota: { limit: status.limit, tier: features.code },
            }
          }
        }

        // Preserve identity, content, guardians, dates and all family/pet links.
        await tx.appUser.update({
          where: { id: profile.id, role: "APP_GHOST" },
          data: { role: "APP_MEMO" },
        })
        return ok({ id: profile.id, alreadyAdded: false })
      }, { isolationLevel: "Serializable" })

      if (result.ok) {
        revalidatePath("/home")
        revalidatePath("/profile/[id]", "page")
        revalidatePath("/profile/[id]/memorialized", "page")
        revalidatePath("/profile/[id]/memorialized/from-tree", "page")
        revalidatePath("/profile/[id]/tree", "page")
        revalidatePath(`/profile/${profileId}`, "layout")
      }
      return result
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2034") throw error
    }
  }
  return fail(t("treeMemorial.retry"))
}
