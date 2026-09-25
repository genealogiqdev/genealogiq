import { z } from "zod"
import { isAllowedMediaUrl } from "@genealogiq/core"

// Gallery media is uploaded to Vercel Blob (see /api/gallery/upload), so the
// stored URLs must point at that host — never an arbitrary external origin.
const blobUrl = z.string().refine(isAllowedMediaUrl, "Invalid media URL")

export const mediaItemSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["image", "video"]),
  url: blobUrl,
  poster: blobUrl.optional(),
  // Server-side backstop for the 5-minute cap the upload form already
  // enforces client-side (MAX_VIDEO_SECONDS, gallery-edit-form.tsx) — closes
  // the gap for a client that calls this action directly.
  durationSec: z.number().positive().max(300).optional(),
  takenAt: z.string().optional(),
  location: z.string().trim().max(100).optional(),
  description: z.string().trim().max(280).optional(),
  order: z.number().int().min(0),
})

export const saveGallerySchema = z.object({
  items: z.array(mediaItemSchema),
})

export type MediaItemData = z.infer<typeof mediaItemSchema>
export type SaveGalleryData = z.infer<typeof saveGallerySchema>
