import { z } from "zod"
import { isAllowedMediaUrl } from "@genealogiq/core"
import type { Translator } from "./i18n"

export function getTributeSchema(t: Translator) {
  return z.object({
    text: z.string().trim().min(1, t("tributeTextRequired")).max(512, t("maxChars", { count: 512 })),
    imageUrl: z.string().refine(isAllowedMediaUrl, t("invalidUrl")).optional(),
  })
}

export type TributeFormData = z.infer<ReturnType<typeof getTributeSchema>>
