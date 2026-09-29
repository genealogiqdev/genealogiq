"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { ok, fail, type ActionResult } from "@genealogiq/core"
import { canActivate, consumeCreditForActivation, InsufficientCreditsError } from "@genealogiq/services/credits"
import { grantActivationTrial } from "@genealogiq/services/activation-trial"
import { isAuthorizedMediaReference } from "@genealogiq/services/media-storage"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/dal"
import { getMemorialSchema } from "@/schemas/memorial.schema"
import { identityTranslator } from "@/schemas/i18n"

// Deliberately does NOT check getMemorialCreationStatus/memorialsMax — a
// redeemed physical QR license is itself a standalone purchase, independent
// of the guardian's own plan's memorial quota. Gating this against
// memorialsMax would mean charging for the same slot twice.
export async function activateGenCode(
  genCode: string,
  data: unknown,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations("Actions")
  const session = await verifySession()

  const license = await prisma.genCode.findUnique({
    where: { genCode },
    select: {
      id: true, status: true, tenantId: true,
      mintedInOrder: {
        select: { activationTrialMonths: true, activationTrialPlanCode: true },
      },
      mintedInCycle: {
        select: { planSnapshot: true },
      },
      tenant: {
        select: {
          partnerSubscriptions: {
            where:   { status: "ACTIVE" },
            select:  { plan: { select: { activationTrialMonths: true, activationTrialPlanCode: true } } },
            take:    1,
          },
        },
      },
    },
  })
  if (!license)                       return fail(t("gencode.notFound"))
  // A code can be activated whether it's still in stock (AVAILABLE) or already
  // sold/written-off (SOLD) — only an already-ACTIVATED code is rejected.
  if (license.status === "ACTIVATED") return fail(t("gencode.alreadyActivated"))
  // The partner must still have credit for this. This gates ACTIVATION only —
  // a memorial that already redeemed a code is never revisited, because the
  // family bought a physical plaque and it must not go dark over someone else's
  // billing.
  if (!(await canActivate(license.tenantId, license.id))) return fail(t("gencode.expired"))

  const parsed = getMemorialSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(parsed.error.issues[0].message)
  if (!isAuthorizedMediaReference(
    parsed.data.avatarUrl,
    [`pending/${session.user.id}/create-memorial`],
    { allowLegacy: false },
  )) {
    return fail(t("common.invalidData"))
  }

  const { firstName, lastName, gender, birthDate, birthPlace, birthCountry, deathDate, deathPlace, deathCountry, avatarUrl } = parsed.data

  try {
    const memorial = await prisma.$transaction(async (tx) => {
      const memo = await tx.appUser.create({
        data: {
          firstName,
          lastName,
          gender:       gender ?? null,
          role:         "APP_MEMO",
          birthDate,
          birthPlace,
          birthCountry,
          deathDate,
          deathPlace,
          deathCountry,
          avatarUrl,
        },
      })
      await tx.appUserGuardian.create({
        data: { appUserId: memo.id, guardianId: session.user.id },
      })
      // Spending the credit is part of the SAME transaction that creates the
      // memorial. A family must never end up with a half-created memorial and a
      // spent credit, nor with a memorial nobody paid for.
      const creditTransactionId = await consumeCreditForActivation(tx, {
        tenantId:  license.tenantId,
        genCodeId: license.id,
      })
      await tx.genCode.update({
        where: { id: license.id },
        data:  { status: "ACTIVATED", appUserId: memo.id, activatedAt: new Date(), creditTransactionId },
      })

      // Closes the B2B2C loop: redeeming a plaque puts the guardian on the
      // partner plan's trial tier instead of dropping them straight to FREE.
      // Inside the same transaction, because a memorial that exists without the
      // trial it was sold with is a support ticket nobody can reconstruct.
      const trial = license.mintedInOrder
        ?? activationTrialFromSnapshot(license.mintedInCycle?.planSnapshot)
        ?? license.tenant?.partnerSubscriptions[0]?.plan
      if (trial) {
        await grantActivationTrial(tx, {
          guardianId: session.user.id,
          tenantId:   license.tenantId,
          months:     trial.activationTrialMonths,
          planCode:   trial.activationTrialPlanCode,
        })
      }

      return memo
    })

    revalidatePath(`/profile/${session.user.id}/memorialized`)
    return ok({ id: memorial.id })
  } catch (err: unknown) {
    // Two families racing for a partner's last unit: one wins, the other is told
    // there is no credit rather than getting a memorial nobody paid for.
    if (err instanceof InsufficientCreditsError) return fail(t("gencode.expired"))
    // P2002 on genCode.appUserId unique — race condition
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return fail(t("gencode.raceRetry"))
    }
    throw err
  }
}

function activationTrialFromSnapshot(value: unknown): {
  activationTrialMonths: number
  activationTrialPlanCode: string | null
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const snapshot = value as Record<string, unknown>
  if (typeof snapshot.activationTrialMonths !== 'number') return null
  if (
    snapshot.activationTrialPlanCode !== null
    && typeof snapshot.activationTrialPlanCode !== 'string'
  ) return null

  return {
    activationTrialMonths: snapshot.activationTrialMonths,
    activationTrialPlanCode: snapshot.activationTrialPlanCode,
  }
}
