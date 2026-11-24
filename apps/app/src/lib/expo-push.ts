import "server-only"

import { prisma } from "@/lib/prisma"

// Native push for the mobile app through Expo's push service. It complements
// web push (lib/push.ts): a user may have browser subscriptions, device
// tokens, or both. Never throws — notification delivery must not fail the
// action that triggered it.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

/** Expo push tokens look like ExponentPushToken[...] (or ExpoPushToken[...]). */
export const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/

export interface ExpoMessage {
  title: string
  body: string
  /** In-app path opened when the notification is tapped. */
  url: string
}

interface ExpoTicket {
  status?: "ok" | "error"
  details?: { error?: string }
}

/** Tokens Expo reports as permanently dead, by position in the request. Pure, for tests. */
export function deadTokens(tokens: readonly string[], tickets: readonly ExpoTicket[]): string[] {
  return tokens.filter((_token, index) => tickets[index]?.status === "error" && tickets[index]?.details?.error === "DeviceNotRegistered")
}

export async function sendExpoPush(userId: string, message: ExpoMessage): Promise<void> {
  try {
    const rows = await prisma.devicePushToken.findMany({ where: { userId }, select: { token: true } })
    const tokens = rows.map((row) => row.token)
    if (tokens.length === 0) return

    const accessToken = process.env.EXPO_ACCESS_TOKEN
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(
        tokens.map((to) => ({ to, title: message.title, body: message.body, sound: "default", data: { url: message.url } })),
      ),
    })
    if (!response.ok) {
      console.error("[expo-push] send failed", response.status)
      return
    }
    const payload = (await response.json().catch(() => null)) as { data?: ExpoTicket[] } | null
    const dead = deadTokens(tokens, payload?.data ?? [])
    if (dead.length > 0) {
      await prisma.devicePushToken.deleteMany({ where: { token: { in: dead } } }).catch(() => {})
    }
  } catch (error) {
    console.error("[expo-push] fan-out failed", error)
  }
}
