import { z } from "zod"
import { isAllowedMediaUrl } from "@genealogiq/core"
import type { Translator } from "./i18n"
import { addressSchema } from "./address.schema"
import { PLACE_CATEGORIES } from "@/consts/place-categories"

const MAX_PHOTOS = 6

// Place photos are uploaded to Vercel Blob (see /api/places/upload), so stored
// URLs must point at that host — never an arbitrary external origin.
const blobUrl = z.string().refine(isAllowedMediaUrl, "Invalid media URL")

export function getPlaceSchema(t: Translator) {
  return z
    .object({
      title: z.string().trim().min(1, t("required")).max(120, t("maxChars", { count: 120 })),
      description: z.string().trim().max(2000, t("maxChars", { count: 2000 })).optional(),
      categories: z.array(z.enum(PLACE_CATEGORIES as [string, ...string[]])).max(PLACE_CATEGORIES.length),
      address: addressSchema,
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      photos: z.array(blobUrl).max(MAX_PHOTOS),
      // ISO date strings from <input type="date">, or null when unset.
      // startDate is required (min(1) rejects the empty string an untouched
      // native date input submits); endDate has no min — an empty string is
      // a valid "not set" value, normalized to null downstream by toDate().
      startDate: z.string().trim().min(1, t("required")).nullish(),
      endDate: z.string().trim().nullish(),
    })
    .refine(
      (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate,
      { path: ["endDate"], message: t("endBeforeStart") },
    )
}

export type PlaceFormValues = z.infer<ReturnType<typeof getPlaceSchema>>

export const PLACE_MAX_PHOTOS = MAX_PHOTOS
