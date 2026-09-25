import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { sendFeedbackMock, verifyTurnstileTokenMock } = vi.hoisted(() => ({
  sendFeedbackMock: vi.fn(),
  verifyTurnstileTokenMock: vi.fn(),
}))

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock("@/lib/email", () => ({ sendFeedback: sendFeedbackMock }))
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken: verifyTurnstileTokenMock }))
vi.mock("@genealogiq/services/media-storage", () => ({ isAuthorizedMediaReference: vi.fn(() => true) }))
vi.mock("@/lib/rate-limit", () => ({
  getClientIp: vi.fn(async () => "1.2.3.4"),
  checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfter: 0 })),
}))

import { sendFeedback } from "./feedback.actions"
import { checkRateLimit } from "@/lib/rate-limit"

const OPENED_AT = 1_700_000_000_000

const validInput = (overrides: Record<string, unknown> = {}) => ({
  type: "bug",
  email: "ada@example.com",
  message: "Something broke on the profile page.",
  openedAt: OPENED_AT,
  turnstileToken: "valid-token",
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfter: 0 } as never)
  verifyTurnstileTokenMock.mockResolvedValue(true)
  sendFeedbackMock.mockResolvedValue(undefined)
  vi.spyOn(Date, "now").mockReturnValue(OPENED_AT + 5000)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("sendFeedback — input validation", () => {
  it("rejects an empty message before sending any email", async () => {
    const res = await sendFeedback(validInput({ message: "" }))

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(sendFeedbackMock).not.toHaveBeenCalled()
  })

  it("rejects an invalid type before sending any email", async () => {
    const res = await sendFeedback(validInput({ type: "not-a-type" }))

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(sendFeedbackMock).not.toHaveBeenCalled()
  })

  it("rejects an invalid email before sending any email", async () => {
    const res = await sendFeedback(validInput({ email: "not-an-email" }))

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(sendFeedbackMock).not.toHaveBeenCalled()
  })

  it("rejects a non-object payload", async () => {
    const res = await sendFeedback(null)

    expect(res).toEqual({ ok: false, message: "common.invalidData" })
    expect(sendFeedbackMock).not.toHaveBeenCalled()
  })
})

describe("sendFeedback — anti-abuse", () => {
  it("silently drops (reports success) when the honeypot field is filled", async () => {
    const res = await sendFeedback(validInput({ website: "https://spam.example.com" }))

    expect(res).toEqual({ ok: true, message: undefined })
    expect(sendFeedbackMock).not.toHaveBeenCalled()
  })

  it("silently drops (reports success) when submitted faster than the minimum fill time", async () => {
    vi.mocked(Date.now).mockReturnValue(OPENED_AT + 500)

    const res = await sendFeedback(validInput())

    expect(res).toEqual({ ok: true, message: undefined })
    expect(sendFeedbackMock).not.toHaveBeenCalled()
  })

  it("bails on rate-limit before sending", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfter: 120 } as never)

    const res = await sendFeedback(validInput())

    expect(res).toEqual({ ok: false, message: "feedback.tooManyRequests" })
    expect(sendFeedbackMock).not.toHaveBeenCalled()
  })

  it("rejects when Turnstile verification fails", async () => {
    verifyTurnstileTokenMock.mockResolvedValue(false)

    const res = await sendFeedback(validInput())

    expect(res).toEqual({ ok: false, message: "feedback.captchaFailed" })
    expect(sendFeedbackMock).not.toHaveBeenCalled()
  })
})

describe("sendFeedback — happy path", () => {
  it("sends the email with the submitted fields, no session required", async () => {
    const res = await sendFeedback(validInput())

    expect(res).toEqual({ ok: true, message: undefined })
    expect(sendFeedbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "bug",
        email: "ada@example.com",
        message: "Something broke on the profile page.",
      }),
    )
  })

  it("forwards the page path when provided", async () => {
    await sendFeedback(validInput({ page: "/profile/123/gallery" }))

    expect(sendFeedbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: "/profile/123/gallery" }),
    )
  })

  it("forwards cvUrl for career submissions", async () => {
    const cvUrl = "https://qa.public.blob.vercel-storage.com/cv.pdf"
    await sendFeedback(validInput({ type: "career", cvUrl }))

    expect(sendFeedbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "career", cvUrl }),
    )
  })
})
