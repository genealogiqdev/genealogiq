import { z } from "zod"
import { isAllowedMediaUrl } from "@genealogiq/core"
import type { Translator } from "./i18n"

export function getFeedbackSchema(t: Translator) {
  return z.object({
    type: z.enum(["bug", "contact", "career"]),
    email: z.string().trim().email(t("invalidEmail")),
    message: z.string().trim().min(1, t("required")).max(2000),
    cvUrl: z.string().url().refine(isAllowedMediaUrl, t("invalidUrl")).optional(),
    page: z.string().trim().max(500).optional(),
    // Honeypot: a real submitter never fills this (hidden via CSS). Non-empty
    // means a bot filled every visible-looking field, including this one.
    // No length constraint here — the action checks it, so a bot doesn't get
    // a validation-error signal distinguishing this field from any other.
    website: z.string().optional(),
    // Epoch ms when the dialog opened, used server-side to reject
    // submissions faster than a human could plausibly fill the form.
    openedAt: z.number(),
    // No min-length: an empty token is a no-op locally (no site key configured)
    // but fails real verification in prod (Cloudflare rejects an empty
    // response) — see lib/turnstile.ts.
    turnstileToken: z.string(),
  })
}

export type FeedbackValues = z.infer<ReturnType<typeof getFeedbackSchema>>
