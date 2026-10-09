import { z } from "zod"
import { isAllowedMediaUrl } from "@genealogiq/core"
import type { Translator } from "./i18n"

export function getMemorialSchema(t: Translator) {
  return z.object({
    firstName: z.string().trim().min(1, t("required")).max(100),
    lastName: z.string().trim().min(1, t("required")).max(100),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().nullable(),
    birthDate: z.coerce.date({ error: t("required") }),
    birthPlace: z.string().trim().max(100).optional(),
    birthCountry: z.string().trim().max(100).optional(),
    deathDate: z.coerce.date({ error: t("required") }),
    deathPlace: z.string().trim().max(100).optional(),
    deathCountry: z.string().trim().max(100).optional(),
    avatarUrl: z.string().refine(isAllowedMediaUrl, t("invalidUrl")).optional().nullable(),
  })
}

export type MemorialValues = z.infer<ReturnType<typeof getMemorialSchema>>

export function getMemorialFromTreeSchema(t: Translator) {
  return z.object({
    profileId: z.string().cuid(t("required")),
  })
}
