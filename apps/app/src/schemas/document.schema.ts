import { z } from "zod"
import { isAllowedMediaUrl } from "@genealogiq/core"
import type { Translator } from "./i18n"
import { DOCUMENT_CATEGORIES } from "@/consts/document-categories"

// Document files are uploaded to Vercel Blob (see /api/documents/upload), so stored
// URLs must point at that host — never an arbitrary external origin.
const blobUrl = z.string().refine(isAllowedMediaUrl, "Invalid media URL")

export function getDocumentSchema(t: Translator) {
  return z.object({
    title: z.string().trim().min(1, t("required")).max(120, t("maxChars", { count: 120 })),
    description: z.string().trim().max(2000, t("maxChars", { count: 2000 })).optional(),
    category: z.enum(DOCUMENT_CATEGORIES as [string, ...string[]]),
    fileUrl: blobUrl,
    fileName: z.string().trim().optional(),
    isPublic: z.boolean(),
  })
}

export type DocumentFormValues = z.infer<ReturnType<typeof getDocumentSchema>>
