import { test, expect } from "@playwright/test"
import en from "../apps/bms/messages/en-US.json"
import pt from "../apps/bms/messages/pt-BR.json"

// Public, read-only smoke tests for the BMS sign-in page. They assert real
// translated strings (read straight from the message files) so they double as
// an end-to-end check that next-intl + the `locale` cookie resolve correctly.
test.describe("BMS sign-in (public smoke)", () => {
  test("renders the sign-in form", async ({ page }) => {
    await page.goto("/sign-in")
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.getByRole("button", { name: en.Auth.signIn })).toBeVisible()
  })

  test("localizes the UI via the `locale` cookie (pt-BR)", async ({ page, context }) => {
    await context.addCookies([{ name: "locale", value: "pt-BR", url: "http://localhost:3001" }])
    await page.goto("/sign-in")
    // The submit button text must come from pt-BR, not en-US.
    await expect(page.getByRole("button", { name: pt.Auth.signIn })).toBeVisible()
    await expect(page.getByRole("button", { name: en.Auth.signIn })).toHaveCount(0)
  })

  test("shows the localized not-found page for an unknown route", async ({ page }) => {
    await page.goto("/this-route-does-not-exist")
    await expect(page.getByText(en.NotFound.title)).toBeVisible()
  })
})
