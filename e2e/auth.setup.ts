import { test as setup, expect } from "@playwright/test"
import { E2E_USER } from "./test-user"

// Signs the seeded admin in ONCE via the real sign-in UI and saves the session
// cookie. The `authenticated` project replays this storageState, so CRUD specs
// don't each pay the login cost.
const authFile = "e2e/.auth/user.json"

setup("authenticate", async ({ page }) => {
  await page.goto("/sign-in")
  await page.locator('input[name="email"]').fill(E2E_USER.email)
  await page.locator('input[name="password"]').fill(E2E_USER.password)
  await page.locator('button[type="submit"]').click()

  // BMS redirects to /dashboard on success.
  await page.waitForURL("**/dashboard", { timeout: 30_000 })
  await expect(page).toHaveURL(/\/dashboard/)

  // Dismiss the cookie-consent banner so it never overlays clickable elements.
  await page.context().addCookies([
    { name: "cookie_consent", value: "accepted", url: "http://localhost:3001" },
  ])

  await page.context().storageState({ path: authFile })
})
