"use server"

import { getLocale, getTranslations } from "next-intl/server"
import { fail, ok, type ActionResult } from "@genealogiq/core"
import { verifySession } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { checkRateLimit } from "@/lib/rate-limit"
import { startScanSchema } from "@/lib/genealogy-scan/request"
import { interruptScan, startScan } from "@/lib/genealogy-scan/service"

// Genealogy Scan (docs/GENEALOGY-SCAN.md). Starting a scan spends real money on
// the Anthropic API, so it is Premium-only, capped per month, idempotent per
// requestId and rate-limited. The user id always comes from the session.

export async function startGenealogyScan(data: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await verifySession()
  const t = await getTranslations("Actions")

  const parsed = startScanSchema.safeParse(data)
  if (!parsed.success) return fail(t("common.invalidData"))

  const limit = await checkRateLimit({ key: `genealogy-scan:${session.user.id}`, maxAttempts: 10, windowSeconds: 3600 })
  if (!limit.allowed) return fail(t("genealogyScan.tooManyRequests"))

  const result = await startScan(session.user.id, parsed.data, await getLocale())
  if (!result.ok) return fail(t(`genealogyScan.${result.denial}`))
  return ok({ id: result.scan.id })
}

export async function deleteGenealogyScan(scanId: string): Promise<ActionResult> {
  const session = await verifySession()
  const t = await getTranslations("Actions")
  if (typeof scanId !== "string" || !scanId) return fail(t("common.invalidData"))

  // Scoped by owner: another user's scan id behaves exactly like a missing one.
  const scan = await prisma.genealogyScan.findFirst({ where: { id: scanId, appUserId: session.user.id } })
  if (!scan) return fail(t("genealogyScan.notFound"))

  await interruptScan(scan)
  await prisma.genealogyScan.delete({ where: { id: scan.id } })
  return ok(undefined, t("genealogyScan.deleted"))
}
