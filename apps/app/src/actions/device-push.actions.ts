"use server"

import { done, fail, type ActionResult } from "@genealogiq/core"
import { checkRateLimit } from "@genealogiq/services/rate-limit"
import { verifySession } from "@/lib/dal"
import { EXPO_TOKEN } from "@/lib/expo-push"
import { prisma } from "@/lib/prisma"

// Native push registration for the mobile app (docs/WEB-PUSH.md § Native push).
// Mirrors the web-push subscription lifecycle: the token belongs to whoever
// registered it last on that device.

function tokenOf(data: unknown): { token: string; platform: string } | null {
  if (typeof data !== "object" || data === null) return null
  const { token, platform } = data as { token?: unknown; platform?: unknown }
  if (typeof token !== "string" || !EXPO_TOKEN.test(token)) return null
  return { token, platform: platform === "ios" || platform === "android" ? platform : "unknown" }
}

export async function registerDevicePushToken(data: unknown): Promise<ActionResult> {
  const session = await verifySession()
  const parsed = tokenOf(data)
  if (!parsed) return fail("Invalid push token")

  const limit = await checkRateLimit({ key: `device-push:${session.user.id}`, maxAttempts: 20, windowSeconds: 3600 })
  if (!limit.allowed) return fail("Too many requests")

  await prisma.devicePushToken.upsert({
    where: { token: parsed.token },
    create: { userId: session.user.id, token: parsed.token, platform: parsed.platform },
    update: { userId: session.user.id, platform: parsed.platform },
  })
  return done()
}

export async function unregisterDevicePushToken(data: unknown): Promise<ActionResult> {
  const session = await verifySession()
  const parsed = tokenOf(data)
  if (!parsed) return fail("Invalid push token")
  // Only the current owner can remove it; anyone else's request is a no-op.
  await prisma.devicePushToken.deleteMany({ where: { token: parsed.token, userId: session.user.id } })
  return done()
}
