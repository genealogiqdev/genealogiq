"use server"

import { getTranslations } from "next-intl/server"
import { done, fail, type ActionResult } from "@genealogiq/core"
import { getClientIp, checkRateLimit } from "@/lib/rate-limit"
import { verifyTurnstileToken } from "@/lib/turnstile"
import { getFeedbackSchema } from "@/schemas/feedback.schema"
import { identityTranslator } from "@/schemas/i18n"
import { sendFeedback as sendFeedbackEmail } from "@/lib/email"
import { isAuthorizedMediaReference } from "@genealogiq/services/media-storage"

// Minimum time a real human needs to open the dialog and fill it in — bots
// that skip the honeypot but submit instantly are the target.
const MIN_FILL_TIME_MS = 2000

// Public, unauthenticated surface (footer dialogs reachable by anonymous
// visitors) — anti-abuse layers below run before anything reaches the inbox.
export async function sendFeedback(data: unknown): Promise<ActionResult> {
  const t = await getTranslations("Actions")

  const parsed = getFeedbackSchema(identityTranslator).safeParse(data)
  if (!parsed.success) return fail(t("common.invalidData"))
  if (!isAuthorizedMediaReference(parsed.data.cvUrl, ["career"], { allowLegacy: false })) {
    return fail(t("common.invalidData"))
  }

  const ip = await getClientIp()

  // Honeypot / timing failures are dropped silently (report success) so a
  // bot never learns which signal caught it.
  if (parsed.data.website) return done()
  if (Date.now() - parsed.data.openedAt < MIN_FILL_TIME_MS) return done()

  const limit = await checkRateLimit({ key: `feedback:ip:${ip}`, maxAttempts: 5, windowSeconds: 3600 })
  if (!limit.allowed) return fail(t("feedback.tooManyRequests", { minutes: Math.ceil(limit.retryAfter / 60) }))

  const captchaOk = await verifyTurnstileToken(parsed.data.turnstileToken, ip)
  if (!captchaOk) return fail(t("feedback.captchaFailed"))

  await sendFeedbackEmail({
    type: parsed.data.type,
    email: parsed.data.email,
    message: parsed.data.message,
    cvUrl: parsed.data.cvUrl,
    page: parsed.data.page,
  })
  return done()
}
