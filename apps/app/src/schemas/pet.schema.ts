import { z } from "zod"
import { BLOB_URL_PATTERN } from "@genealogiq/core"
import type { Translator } from "./i18n"

// Identity fields shared by create and update — species/breed are free text
// (no fixed taxonomy needed for v1). Unlike a memorial, birth/death dates are
// both optional: most pets registered will be alive.
function petIdentityShape(t: Translator) {
  return {
    firstName: z.string().trim().min(1, t("required")).max(64),
    species: z.string().trim().max(40).optional().nullable(),
    breed: z.string().trim().max(60).optional().nullable(),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().nullable(),
    birthDate: z.coerce.date().optional().nullable(),
    deathDate: z.coerce.date().optional().nullable(),
    avatarUrl: z.string().regex(BLOB_URL_PATTERN, t("invalidUrl")).optional().nullable(),
  }
}

function deathAfterBirth<T extends { birthDate?: Date | null; deathDate?: Date | null }>(d: T): boolean {
  return !d.birthDate || !d.deathDate || d.deathDate >= d.birthDate
}

export function getPetSchema(t: Translator) {
  return z.object({
    ...petIdentityShape(t),
    // Existing tree members to attach this pet to as owner(s) — create-only,
    // IDOR-checked server-side against the creator's own tree.
    ownerIds: z.array(z.string().cuid()).min(1, t("required")),
  }).refine(deathAfterBirth, { message: t("deathBeforeBirth"), path: ["deathDate"] })
}

export type PetValues = z.infer<ReturnType<typeof getPetSchema>>

export function getPetEditSchema(t: Translator) {
  return z.object({
    ...petIdentityShape(t),
    ownerIds: z.array(z.string().cuid()).min(1, t("required")),
  })
    .refine(deathAfterBirth, { message: t("deathBeforeBirth"), path: ["deathDate"] })
}

export type PetEditValues = z.infer<ReturnType<typeof getPetEditSchema>>
