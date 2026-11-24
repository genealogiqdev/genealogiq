import "server-only"

import webpush, { WebPushError } from "web-push"
import * as Sentry from "@sentry/nextjs"
import { prisma } from "@/lib/prisma"
import {
  buildPushPayload,
  shouldPruneSubscription,
} from "@/lib/push-payload"
import type { NotificationType } from "@genealogiq/db"
import { sendExpoPush } from "@/lib/expo-push"

// Mirrors NotifyArgs in lib/notifications.ts — notify() forwards its args here.
interface PushArgs {
  type: NotificationType
  userId: string
  tributeId?: string | null
  familyRelationId?: string | null
  appUserGuardianId?: string | null
}

let vapidConfigured = false
let warnedMissingConfig = false

// Missing VAPID env disables push gracefully: the in-app inbox still works,
// sends become no-ops, and we warn once per process instead of per send.
function ensureConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true
      console.warn("[push] VAPID env vars missing — web push disabled")
    }
    return false
  }
  if (!vapidConfigured) {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    vapidConfigured = true
  }
  return true
}

// Deep-link targets mirror the DISPATCH map in components/messages-list.tsx.
// URLs stay relative — the service worker resolves them against its origin.
async function resolveUrl(args: PushArgs): Promise<string> {
  if ((args.type === "TRIBUTE_APPROVED" || args.type === "TRIBUTE_REJECTED") && args.tributeId) {
    const tribute = await prisma.tribute.findUnique({
      where: { id: args.tributeId },
      select: { profileId: true },
    })
    if (tribute) return `/profile/${tribute.profileId}/tributes`
  }
  if (args.type === "GUARDIAN_REQUEST_ACCEPTED" && args.appUserGuardianId) {
    const guardianship = await prisma.appUserGuardian.findUnique({
      where: { id: args.appUserGuardianId },
      select: { appUserId: true },
    })
    if (guardianship) return `/profile/${guardianship.appUserId}`
  }
  // Pending items are actioned on /messages; visiting also marks all read.
  return "/messages"
}

/**
 * Native (Expo) push for the mobile app. Independent of web push: it needs no
 * VAPID keys and has its own device tokens. Never throws.
 */
export async function sendNativePushForNotification(args: PushArgs): Promise<void> {
  try {
    const recipient = await prisma.appUser.findUnique({
      where: { id: args.userId },
      select: { preferredLocale: true, _count: { select: { devicePushTokens: true } } },
    })
    if (!recipient || recipient._count.devicePushTokens === 0) return
    const payload = buildPushPayload({
      type: args.type,
      locale: recipient.preferredLocale,
      url: await resolveUrl(args),
      entityId: args.tributeId ?? args.familyRelationId ?? args.appUserGuardianId ?? null,
    })
    await sendExpoPush(args.userId, { title: payload.title, body: payload.body, url: payload.url })
  } catch (error) {
    console.error("[push] native fan-out failed", error)
  }
}

/**
 * Fans a just-created in-app Notification out to the recipient's push
 * subscriptions. Runs inside next/server after() — it must never throw, so
 * the whole body is guarded and per-endpoint failures are contained.
 */
export async function sendPushForNotification(args: PushArgs): Promise<void> {
  try {
    if (!ensureConfigured()) return

    const recipient = await prisma.appUser.findUnique({
      where: { id: args.userId },
      select: {
        preferredLocale: true,
        pushSubscriptions: {
          select: { id: true, endpoint: true, p256dh: true, auth: true },
        },
      },
    })
    if (!recipient || recipient.pushSubscriptions.length === 0) return

    const url = await resolveUrl(args)
    const payload = JSON.stringify(
      buildPushPayload({
        type: args.type,
        locale: recipient.preferredLocale,
        url,
        entityId:
          args.tributeId ?? args.familyRelationId ?? args.appUserGuardianId ?? null,
      })
    )

    await Promise.allSettled(
      recipient.pushSubscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            { TTL: 86400, urgency: "normal" }
          )
        } catch (error) {
          const statusCode = error instanceof WebPushError ? error.statusCode : undefined
          if (shouldPruneSubscription(statusCode)) {
            // Endpoint permanently gone (browser unsubscribed/site data cleared).
            await prisma.pushSubscription
              .delete({ where: { id: subscription.id } })
              .catch(() => {})
            return
          }
          console.error("[push] send failed", statusCode, subscription.endpoint)
          if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
            Sentry.captureException(error)
          }
        }
      })
    )
  } catch (error) {
    console.error("[push] fan-out failed", error)
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error)
    }
  }
}
