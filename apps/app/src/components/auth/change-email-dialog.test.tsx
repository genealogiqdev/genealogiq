// @vitest-environment happy-dom

import { act, type FormEvent } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ChangeEmailDialog } from "./change-email-dialog"
import { requestEmailChange } from "@/actions/auth.actions"

vi.mock("@/actions/auth.actions", () => ({ requestEmailChange: vi.fn() }))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function openInsideProfileForm() {
  // React Hook Form cancels the parent submit, including events bubbling from
  // a descendant portal. Keep that behavior in the regression fixture.
  const submitProfile = vi.fn((event: FormEvent) => event.preventDefault())
  await act(async () => {
    root.render(
      <form onSubmit={submitProfile}>
        <input name="firstName" defaultValue="Unsaved profile edit" />
        <ChangeEmailDialog />
      </form>,
    )
  })
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click())
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  // Exercise the real Dialog portal, not an invalid DOM-nested form mock.
  expect(container.contains(dialog)).toBe(false)
  dialog.querySelector<HTMLInputElement>('[name="newEmail"]')!.value = "new@example.test"
  dialog.querySelector<HTMLInputElement>('[name="currentPassword"]')!.value = "Current-password-123!"
  return { dialog, submitProfile }
}

describe("ChangeEmailDialog inside profile editing", () => {
  it("submits only the email action and leaves the profile draft unsaved", async () => {
    vi.mocked(requestEmailChange).mockResolvedValue({ ok: true, message: "Confirmation link sent" })
    const { dialog, submitProfile } = await openInsideProfileForm()

    await act(async () => dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click())

    expect(submitProfile).not.toHaveBeenCalled()
    expect(requestEmailChange).toHaveBeenCalledTimes(1)
    const [previousState, data] = vi.mocked(requestEmailChange).mock.calls[0]
    expect(previousState).toBeUndefined()
    expect(Object.fromEntries(data)).toEqual({
      newEmail: "new@example.test",
      currentPassword: "Current-password-123!",
    })
    expect(dialog.textContent).toContain("Confirmation link sent")
    expect(container.querySelector<HTMLInputElement>('[name="firstName"]')!.value).toBe("Unsaved profile edit")
  })

  it("shows the email action's password error without submitting the profile", async () => {
    vi.mocked(requestEmailChange).mockResolvedValue({
      ok: false,
      message: "Check the highlighted fields",
      fieldErrors: { currentPassword: ["Incorrect password"] },
    })
    const { dialog, submitProfile } = await openInsideProfileForm()

    await act(async () => dialog.querySelector<HTMLFormElement>("form")!.requestSubmit())

    expect(submitProfile).not.toHaveBeenCalled()
    expect(requestEmailChange).toHaveBeenCalledTimes(1)
    expect(dialog.textContent).toContain("Incorrect password")
    expect(dialog.querySelector('[name="currentPassword"]')!.getAttribute("aria-invalid")).toBe("true")
    expect(dialog.querySelector('[name="newEmail"]')!.getAttribute("aria-invalid")).toBe("false")
    expect(dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)
  })
})
