import { z } from "zod"
import { isAllowedMediaUrl } from "@genealogiq/core"

export const bioImageSchema = z.object({
  id: z.string().optional(),
  // Bio images are uploaded to Vercel Blob — pin the host (see /api/bio/upload).
  url: z.string().refine(isAllowedMediaUrl, "Invalid media URL"),
  aspect: z.enum(["square", "portrait", "landscape"]).default("square"),
  order: z.number().int().min(0),
})

export const bioSchema = z.object({
  quote: z.string().trim().max(140).optional(),
  text: z.string().trim().optional(),
  images: z.array(bioImageSchema).default([]),
})

export type BioFormData = z.infer<typeof bioSchema>
export type BioImageData = z.infer<typeof bioImageSchema>
