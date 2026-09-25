import { z } from "zod"
import { isAllowedMediaUrl } from "@genealogiq/core"
import type { Translator } from "./i18n"
import { addressSchema } from "./address.schema"

export { addressSchema }

// `isMemorialized` gates the death fields: a memorial requires date/country/city/state;
// a living profile leaves them optional (the form hides the Death section for it).
export function getProfileEditSchema(t: Translator, isMemorialized = false) {
  const requiredText = () => z.string().trim().min(1, t("required")).max(100)
  const optionalText = () => z.string().trim().max(100).optional()
  // Kept nullable so the form's Date | null value fits; required-ness is enforced in
  // the superRefine below (a field-level refine narrows the type away from null).
  const dateField = () => z.coerce.date().optional().nullable()

  return z
    .object({
      // Identity
      firstName:  requiredText(),
      lastName:   requiredText(),
      maidenName: optionalText(),
      nickname:   optionalText(),
      gender:     z.enum(["MALE", "FEMALE", "OTHER"]).nullable(),
      avatarUrl:  z.string().refine(isAllowedMediaUrl, t("invalidUrl")).optional().nullable(),

      // Birth (required)
      birthDate:    dateField(),
      birthPlace:   requiredText(), // city
      birthState:   requiredText(),
      birthCountry: requiredText(),

      // Death (required only for memorials; the living form doesn't render these)
      deathDate:    dateField(),
      deathPlace:   isMemorialized ? requiredText() : optionalText(),
      deathState:   isMemorialized ? requiredText() : optionalText(),
      deathCountry: isMemorialized ? requiredText() : optionalText(),
      deathCause:   z.string().trim().max(200).optional(),

      // Contact + Address (all optional; the memorial form doesn't render these)
      phoneCountryCode: z.string().trim().max(5).optional(),
      phone:            z.string().trim().max(30).optional(),
      address:          addressSchema,

      // Social (all optional)
      website:     z.string().trim().max(250).optional(),
      instagram:   z.string().trim().max(250).optional(),
      linkedin:    z.string().trim().max(250).optional(),
      fb:          z.string().trim().max(250).optional(),
      x:           z.string().trim().max(250).optional(),
      tiktok:      z.string().trim().max(250).optional(),
      youtube:     z.string().trim().max(250).optional(),
      otherSocial: z.string().trim().max(250).optional(),

      // Notes
      notes: z.string().trim().max(1000).optional(),

      // Visibility (living profiles only; present in the shared schema so the
      // memorial form's parse doesn't choke on it, but updateMemorial never
      // reads this key — see actions/memorial.actions.ts, unchanged).
      isPublicProfile: z.boolean(),
    })
    .superRefine((val, ctx) => {
      if (val.gender == null) ctx.addIssue({ code: "custom", path: ["gender"], message: t("required") })
      if (val.birthDate == null) ctx.addIssue({ code: "custom", path: ["birthDate"], message: t("required") })
      if (isMemorialized && val.deathDate == null) {
        ctx.addIssue({ code: "custom", path: ["deathDate"], message: t("required") })
      }
    })
}

export type ProfileEditValues = z.infer<ReturnType<typeof getProfileEditSchema>>
