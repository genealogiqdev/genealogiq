import { z } from "zod"
import { isAllowedMediaUrl } from "@genealogiq/core"
import type { Translator } from "./i18n"
import { addressSchema } from "./address.schema"

export function getGeolocationSchema(t: Translator) {
  return z.object({
    placeName: z.string().trim().min(1, t("required")).max(120, t("maxChars", { count: 120 })),
    address: addressSchema,
    section: z.string().trim().max(200, t("maxChars", { count: 200 })).optional(),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    notes: z.string().trim().max(500, t("maxChars", { count: 500 })).optional(),
    photo1: z.string().refine(isAllowedMediaUrl, t("invalidUrl")).optional().nullable(),
    photo2: z.string().refine(isAllowedMediaUrl, t("invalidUrl")).optional().nullable(),
    photo3: z.string().refine(isAllowedMediaUrl, t("invalidUrl")).optional().nullable(),
  })
}

export type GeolocationFormValues = z.infer<ReturnType<typeof getGeolocationSchema>>
