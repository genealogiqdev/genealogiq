import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { deadTokens, EXPO_TOKEN } from "./expo-push"

describe("Expo push tokens", () => {
  it("recognises Expo token formats and nothing else", () => {
    expect(EXPO_TOKEN.test("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true)
    expect(EXPO_TOKEN.test("ExpoPushToken[AbC-123_def4567890]")).toBe(true)
    for (const bad of ["", "ExponentPushToken[]", "ExponentPushToken[short]", "https://exp.host/x", "ExponentPushToken[abc def ghi jkl]", "xExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"]) {
      expect(EXPO_TOKEN.test(bad), bad).toBe(false)
    }
  })

  it("prunes only tokens Expo reports as unregistered", () => {
    const tokens = ["a", "b", "c", "d"]
    const tickets = [
      { status: "ok" as const },
      { status: "error" as const, details: { error: "DeviceNotRegistered" } },
      { status: "error" as const, details: { error: "MessageRateExceeded" } },
      // A ticket missing for the last token (short response) must not prune it.
    ]
    expect(deadTokens(tokens, tickets)).toEqual(["b"])
    expect(deadTokens(tokens, [])).toEqual([])
  })
})
