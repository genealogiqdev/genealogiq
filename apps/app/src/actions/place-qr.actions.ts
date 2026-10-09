"use server"

import QRCode from "qrcode"
import { z } from "zod"
import { getTranslations } from "next-intl/server"
import { ok, fail, type ActionResult } from "@genealogiq/core"
import { verifySession } from "@/lib/dal"
import { getMemorialFeatures } from "@/lib/subscription"
import { getPlaceById } from "@/queries/places"

const downloadPlaceQrSchema = z.object({
  profileId: z.string().min(1),
  placeId: z.string().min(1),
})

export async function downloadPlaceQrCode(
  profileId: string,
  placeId: string,
): Promise<ActionResult<{ dataUrl: string }>> {
  const session = await verifySession()
  const t = await getTranslations("Actions")
  const parsed = downloadPlaceQrSchema.safeParse({ profileId, placeId })
  if (!parsed.success) return fail(t("common.invalidData"))

  // Downloads belong to the viewing account's live Premium entitlement.
  // A memorial's Premium guardian or physical GenCode cannot unlock a FREE viewer.
  const features = await getMemorialFeatures(session.user.id)
  if (features.code !== "PREMIUM") return fail(t("places.premiumRequired"))

  const place = await getPlaceById(parsed.data.profileId, parsed.data.placeId)
  if (!place?.qrGenerated) return fail(t("places.notFound"))

  const target = new URL(
    `/profile/${place.userId}/places/${place.id}`,
    process.env.APP_URL ?? "https://genealogiq.app",
  ).href
  const dataUrl = await QRCode.toDataURL(target, {
    errorCorrectionLevel: "H",
    margin: 4,
    width: 2048,
    color: { dark: "#0F172A", light: "#FFFFFF" },
  })

  return ok({ dataUrl })
}
