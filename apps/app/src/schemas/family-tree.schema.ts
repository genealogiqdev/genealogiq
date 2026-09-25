import { z } from "zod"
import { isAllowedMediaUrl } from "@genealogiq/core"
import type { Translator } from "./i18n"

// ─── Subtype canon ───────────────────────────────────────────────────────────
// "blood" (regular/by-birth) is the implicit default — represented by a null
// subtype in the DB. Only the *special* subtypes need to be enumerated here.

export const PARENT_OF_SUBTYPES = ["adopted", "step"] as const
export const SPOUSE_SUBTYPES    = ["married", "divorced", "partner", "widowed"] as const
export const SIBLING_SUBTYPES   = ["half", "adopted", "step"] as const

export type ParentOfSubtype = typeof PARENT_OF_SUBTYPES[number]
export type SpouseSubtype   = typeof SPOUSE_SUBTYPES[number]
export type SiblingSubtype  = typeof SIBLING_SUBTYPES[number]

export const RELATION_TYPES = ["PARENT_OF", "SPOUSE", "SIBLING"] as const
export type RelationType = typeof RELATION_TYPES[number]

const makeDateString = (t: Translator) =>
  z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, t("invalidDate"))
    .refine((s) => !Number.isNaN(new Date(s).getTime()), t("invalidDate"))
    .optional()
    .nullable()

const subtypeForType = (type: RelationType): readonly string[] =>
  type === "PARENT_OF" ? PARENT_OF_SUBTYPES
  : type === "SPOUSE"  ? SPOUSE_SUBTYPES
  : SIBLING_SUBTYPES

// ─── addRelation ─────────────────────────────────────────────────────────────

export function getAddRelationSchema(t: Translator) {
  const dateString = makeDateString(t)
  return z.object({
    fromId:        z.string().cuid(),
    toId:          z.string().cuid(),
    type:          z.enum(RELATION_TYPES),
    subtype:       z.string().min(1).optional().nullable(),
    startDate:     dateString,
    endDate:       dateString,
    // When set on a PARENT_OF add, the action also creates a SPOUSE relation
    // between the new parent and `linkSpouseId` (the existing other parent).
    linkSpouseId:  z.string().cuid().optional().nullable(),
  }).refine((d) => !d.subtype || subtypeForType(d.type).includes(d.subtype), {
    message: t("invalidSubtypeForType"),
    path:    ["subtype"],
  }).refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    message: t("endBeforeStart"),
    path:    ["endDate"],
  })
}

export type AddRelationInput = z.infer<ReturnType<typeof getAddRelationSchema>>

// ─── addGhostRelative ────────────────────────────────────────────────────────

function makeGhostIdentity(t: Translator) {
  const dateString = makeDateString(t)
  return z.object({
    firstName:  z.string().trim().min(1, t("required")).max(64),
    lastName:   z.string().trim().min(1, t("required")).max(64),
    maidenName: z.string().trim().max(64).optional().nullable(),
    nickname:   z.string().trim().max(40).optional().nullable(),
    gender:     z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
    birthDate:  dateString,
    deathDate:  dateString,
    birthPlace: z.string().trim().max(100).optional().nullable(),
    deathPlace: z.string().trim().max(100).optional().nullable(),
  })
}

export function getAddGhostRelativeSchema(t: Translator) {
  const dateString = makeDateString(t)
  return makeGhostIdentity(t).extend({
    avatarUrl:    z.string().refine(isAllowedMediaUrl, t("invalidUrl")).optional().nullable(),
    anchorId:     z.string().cuid(),
    kind:         z.enum(["parent", "child", "spouse", "sibling"]),
    subtype:      z.string().min(1).optional().nullable(),
    startDate:    dateString,
    endDate:      dateString,
    linkSpouseId: z.string().cuid().optional().nullable(),
  }).refine((d) => {
    if (!d.subtype) return true
    const type: RelationType = d.kind === "spouse" ? "SPOUSE" : d.kind === "sibling" ? "SIBLING" : "PARENT_OF"
    return subtypeForType(type).includes(d.subtype)
  }, {
    message: t("invalidSubtypeForKind"),
    path:    ["subtype"],
  }).refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    message: t("endBeforeStart"),
    path:    ["endDate"],
  }).refine((d) => !d.birthDate || !d.deathDate || d.deathDate >= d.birthDate, {
    message: t("deathBeforeBirth"),
    path:    ["deathDate"],
  })
}

export type AddGhostRelativeInput = z.infer<ReturnType<typeof getAddGhostRelativeSchema>>

// ─── updateMember (identity patch) ───────────────────────────────────────────

export function getUpdateMemberSchema(t: Translator) {
  return makeGhostIdentity(t).extend({
    avatarUrl: z.string().refine(isAllowedMediaUrl, t("invalidUrl")).optional().nullable(),
  }).refine((d) => !d.birthDate || !d.deathDate || d.deathDate >= d.birthDate, {
    message: t("deathBeforeBirth"),
    path:    ["deathDate"],
  })
}

export type UpdateMemberInput = z.infer<ReturnType<typeof getUpdateMemberSchema>>

// ─── updateRelation (subtype + dates) ────────────────────────────────────────

export function getUpdateRelationSchema(t: Translator) {
  const dateString = makeDateString(t)
  return z.object({
    subtype:   z.string().min(1).optional().nullable(),
    startDate: dateString,
    endDate:   dateString,
  }).refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    message: t("endBeforeStart"),
    path:    ["endDate"],
  })
}

export type UpdateRelationInput = z.infer<ReturnType<typeof getUpdateRelationSchema>>
