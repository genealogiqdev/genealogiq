"use server"

import { z } from "zod"
import { getTranslations } from "next-intl/server"
import { ok, fail, type ActionResult } from "@genealogiq/core"
import { verifySession } from "@/lib/dal"
import { getMemorialFeatures } from "@/lib/subscription"
import { generateQrDataUrl, type QrDownloadFormat } from "@/lib/qr-download"
import { getProfileById } from "@/queries/profile"

const downloadPetQrSchema = z.object({
  profileId: z.string().min(1),
  format: z.enum(["png", "svg"]),
})

export async function downloadPetQrCode(
  profileId: string,
  format: QrDownloadFormat = "png",
): Promise<ActionResult<{ dataUrl: string }>> {
  const session = await verifySession()
  const t = await getTranslations("Actions")
  const parsed = downloadPetQrSchema.safeParse({ profileId, format })
  if (!parsed.success) return fail(t("common.invalidData"))

  const features = await getMemorialFeatures(session.user.id)
  if (features.code !== "PREMIUM") return fail(t("pet.premiumRequired"))

  // Pet profiles are public. Export access belongs to the Premium viewer,
  // independently of the pet's guardians, places or any physical GenCode.
  const pet = await getProfileById(parsed.data.profileId)
  if (pet?.role !== "APP_PET") return fail(t("pet.notFound"))

  const dataUrl = await generateQrDataUrl(`/profile/${pet.id}`, parsed.data.format)
  return ok({ dataUrl })
}
